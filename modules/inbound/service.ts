import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateOnlyToDb, dbToDateOnly, toKstDateTimeLocal } from "@/lib/datetime";
import {
  changeStock,
  InsufficientStockError,
  isUniqueViolation,
  SIMILAR_WINDOW_MS,
} from "@/modules/stock/service";
import type { InboundConfirmInput, InboundCreateInput, InboundUpdateInput, InboundVoidInput } from "./validation";
import type { CurrentUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { adjustOrderLineProcessed, OrderLineLimitError } from "@/modules/order/lines";
import { auditRevision, recordAudit } from "@/modules/audit/service";
import { storageMismatchWarning } from "@/modules/warehouse/assign";
import { inactiveLocationMessage } from "@/modules/warehouse/active";
import { resolvePartner } from "@/modules/partner/service";
import { activeProductSearchWhere, PRODUCT_SEARCH_LIMIT } from "@/modules/product/service";

export class InboundError extends Error {}
/** 다른 사용자가 먼저 수정한 경우 */
export class InboundConflictError extends InboundError {}
/** 같은 요청(requestId)이 이미 처리된 경우 */
export class DuplicateInboundRequestError extends InboundError {
  constructor() {
    super("이미 처리된 요청입니다. (같은 입고가 두 번 저장되지 않도록 막았습니다)");
  }
}

/** 최근 10분 내 같은 상품·공급처·수량으로 등록된 입고 (유사 건 경고용) */
export async function findSimilarInbound(input: InboundCreateInput, now = new Date()) {
  return prisma.inbound.findFirst({
    where: {
      productId: input.productId,
      partnerId: input.partnerId,
      quantity: input.quantity,
      createdAt: { gte: new Date(now.getTime() - SIMILAR_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, quantity: true, partner: { select: { name: true } }, product: { select: { name: true } } },
  });
}

/** 보관 온도 경고: 지정한 위치의 창고 유형이 상품 분류와 다르면 문구 (위치 미지정·없는 위치는 null) */
export async function findInboundStorageWarning(input: InboundCreateInput): Promise<string | null> {
  if (!input.locationCode) return null;
  const [product, location] = await Promise.all([
    prisma.product.findUnique({ where: { id: input.productId }, select: { name: true, category: true } }),
    prisma.location.findUnique({
      where: { code: input.locationCode },
      select: { code: true, warehouse: { select: { name: true, storageType: true } } },
    }),
  ]);
  if (!product || !location) return null; // 존재 여부 오류는 등록 단계에서 안내
  return storageMismatchWarning(product, location);
}

/**
 * 입고 등록 (단일 트랜잭션)
 * 1) 같은 요청 확인  2) 상품 확인(확정 상품만)  3) 입고 기록 생성
 * 4) 관리자: 바로 확정 → 재고 증가 + 재고 이력 / 직원: 확정 대기(재고 변화 없음, 단가 저장 안 함)
 * 어느 단계든 실패하면 전체 롤백된다.
 */
export async function createInbound(input: InboundCreateInput, actor: CurrentUser) {
  try {
    return await createInboundTx(input, actor);
  } catch (e) {
    // 같은 requestId 가 동시에 들어와 unique 제약에 걸린 경우
    if (isUniqueViolation(e, "requestId")) throw new DuplicateInboundRequestError();
    throw e;
  }
}

async function createInboundTx(input: InboundCreateInput, actor: CurrentUser) {
  const confirmed = can(actor.role, "inbound.manage");
  return prisma.$transaction(async (tx) => {
    const dup = await tx.inbound.findUnique({
      where: { requestId: input.requestId },
      select: { id: true },
    });
    if (dup) throw new DuplicateInboundRequestError();

    const product = await tx.product.findUnique({
      where: { id: input.productId },
      select: { id: true, name: true, status: true, locationId: true },
    });
    if (!product) throw new InboundError("존재하지 않는 상품입니다.");
    if (product.status === "INACTIVE") throw new InboundError(`${product.name}은(는) 비활성(단종) 상품입니다. 상품등록에서 다시 사용으로 바꾼 뒤 입고하세요.`);
    if (product.status !== "ACTIVE") throw new InboundError(`${product.name}은(는) 아직 확정되지 않은 상품입니다. 관리자 확정 후 입고하세요.`);

    const partner = input.partnerId ? await resolvePartner(tx, input.partnerId, "SUPPLIER", { error: (m) => new InboundError(m) }) : null;

    const location = input.locationCode
      ? await tx.location.findUnique({ where: { code: input.locationCode }, select: { id: true } })
      : null;
    if (input.locationCode && !location) throw new InboundError(`존재하지 않는 위치코드입니다: ${input.locationCode}`);
    const inactive = location ? await inactiveLocationMessage(tx, location.id) : null;
    if (inactive) throw new InboundError(inactive);

    const unitCost = confirmed ? input.unitCost : null;
    const now = new Date();
    const inbound = await tx.inbound.create({
      data: {
        productId: input.productId,
        quantity: input.quantity,
        unitCost,
        partnerId: partner?.id ?? null,
        memo: input.memo,
        receivedAt: input.receivedAt,
        locationId: location?.id ?? null,
        expiryDate: input.expiryDate ? dateOnlyToDb(input.expiryDate) : null,
        requestId: input.requestId,
        status: confirmed ? "CONFIRMED" : "PENDING",
        createdById: actor.id,
        confirmedById: confirmed ? actor.id : null,
        confirmedAt: confirmed ? now : null,
      },
    });

    const r = confirmed
      ? await changeStock(tx, {
          productId: input.productId,
          delta: input.quantity,
          type: "INBOUND",
          inboundId: inbound.id,
          bucket: { locationId: location?.id ?? product.locationId, expiryDate: input.expiryDate },
        })
      : null;

    await recordAudit(tx, {
      category: "INBOUND",
      action: "INBOUND_CREATE",
      targetId: inbound.id,
      targetLabel: product.name,
      summary: `${product.name} ${input.quantity.toLocaleString()}개 입고${confirmed ? "" : " 등록(확정 대기)"}${partner ? ` (${partner.name})` : ""}`,
      detail: {
        quantity: input.quantity,
        ...(confirmed ? { unitCost } : {}),
        supplier: partner?.name ?? null,
        memo: input.memo,
        receivedAt: toKstDateTimeLocal(input.receivedAt).replace("T", " "),
        ...(input.expiryDate ? { expiryDate: input.expiryDate } : {}),
        ...(input.locationCode ? { location: input.locationCode } : {}),
        status: confirmed ? "확정" : "확정 대기",
        ...(r ? { afterStock: r.afterStock } : {}),
      },
    });

    return { inbound, productName: product.name, afterStock: r?.afterStock ?? null, confirmed };
  });
}

const CONFLICT = "다른 곳에서 먼저 처리되었습니다. 새로고침 후 다시 시도하세요.";

/** 입고 확정 (관리자): 대기 → 확정 + 재고 증가 */
export async function confirmInbound(input: InboundConfirmInput, actor: CurrentUser) {
  return prisma.$transaction(async (tx) => {
    const cur = await tx.inbound.findUnique({
      where: { id: input.inboundId },
      include: { product: { select: { name: true, locationId: true } }, partner: { select: { name: true } } },
    });
    if (!cur) throw new InboundError("존재하지 않는 입고 건입니다.");
    if (cur.status !== "PENDING") throw new InboundError("확정 대기 중인 입고만 확정할 수 있습니다.");

    const r0 = await tx.inbound.updateMany({
      where: { id: cur.id, status: "PENDING", version: input.version },
      data: {
        status: "CONFIRMED",
        unitCost: input.unitCost,
        confirmedById: actor.id,
        confirmedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (r0.count === 0) throw new InboundConflictError(CONFLICT);

    // 위치를 지정하지 않았으면 확정 시점의 상품 기본 보관위치
    const r = await changeStock(tx, {
      productId: cur.productId,
      delta: cur.quantity,
      type: "INBOUND",
      inboundId: cur.id,
      bucket: {
        locationId: cur.locationId ?? cur.product.locationId,
        expiryDate: cur.expiryDate ? dbToDateOnly(cur.expiryDate) : null,
      },
    });
    const creator = cur.createdById
      ? await tx.user.findUnique({ where: { id: cur.createdById }, select: { name: true, loginId: true } })
      : null;

    await recordAudit(tx, {
      category: "INBOUND",
      action: "INBOUND_CONFIRM",
      targetId: cur.id,
      targetLabel: cur.product.name,
      summary: `${cur.product.name} ${cur.quantity.toLocaleString()}개 입고 확정 (재고 +${cur.quantity.toLocaleString()})`,
      detail: {
        quantity: cur.quantity,
        unitCost: input.unitCost,
        supplier: cur.partner?.name ?? null,
        receivedAt: toKstDateTimeLocal(cur.receivedAt).replace("T", " "),
        afterStock: r.afterStock,
        ...(creator ? { createdBy: `${creator.name}(${creator.loginId})` } : {}),
      },
    });
    return { productName: cur.product.name, quantity: cur.quantity, afterStock: r.afterStock };
  });
}

/**
 * 확정 입고 취소 (관리자): 실제로 지우지 않고 '취소' 상태 + 입고 수량만큼 재고 차감(역이력)
 * - 재고가 이미 출고되어 부족하면 거부
 * - 발주에서 입고된 건이면 발주 품목의 입고 수량도 되돌림
 */
export async function cancelInbound(input: InboundVoidInput, actor: CurrentUser) {
  return prisma.$transaction(async (tx) => {
    const cur = await tx.inbound.findUnique({
      where: { id: input.inboundId },
      include: { product: { select: { name: true } }, partner: { select: { name: true } } },
    });
    if (!cur) throw new InboundError("존재하지 않는 입고 건입니다.");
    if (cur.status !== "CONFIRMED") throw new InboundError("확정된 입고만 취소할 수 있습니다. (대기 건은 삭제)");

    const r0 = await tx.inbound.updateMany({
      where: { id: cur.id, status: "CONFIRMED", version: input.version },
      data: {
        status: "CANCELLED",
        cancelledById: actor.id,
        cancelledAt: new Date(),
        cancelReason: input.reason,
        version: { increment: 1 },
      },
    });
    if (r0.count === 0) throw new InboundConflictError(CONFLICT);

    let afterStock: number;
    try {
      const r = await changeStock(tx, { productId: cur.productId, delta: -cur.quantity, type: "INBOUND_CANCEL", inboundId: cur.id });
      afterStock = r.afterStock;
    } catch (e) {
      if (e instanceof InsufficientStockError) {
        throw new InboundError(
          `재고가 부족해 입고를 취소할 수 없습니다. (현재고 ${e.currentStock.toLocaleString()}, 취소 수량 ${e.requested.toLocaleString()})`
        );
      }
      throw e;
    }
    if (cur.orderLineId) {
      try {
        await adjustOrderLineProcessed(tx, cur.orderLineId, -cur.quantity);
      } catch (e) {
        if (e instanceof OrderLineLimitError) throw new InboundError(e.message);
        throw e;
      }
    }

    await recordAudit(tx, {
      category: "INBOUND",
      action: "INBOUND_CANCEL",
      targetId: cur.id,
      targetLabel: cur.product.name,
      summary: `${cur.product.name} ${cur.quantity.toLocaleString()}개 입고 취소 (재고 -${cur.quantity.toLocaleString()}) — ${input.reason}`,
      detail: {
        quantity: cur.quantity,
        supplier: cur.partner?.name ?? null,
        receivedAt: toKstDateTimeLocal(cur.receivedAt).replace("T", " "),
        afterStock,
        reason: input.reason,
      },
    });
    return { productName: cur.product.name, quantity: cur.quantity, afterStock };
  });
}

/** 대기 입고 삭제 (관리자): 재고에 반영된 적이 없으므로 실제 삭제. 기록은 감사 로그에 남는다 */
export async function deletePendingInbound(input: InboundVoidInput) {
  return prisma.$transaction(async (tx) => {
    const cur = await tx.inbound.findUnique({
      where: { id: input.inboundId },
      include: {
        product: { select: { name: true } },
        partner: { select: { name: true } },
        createdBy: { select: { name: true, loginId: true } },
      },
    });
    if (!cur) throw new InboundError("존재하지 않는 입고 건입니다.");
    if (cur.status !== "PENDING") throw new InboundError("확정 대기 중인 입고만 삭제할 수 있습니다. (확정 건은 취소)");
    if (cur.version !== input.version) throw new InboundConflictError(CONFLICT);

    // 대기 중 수정 기록 → 입고 순서로 삭제 (대기 건은 재고 이력이 없음)
    await tx.inboundRevision.deleteMany({ where: { inboundId: cur.id } });
    const r = await tx.inbound.deleteMany({ where: { id: cur.id, status: "PENDING", version: input.version } });
    if (r.count === 0) throw new InboundConflictError(CONFLICT);

    await recordAudit(tx, {
      category: "INBOUND",
      action: "INBOUND_DELETE",
      targetId: cur.id,
      targetLabel: cur.product.name,
      summary: `${cur.product.name} ${cur.quantity.toLocaleString()}개 대기 입고 삭제 — ${input.reason}`,
      detail: {
        quantity: cur.quantity,
        supplier: cur.partner?.name ?? null,
        memo: cur.memo,
        receivedAt: toKstDateTimeLocal(cur.receivedAt).replace("T", " "),
        reason: input.reason,
        ...(cur.createdBy ? { createdBy: `${cur.createdBy.name}(${cur.createdBy.loginId})` } : {}),
      },
    });
    return { productName: cur.product.name, quantity: cur.quantity };
  });
}

type RevisionValues = Partial<{
  quantity: number;
  unitCost: number | null;
  supplier: string | null;
  memo: string | null;
  receivedAt: string; // ISO
}>;

/**
 * 입고 수정 (단일 트랜잭션)
 * 1) 현재 값 조회·버전 확인  2) 바뀐 항목 계산(없으면 거부)
 * 3) 버전 조건부 갱신(동시 수정 차단)  4) 수량 차이만큼 재고 증감 + 정정 이력 (재고 음수 불가, 조건부 차감)
 * 5) 수정 기록(InboundRevision) 저장
 */
export async function updateInbound(input: InboundUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const cur = await tx.inbound.findUnique({
      where: { id: input.inboundId },
      include: { product: { select: { name: true } }, partner: { select: { name: true } } },
    });
    if (!cur) throw new InboundError("존재하지 않는 입고 건입니다.");
    if (cur.status === "CANCELLED") throw new InboundError("취소된 입고는 수정할 수 없습니다.");
    if (cur.version !== input.version) {
      throw new InboundConflictError("다른 곳에서 먼저 수정되었습니다. 새로고침 후 다시 시도하세요.");
    }
    // 대기 건은 재고에 반영되지 않았으므로 수량이 바뀌어도 재고는 그대로 (확정 시 수정된 수량으로 반영)
    const affectsStock = cur.status === "CONFIRMED";

    // 화면 입력은 분 단위이므로 분 단위(KST)로 비교, 같으면 기존 값(초 포함) 유지
    const receivedAtChanged =
      toKstDateTimeLocal(cur.receivedAt) !== toKstDateTimeLocal(input.receivedAt);
    const receivedAt = receivedAtChanged ? input.receivedAt : cur.receivedAt;

    const before: RevisionValues = {};
    const after: RevisionValues = {};
    if (cur.quantity !== input.quantity) {
      before.quantity = cur.quantity;
      after.quantity = input.quantity;
    }
    if (cur.unitCost !== input.unitCost) {
      before.unitCost = cur.unitCost;
      after.unitCost = input.unitCost;
    }
    const partner = input.partnerId
      ? await resolvePartner(tx, input.partnerId, "SUPPLIER", { keepId: cur.partnerId, error: (m) => new InboundError(m) })
      : null;
    if (cur.partnerId !== (partner?.id ?? null)) {
      before.supplier = cur.partner?.name ?? null;
      after.supplier = partner?.name ?? null;
    }
    if (cur.memo !== input.memo) {
      before.memo = cur.memo;
      after.memo = input.memo;
    }
    if (receivedAtChanged) {
      before.receivedAt = cur.receivedAt.toISOString();
      after.receivedAt = input.receivedAt.toISOString();
    }
    if (Object.keys(after).length === 0) throw new InboundError("변경된 내용이 없습니다.");

    // 버전 조건부 갱신: 조회 이후 다른 수정이 끼어들었으면 0건 → 충돌
    const updated = await tx.inbound.updateMany({
      where: { id: cur.id, version: input.version },
      data: {
        quantity: input.quantity,
        unitCost: input.unitCost,
        partnerId: partner?.id ?? null,
        memo: input.memo,
        receivedAt,
        version: { increment: 1 },
      },
    });
    if (updated.count === 0) {
      throw new InboundConflictError("다른 곳에서 먼저 수정되었습니다. 새로고침 후 다시 시도하세요.");
    }

    const delta = input.quantity - cur.quantity;
    let stockMovementId: string | null = null;
    let afterStock: number | null = null;

    if (delta !== 0 && affectsStock) {
      try {
        const r = await changeStock(tx, {
          productId: cur.productId,
          delta,
          type: "INBOUND_CORRECTION",
          inboundId: cur.id,
        });
        stockMovementId = r.movement.id;
        afterStock = r.afterStock;
      } catch (e) {
        // throw → 트랜잭션 전체 롤백
        if (e instanceof InsufficientStockError) {
          throw new InboundError(
            `재고가 부족해 수량을 줄일 수 없습니다. (현재고 ${e.currentStock.toLocaleString()}, 감소 요청 ${e.requested.toLocaleString()})`
          );
        }
        throw e;
      }
      // 발주에서 입고된 건이면 발주 품목의 입고 수량도 함께 조정
      if (cur.orderLineId) {
        try {
          await adjustOrderLineProcessed(tx, cur.orderLineId, delta);
        } catch (e) {
          if (e instanceof OrderLineLimitError) throw new InboundError(e.message);
          throw e;
        }
      }
    }

    await tx.inboundRevision.create({
      data: {
        inboundId: cur.id,
        reason: input.reason,
        before: before as Prisma.InputJsonObject,
        after: after as Prisma.InputJsonObject,
        quantityDelta: affectsStock ? delta : 0, // 재고 증감량 (대기 건은 0)
        stockMovementId,
      },
    });

    await recordAudit(tx, {
      category: "INBOUND",
      action: "INBOUND_UPDATE",
      targetId: cur.id,
      targetLabel: cur.product.name,
      summary: `${cur.product.name} ${affectsStock ? "" : "대기 "}입고 수정${delta !== 0 && affectsStock ? ` (재고 ${delta > 0 ? "+" : ""}${delta.toLocaleString()})` : ""} — ${input.reason}`,
      detail: auditRevision(before, after, input.reason),
    });

    return {
      productName: cur.product.name,
      changedFields: Object.keys(after) as (keyof RevisionValues)[],
      quantityDelta: affectsStock ? delta : 0,
      afterStock,
    };
  });
}

/** 입고 가능한 상품 검색 (확정 상품만, 최대 PRODUCT_SEARCH_LIMIT 개 + 조건에 맞는 전체 개수) */
export async function searchProductsForInbound(keyword?: string) {
  const where = activeProductSearchWhere(keyword);
  const [rows, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        sku: true,
        name: true,
        category: true,
        stock: true,
        baseUnit: true,
        boxQty: true,
        location: { select: { code: true } },
      },
      orderBy: [{ category: "asc" }, { sku: "asc" }],
      take: PRODUCT_SEARCH_LIMIT,
    }),
    prisma.product.count({ where }),
  ]);
  return { rows, total };
}

const recentInboundInclude = {
  product: { select: { sku: true, name: true, baseUnit: true, stock: true } },
  partner: { select: { id: true, name: true } },
  createdBy: { select: { name: true } },
  // 원입고 시점의 재고 변동
  stockMovements: {
    where: { type: "INBOUND" },
    select: { beforeStock: true, afterStock: true },
    take: 1,
  },
  revisions: {
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { createdAt: true, reason: true, before: true, after: true },
  },
  _count: { select: { revisions: true } },
} satisfies Prisma.InboundInclude;

/** 확정 대기 입고 전부(최대 200건) + 최근 확정·취소 입고 limit 건 */
export async function listRecentInbounds(limit = 20) {
  const orderBy: Prisma.InboundOrderByWithRelationInput[] = [{ receivedAt: "desc" }, { createdAt: "desc" }];
  const [pending, recent] = await Promise.all([
    prisma.inbound.findMany({ where: { status: "PENDING" }, take: 200, orderBy, include: recentInboundInclude }),
    prisma.inbound.findMany({ where: { status: { not: "PENDING" } }, take: limit, orderBy, include: recentInboundInclude }),
  ]);
  return [...pending, ...recent];
}
