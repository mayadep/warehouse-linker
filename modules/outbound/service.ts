import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toKstDateTimeLocal } from "@/lib/datetime";
import {
  changeStock,
  InsufficientStockError,
  isUniqueViolation,
  SIMILAR_WINDOW_MS,
} from "@/modules/stock/service";
import type { OutboundCreateInput, OutboundUpdateInput } from "./validation";

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

/**
 * 출고 처리 (단일 트랜잭션)
 * 1) 같은 요청 확인  2) 상품 존재 확인  3) 출고 기록 생성
 * 4) 재고 조건부 차감(재고 < 수량이면 거부) + 재고 이력
 */
export async function createOutbound(input: OutboundCreateInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const dup = await tx.outbound.findUnique({
        where: { requestId: input.requestId },
        select: { id: true },
      });
      if (dup) throw new DuplicateOutboundRequestError();

      const product = await tx.product.findUnique({
        where: { id: input.productId },
        select: { id: true },
      });
      if (!product) throw new OutboundError("존재하지 않는 상품입니다.");

      const outbound = await tx.outbound.create({
        data: {
          productId: input.productId,
          quantity: input.quantity,
          unitPrice: input.unitPrice,
          customer: input.customer,
          memo: input.memo,
          shippedAt: input.shippedAt,
          requestId: input.requestId,
        },
      });

      try {
        const r = await changeStock(tx, {
          productId: input.productId,
          delta: -input.quantity,
          type: "OUTBOUND",
          outboundId: outbound.id,
        });
        return { outbound, productName: r.productName, afterStock: r.afterStock };
      } catch (e) {
        if (e instanceof InsufficientStockError) {
          throw new OutboundError(
            `재고가 부족해 출고할 수 없습니다. (현재고 ${e.currentStock.toLocaleString()}, 출고 요청 ${e.requested.toLocaleString()})`
          );
        }
        throw e;
      }
    });
  } catch (e) {
    if (isUniqueViolation(e, "requestId")) throw new DuplicateOutboundRequestError();
    throw e;
  }
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
    if (cur.version !== input.version) {
      throw new OutboundConflictError("다른 곳에서 먼저 수정되었습니다. 새로고침 후 다시 시도하세요.");
    }

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

    if (qtyDelta !== 0) {
      try {
        const r = await changeStock(tx, {
          productId: cur.productId,
          delta: -qtyDelta, // 출고가 늘면 재고 감소
          type: "OUTBOUND_CORRECTION",
          outboundId: cur.id,
        });
        stockMovementId = r.movement.id;
        afterStock = r.afterStock;
      } catch (e) {
        if (e instanceof InsufficientStockError) {
          throw new OutboundError(
            `재고가 부족해 출고 수량을 늘릴 수 없습니다. (현재고 ${e.currentStock.toLocaleString()}, 추가 출고 ${e.requested.toLocaleString()})`
          );
        }
        throw e;
      }
    }

    await tx.outboundRevision.create({
      data: {
        outboundId: cur.id,
        reason: input.reason,
        before: before as Prisma.InputJsonObject,
        after: after as Prisma.InputJsonObject,
        quantityDelta: qtyDelta,
        stockMovementId,
      },
    });

    return {
      productName: cur.product.name,
      changedFields: Object.keys(after) as (keyof RevisionValues)[],
      quantityDelta: qtyDelta,
      afterStock,
    };
  });
}

export async function listProductsForOutbound() {
  return prisma.product.findMany({
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

export async function listRecentOutbounds(limit = 20) {
  return prisma.outbound.findMany({
    take: limit,
    orderBy: [{ shippedAt: "desc" }, { createdAt: "desc" }],
    include: {
      product: { select: { sku: true, name: true, baseUnit: true, stock: true } },
      stockMovements: {
        where: { type: "OUTBOUND" },
        select: { beforeStock: true, afterStock: true },
        take: 1,
      },
      revisions: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { createdAt: true, reason: true, before: true, after: true },
      },
      _count: { select: { revisions: true } },
    },
  });
}
