import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateOnlyToDb, dbToDateOnly, toKstDateTimeLocal } from "@/lib/datetime";
import {
  BucketStockError,
  changeStock,
  InsufficientStockError,
  isUniqueViolation,
  SIMILAR_WINDOW_MS,
  type StockBucket,
} from "@/modules/stock/service";
import type { OutboundConfirmInput, OutboundCreateInput, OutboundUpdateInput, OutboundVoidInput } from "./validation";
import type { CurrentUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { adjustOrderLineProcessed, OrderLineLimitError } from "@/modules/order/lines";
import { auditRevision, recordAudit } from "@/modules/audit/service";

export class OutboundError extends Error {}
export class OutboundConflictError extends OutboundError {}
export class DuplicateOutboundRequestError extends OutboundError {
  constructor() {
    super("이미 처리된 요청입니다. (같은 출고가 두 번 저장되지 않도록 막았습니다)");
  }
}

/** 최근 10분 내 같은 상품·출고처·수량으로 등록된 출고 (유사 건 경고용) */
export async function findSimilarOutbound(input: OutboundCreateInput, now = new Date()) {
  return prisma.outbound.findFirst({
    where: {
      productId: input.productId,
      customer: input.customer,
      quantity: input.quantity,
      createdAt: { gte: new Date(now.getTime() - SIMILAR_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, quantity: true, customer: true, product: { select: { name: true } } },
  });
}

const insufficient = (e: InsufficientStockError, what: string) =>
  new OutboundError(
    `재고가 부족해 ${what}할 수 없습니다. (현재고 ${e.currentStock.toLocaleString()}, 출고 요청 ${e.requested.toLocaleString()})`
  );

/** 출고 위치 지정값 → Outbound 컬럼 (null = 자동) */
const pickData = (pick: StockBucket | null) => ({
  pickFixed: pick !== null,
  pickLocationId: pick?.locationId ?? null,
  pickExpiryDate: pick?.expiryDate ? dateOnlyToDb(pick.expiryDate) : null,
});

/** Outbound 컬럼 → 출고 위치 지정값 */
const pickOf = (o: { pickFixed: boolean; pickLocationId: string | null; pickExpiryDate: Date | null }): StockBucket | null =>
  o.pickFixed ? { locationId: o.pickLocationId, expiryDate: o.pickExpiryDate ? dbToDateOnly(o.pickExpiryDate) : null } : null;

/** 대기 출고 등록 시: 지정한 칸에 지금 수량이 있는지 (예약은 하지 않음, 확정 때 다시 확인) */
async function assertPickAvailable(tx: Prisma.TransactionClient, productId: string, pick: StockBucket, quantity: number) {
  const b = await tx.stockBalance.findFirst({
    where: {
      productId,
      locationId: pick.locationId,
      expiryDate: pick.expiryDate ? dateOnlyToDb(pick.expiryDate) : null,
    },
    select: { quantity: true, location: { select: { code: true } } },
  });
  if (!b || b.quantity < quantity) {
    const code = b?.location?.code ?? (pick.locationId ? (await tx.location.findUnique({ where: { id: pick.locationId }, select: { code: true } }))?.code : null);
    throw new OutboundError(new BucketStockError(code ?? "미지정", pick.expiryDate, b?.quantity ?? 0, quantity).message);
  }
}

/**
 * 출고 등록 (단일 트랜잭션)
 * 1) 같은 요청 확인  2) 상품 확인(확정 상품만)  3) 출고 기록 생성
 * 4) 관리자: 바로 확정 → 재고 조건부 차감(부족하면 거부) + 재고 이력
 *    직원: 확정 대기(재고 미차감, 단가 저장 안 함). 등록 시점 현재고보다 많으면 거부(예약은 하지 않음)
 */
export async function createOutbound(input: OutboundCreateInput, actor: CurrentUser) {
  const confirmed = can(actor.role, "outbound.manage");
  try {
    return await prisma.$transaction(async (tx) => {
      const dup = await tx.outbound.findUnique({
        where: { requestId: input.requestId },
        select: { id: true },
      });
      if (dup) throw new DuplicateOutboundRequestError();

      const product = await tx.product.findUnique({
        where: { id: input.productId },
        select: { id: true, name: true, status: true, stock: true },
      });
      if (!product) throw new OutboundError("존재하지 않는 상품입니다.");
      if (product.status !== "ACTIVE") throw new OutboundError("확정되지 않은 상품은 출고할 수 없습니다.");
      if (!confirmed && product.stock < input.quantity) {
        throw new OutboundError(
          `재고가 부족해 출고를 등록할 수 없습니다. (현재고 ${product.stock.toLocaleString()}, 출고 요청 ${input.quantity.toLocaleString()})`
        );
      }
      if (!confirmed && input.pick) await assertPickAvailable(tx, input.productId, input.pick, input.quantity);

      const unitPrice = confirmed ? input.unitPrice : null;
      const outbound = await tx.outbound.create({
        data: {
          productId: input.productId,
          quantity: input.quantity,
          unitPrice,
          customer: input.customer,
          memo: input.memo,
          shippedAt: input.shippedAt,
          ...pickData(input.pick),
          requestId: input.requestId,
          status: confirmed ? "CONFIRMED" : "PENDING",
          createdById: actor.id,
          confirmedById: confirmed ? actor.id : null,
          confirmedAt: confirmed ? new Date() : null,
        },
      });

      let afterStock: number | null = null;
      if (confirmed) {
        try {
          const r = await changeStock(tx, {
            productId: input.productId,
            delta: -input.quantity,
            type: "OUTBOUND",
            outboundId: outbound.id,
            bucket: input.pick ?? undefined,
            strict: input.pick !== null,
          });
          afterStock = r.afterStock;
        } catch (e) {
          if (e instanceof InsufficientStockError) throw insufficient(e, "출고");
          if (e instanceof BucketStockError) throw new OutboundError(e.message);
          throw e;
        }
      }

      await recordAudit(tx, {
        category: "OUTBOUND",
        action: "OUTBOUND_CREATE",
        targetId: outbound.id,
        targetLabel: product.name,
        summary: `${product.name} ${input.quantity.toLocaleString()}개 출고${confirmed ? "" : " 등록(확정 대기)"}${input.customer ? ` (${input.customer})` : ""}`,
        detail: {
          quantity: input.quantity,
          ...(confirmed ? { unitPrice } : {}),
          customer: input.customer,
          memo: input.memo,
          shippedAt: toKstDateTimeLocal(input.shippedAt).replace("T", " "),
          status: confirmed ? "확정" : "확정 대기",
          ...(afterStock !== null ? { afterStock } : {}),
        },
      });
      return { outbound, productName: product.name, afterStock, confirmed };
    });
  } catch (e) {
    if (isUniqueViolation(e, "requestId")) throw new DuplicateOutboundRequestError();
    throw e;
  }
}

const CONFLICT = "다른 곳에서 먼저 처리되었습니다. 새로고침 후 다시 시도하세요.";

/** 출고 확정 (관리자): 대기 → 확정 + 재고 차감 (부족하면 거부) */
export async function confirmOutbound(input: OutboundConfirmInput, actor: CurrentUser) {
  return prisma.$transaction(async (tx) => {
    const cur = await tx.outbound.findUnique({
      where: { id: input.outboundId },
      include: { product: { select: { name: true } }, createdBy: { select: { name: true, loginId: true } } },
    });
    if (!cur) throw new OutboundError("존재하지 않는 출고 건입니다.");
    if (cur.status !== "PENDING") throw new OutboundError("확정 대기 중인 출고만 확정할 수 있습니다.");

    // 출고 위치: 확정할 때 관리자가 고른 값(등록 때 지정값이 기본으로 채워짐)
    const r0 = await tx.outbound.updateMany({
      where: { id: cur.id, status: "PENDING", version: input.version },
      data: {
        status: "CONFIRMED",
        unitPrice: input.unitPrice,
        ...pickData(input.pick),
        confirmedById: actor.id,
        confirmedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (r0.count === 0) throw new OutboundConflictError(CONFLICT);

    let afterStock: number;
    try {
      const r = await changeStock(tx, {
        productId: cur.productId,
        delta: -cur.quantity,
        type: "OUTBOUND",
        outboundId: cur.id,
        bucket: input.pick ?? undefined,
        strict: input.pick !== null,
      });
      afterStock = r.afterStock;
    } catch (e) {
      if (e instanceof InsufficientStockError) throw insufficient(e, "출고 확정");
      if (e instanceof BucketStockError) throw new OutboundError(e.message);
      throw e;
    }

    await recordAudit(tx, {
      category: "OUTBOUND",
      action: "OUTBOUND_CONFIRM",
      targetId: cur.id,
      targetLabel: cur.product.name,
      summary: `${cur.product.name} ${cur.quantity.toLocaleString()}개 출고 확정 (재고 -${cur.quantity.toLocaleString()})`,
      detail: {
        quantity: cur.quantity,
        unitPrice: input.unitPrice,
        customer: cur.customer,
        shippedAt: toKstDateTimeLocal(cur.shippedAt).replace("T", " "),
        afterStock,
        ...(cur.createdBy ? { createdBy: `${cur.createdBy.name}(${cur.createdBy.loginId})` } : {}),
      },
    });
    return { productName: cur.product.name, quantity: cur.quantity, afterStock };
  });
}

/**
 * 확정 출고 취소 (관리자): 실제로 지우지 않고 '취소' 상태 + 출고 수량만큼 재고 복원(역이력)
 * - 배차에 실린 출고는 배차에서 먼저 빼야 함
 * - 수주에서 출고된 건이면 수주 품목의 출고 수량도 되돌림
 */
export async function cancelOutbound(input: OutboundVoidInput, actor: CurrentUser) {
  return prisma.$transaction(async (tx) => {
    const cur = await tx.outbound.findUnique({
      where: { id: input.outboundId },
      include: {
        product: { select: { name: true } },
        dispatchItem: { select: { dispatch: { select: { dispatchNo: true } } } },
      },
    });
    if (!cur) throw new OutboundError("존재하지 않는 출고 건입니다.");
    if (cur.status !== "CONFIRMED") throw new OutboundError("확정된 출고만 취소할 수 있습니다. (대기 건은 삭제)");
    if (cur.dispatchItem) {
      throw new OutboundError(
        `배차 ${cur.dispatchItem.dispatch.dispatchNo}에 실린 출고입니다. 배차관리에서 빼거나 배차를 취소한 뒤 출고를 취소하세요.`
      );
    }

    const r0 = await tx.outbound.updateMany({
      where: { id: cur.id, status: "CONFIRMED", version: input.version },
      data: {
        status: "CANCELLED",
        cancelledById: actor.id,
        cancelledAt: new Date(),
        cancelReason: input.reason,
        version: { increment: 1 },
      },
    });
    if (r0.count === 0) throw new OutboundConflictError(CONFLICT);

    const r = await changeStock(tx, { productId: cur.productId, delta: cur.quantity, type: "OUTBOUND_CANCEL", outboundId: cur.id });
    if (cur.orderLineId) {
      try {
        await adjustOrderLineProcessed(tx, cur.orderLineId, -cur.quantity);
      } catch (e) {
        if (e instanceof OrderLineLimitError) throw new OutboundError(e.message);
        throw e;
      }
    }

    await recordAudit(tx, {
      category: "OUTBOUND",
      action: "OUTBOUND_CANCEL",
      targetId: cur.id,
      targetLabel: cur.product.name,
      summary: `${cur.product.name} ${cur.quantity.toLocaleString()}개 출고 취소 (재고 +${cur.quantity.toLocaleString()}) — ${input.reason}`,
      detail: {
        quantity: cur.quantity,
        customer: cur.customer,
        shippedAt: toKstDateTimeLocal(cur.shippedAt).replace("T", " "),
        afterStock: r.afterStock,
        reason: input.reason,
      },
    });
    return { productName: cur.product.name, quantity: cur.quantity, afterStock: r.afterStock };
  });
}

/** 대기 출고 삭제 (관리자): 재고에 반영된 적이 없으므로 실제 삭제. 기록은 감사 로그에 남는다 */
export async function deletePendingOutbound(input: OutboundVoidInput) {
  return prisma.$transaction(async (tx) => {
    const cur = await tx.outbound.findUnique({
      where: { id: input.outboundId },
      include: { product: { select: { name: true } }, createdBy: { select: { name: true, loginId: true } } },
    });
    if (!cur) throw new OutboundError("존재하지 않는 출고 건입니다.");
    if (cur.status !== "PENDING") throw new OutboundError("확정 대기 중인 출고만 삭제할 수 있습니다. (확정 건은 취소)");
    if (cur.version !== input.version) throw new OutboundConflictError(CONFLICT);

    // 대기 중 수정 기록 → 출고 순서로 삭제 (대기 건은 재고 이력·배차가 없음)
    await tx.outboundRevision.deleteMany({ where: { outboundId: cur.id } });
    const r = await tx.outbound.deleteMany({ where: { id: cur.id, status: "PENDING", version: input.version } });
    if (r.count === 0) throw new OutboundConflictError(CONFLICT);

    await recordAudit(tx, {
      category: "OUTBOUND",
      action: "OUTBOUND_DELETE",
      targetId: cur.id,
      targetLabel: cur.product.name,
      summary: `${cur.product.name} ${cur.quantity.toLocaleString()}개 대기 출고 삭제 — ${input.reason}`,
      detail: {
        quantity: cur.quantity,
        customer: cur.customer,
        memo: cur.memo,
        shippedAt: toKstDateTimeLocal(cur.shippedAt).replace("T", " "),
        reason: input.reason,
        ...(cur.createdBy ? { createdBy: `${cur.createdBy.name}(${cur.createdBy.loginId})` } : {}),
      },
    });
    return { productName: cur.product.name, quantity: cur.quantity };
  });
}

type RevisionValues = Partial<{
  quantity: number;
  unitPrice: number | null;
  customer: string | null;
  memo: string | null;
  shippedAt: string; // ISO
}>;

/**
 * 출고 수정 (단일 트랜잭션)
 * 출고 수량이 늘면 재고 추가 차감(부족하면 거부), 줄면 재고 복원. 정정 이력 + 수정 기록 저장.
 */
export async function updateOutbound(input: OutboundUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const cur = await tx.outbound.findUnique({
      where: { id: input.outboundId },
      include: { product: { select: { name: true } } },
    });
    if (!cur) throw new OutboundError("존재하지 않는 출고 건입니다.");
    if (cur.status === "CANCELLED") throw new OutboundError("취소된 출고는 수정할 수 없습니다.");
    if (cur.version !== input.version) {
      throw new OutboundConflictError("다른 곳에서 먼저 수정되었습니다. 새로고침 후 다시 시도하세요.");
    }
    // 대기 건은 재고에 반영되지 않았으므로 수량이 바뀌어도 재고는 그대로 (확정 시 수정된 수량으로 차감)
    const affectsStock = cur.status === "CONFIRMED";

    const shippedAtChanged =
      toKstDateTimeLocal(cur.shippedAt) !== toKstDateTimeLocal(input.shippedAt);
    const shippedAt = shippedAtChanged ? input.shippedAt : cur.shippedAt;

    const before: RevisionValues = {};
    const after: RevisionValues = {};
    if (cur.quantity !== input.quantity) {
      before.quantity = cur.quantity;
      after.quantity = input.quantity;
    }
    if (cur.unitPrice !== input.unitPrice) {
      before.unitPrice = cur.unitPrice;
      after.unitPrice = input.unitPrice;
    }
    if (cur.customer !== input.customer) {
      before.customer = cur.customer;
      after.customer = input.customer;
    }
    if (cur.memo !== input.memo) {
      before.memo = cur.memo;
      after.memo = input.memo;
    }
    if (shippedAtChanged) {
      before.shippedAt = cur.shippedAt.toISOString();
      after.shippedAt = input.shippedAt.toISOString();
    }
    if (Object.keys(after).length === 0) throw new OutboundError("변경된 내용이 없습니다.");

    const updated = await tx.outbound.updateMany({
      where: { id: cur.id, version: input.version },
      data: {
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        customer: input.customer,
        memo: input.memo,
        shippedAt,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new OutboundConflictError("다른 곳에서 먼저 수정되었습니다. 새로고침 후 다시 시도하세요.");
    }

    const qtyDelta = input.quantity - cur.quantity; // 출고 수량 차이
    let stockMovementId: string | null = null;
    let afterStock: number | null = null;

    if (qtyDelta !== 0 && affectsStock) {
      try {
        // 출고 위치를 지정한 출고는 늘어난 수량도 그 칸에서만
        const pick = qtyDelta > 0 ? pickOf(cur) : null;
        const r = await changeStock(tx, {
          productId: cur.productId,
          delta: -qtyDelta, // 출고가 늘면 재고 감소
          type: "OUTBOUND_CORRECTION",
          outboundId: cur.id,
          bucket: pick ?? undefined,
          strict: pick !== null,
        });
        stockMovementId = r.movement.id;
        afterStock = r.afterStock;
      } catch (e) {
        if (e instanceof InsufficientStockError) {
          throw new OutboundError(
            `재고가 부족해 출고 수량을 늘릴 수 없습니다. (현재고 ${e.currentStock.toLocaleString()}, 추가 출고 ${e.requested.toLocaleString()})`
          );
        }
        if (e instanceof BucketStockError) throw new OutboundError(e.message);
        throw e;
      }
      // 수주에서 출고된 건이면 수주 품목의 출고 수량도 함께 조정
      if (cur.orderLineId) {
        try {
          await adjustOrderLineProcessed(tx, cur.orderLineId, qtyDelta);
        } catch (e) {
          if (e instanceof OrderLineLimitError) throw new OutboundError(e.message);
          throw e;
        }
      }
    }

    await tx.outboundRevision.create({
      data: {
        outboundId: cur.id,
        reason: input.reason,
        before: before as Prisma.InputJsonObject,
        after: after as Prisma.InputJsonObject,
        quantityDelta: affectsStock ? qtyDelta : 0, // 대기 건은 재고 영향 없음
        stockMovementId,
      },
    });

    await recordAudit(tx, {
      category: "OUTBOUND",
      action: "OUTBOUND_UPDATE",
      targetId: cur.id,
      targetLabel: cur.product.name,
      summary: `${cur.product.name} ${affectsStock ? "" : "대기 "}출고 수정${qtyDelta !== 0 && affectsStock ? ` (재고 ${qtyDelta < 0 ? "+" : "-"}${Math.abs(qtyDelta).toLocaleString()})` : ""} — ${input.reason}`,
      detail: auditRevision(before, after, input.reason),
    });

    return {
      productName: cur.product.name,
      changedFields: Object.keys(after) as (keyof RevisionValues)[],
      quantityDelta: affectsStock ? qtyDelta : 0,
      afterStock,
    };
  });
}

export async function listProductsForOutbound() {
  return prisma.product.findMany({
    where: { status: "ACTIVE" }, // 확정 상품만
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      stock: true,
      price: true,
      baseUnit: true,
      location: { select: { code: true } },
    },
    orderBy: [{ category: "asc" }, { sku: "asc" }],
  });
}

/** 출고처 자동완성용 (최근 사용 순) */
export async function listRecentCustomers(limit = 30) {
  const rows = await prisma.outbound.groupBy({
    by: ["customer"],
    where: { customer: { not: null } },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
    take: limit,
  });
  return rows.map((r) => r.customer).filter((c): c is string => !!c);
}

const recentOutboundInclude = {
  product: { select: { sku: true, name: true, baseUnit: true, stock: true, price: true } },
  createdBy: { select: { name: true } },
  dispatchItem: { select: { dispatch: { select: { dispatchNo: true } } } },
  pickLocation: { select: { code: true } },
  // 원출고 시점의 재고 변동 (여러 칸에서 나갔으면 칸마다 1건 → 화면에서 합침)
  stockMovements: {
    where: { type: "OUTBOUND" },
    select: { beforeStock: true, afterStock: true },
  },
  revisions: {
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { createdAt: true, reason: true, before: true, after: true },
  },
  _count: { select: { revisions: true } },
} satisfies Prisma.OutboundInclude;

/** 확정 대기 출고 전부(최대 200건) + 최근 확정·취소 출고 limit 건 */
export async function listRecentOutbounds(limit = 20) {
  const orderBy: Prisma.OutboundOrderByWithRelationInput[] = [{ shippedAt: "desc" }, { createdAt: "desc" }];
  const [pending, recent] = await Promise.all([
    prisma.outbound.findMany({ where: { status: "PENDING" }, take: 200, orderBy, include: recentOutboundInclude }),
    prisma.outbound.findMany({ where: { status: { not: "PENDING" } }, take: limit, orderBy, include: recentOutboundInclude }),
  ]);
  return [...pending, ...recent];
}
