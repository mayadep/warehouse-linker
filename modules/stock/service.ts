import type { Prisma, StockMovementType } from "@prisma/client";

/** 재고 부족 (차감 후 음수가 되는 경우) */
export class InsufficientStockError extends Error {
  constructor(
    public readonly currentStock: number,
    public readonly requested: number
  ) {
    super(`재고가 부족합니다. (현재고 ${currentStock.toLocaleString()}, 필요 ${requested.toLocaleString()})`);
  }
}

/** 같은 상품·거래처·수량 유사 건 확인 기간 */
export const SIMILAR_WINDOW_MS = 10 * 60 * 1000;

/**
 * 재고 증감 + 재고 이력 기록. 반드시 호출자의 트랜잭션(tx) 안에서 실행한다.
 * - 차감(delta < 0)은 `stock >= 차감량` 조건부 UPDATE 로 원자적으로 처리 → 동시 요청에도 음수 불가
 * - 증가(delta > 0)는 increment (행 잠금으로 누락 없음)
 * - DB CHECK(stock >= 0) 가 최종 안전장치
 */
export async function changeStock(
  tx: Prisma.TransactionClient,
  args: {
    productId: string;
    delta: number;
    type: StockMovementType;
    inboundId?: string;
    outboundId?: string;
  }
) {
  const { productId, delta } = args;
  if (!Number.isInteger(delta) || delta === 0) throw new Error("재고 변경 수량이 올바르지 않습니다.");

  if (delta < 0) {
    const r = await tx.product.updateMany({
      where: { id: productId, stock: { gte: -delta } },
      data: { stock: { decrement: -delta } },
    });
    if (r.count === 0) {
      const p = await tx.product.findUnique({ where: { id: productId }, select: { stock: true } });
      if (!p) throw new Error("존재하지 않는 상품입니다.");
      throw new InsufficientStockError(p.stock, -delta);
    }
  } else {
    await tx.product.update({
      where: { id: productId },
      data: { stock: { increment: delta } },
    });
  }

  // 위 UPDATE 로 행이 잠겨 있으므로 이 값이 이번 변경 직후의 재고
  const p = await tx.product.findUniqueOrThrow({
    where: { id: productId },
    select: { stock: true, name: true },
  });

  const movement = await tx.stockMovement.create({
    data: {
      productId,
      type: args.type,
      quantity: delta,
      beforeStock: p.stock - delta,
      afterStock: p.stock,
      inboundId: args.inboundId,
      outboundId: args.outboundId,
    },
  });

  return { movement, afterStock: p.stock, productName: p.name };
}

/** unique 제약 위반(P2002)이 특정 컬럼 때문인지 */
export function isUniqueViolation(e: unknown, field: string): boolean {
  if (typeof e !== "object" || e === null) return false;
  const err = e as { code?: string; meta?: { target?: unknown } };
  if (err.code !== "P2002") return false;
  const t = err.meta?.target;
  return Array.isArray(t) ? t.includes(field) : typeof t === "string" ? t.includes(field) : true;
}
