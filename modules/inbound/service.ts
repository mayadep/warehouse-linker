import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toKstDateTimeLocal } from "@/lib/datetime";
import {
  changeStock,
  InsufficientStockError,
  isUniqueViolation,
  SIMILAR_WINDOW_MS,
} from "@/modules/stock/service";
import type { InboundCreateInput, InboundUpdateInput } from "./validation";

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
      supplier: input.supplier,
      quantity: input.quantity,
      createdAt: { gte: new Date(now.getTime() - SIMILAR_WINDOW_MS) },
    },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true, quantity: true, supplier: true, product: { select: { name: true } } },
  });
}

/**
 * 입고 처리 (단일 트랜잭션)
 * 1) 같은 요청 확인  2) 상품 존재 확인  3) 입고 기록 생성  4) 재고 증가 + 재고 이력
 * 어느 단계든 실패하면 전체 롤백된다.
 */
export async function createInbound(input: InboundCreateInput) {
  try {
    return await createInboundTx(input);
  } catch (e) {
    // 같은 requestId 가 동시에 들어와 unique 제약에 걸린 경우
    if (isUniqueViolation(e, "requestId")) throw new DuplicateInboundRequestError();
    throw e;
  }
}

async function createInboundTx(input: InboundCreateInput) {
  return prisma.$transaction(async (tx) => {
    const dup = await tx.inbound.findUnique({
      where: { requestId: input.requestId },
      select: { id: true },
    });
    if (dup) throw new DuplicateInboundRequestError();

    const product = await tx.product.findUnique({
      where: { id: input.productId },
      select: { id: true },
    });
    if (!product) throw new InboundError("존재하지 않는 상품입니다.");

    const inbound = await tx.inbound.create({
      data: {
        productId: input.productId,
        quantity: input.quantity,
        unitCost: input.unitCost,
        supplier: input.supplier,
        memo: input.memo,
        receivedAt: input.receivedAt,
        requestId: input.requestId,
      },
    });

    const r = await changeStock(tx, {
      productId: input.productId,
      delta: input.quantity,
      type: "INBOUND",
      inboundId: inbound.id,
    });

    return { inbound, productName: r.productName, afterStock: r.afterStock };
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
      include: { product: { select: { name: true } } },
    });
    if (!cur) throw new InboundError("존재하지 않는 입고 건입니다.");
    if (cur.version !== input.version) {
      throw new InboundConflictError("다른 곳에서 먼저 수정되었습니다. 새로고침 후 다시 시도하세요.");
    }

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
    if (cur.supplier !== input.supplier) {
      before.supplier = cur.supplier;
      after.supplier = input.supplier;
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
        supplier: input.supplier,
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

    if (delta !== 0) {
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
    }

    await tx.inboundRevision.create({
      data: {
        inboundId: cur.id,
        reason: input.reason,
        before: before as Prisma.InputJsonObject,
        after: after as Prisma.InputJsonObject,
        quantityDelta: delta,
        stockMovementId,
      },
    });

    return {
      productName: cur.product.name,
      changedFields: Object.keys(after) as (keyof RevisionValues)[],
      quantityDelta: delta,
      afterStock,
    };
  });
}

export async function listProductsForInbound() {
  return prisma.product.findMany({
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      stock: true,
      location: { select: { code: true } },
    },
    orderBy: [{ category: "asc" }, { sku: "asc" }],
  });
}

export async function listRecentInbounds(limit = 20) {
  return prisma.inbound.findMany({
    take: limit,
    orderBy: [{ receivedAt: "desc" }, { createdAt: "desc" }],
    include: {
      product: { select: { sku: true, name: true, baseUnit: true, stock: true } },
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
    },
  });
}
