// 주문 품목 처리수량 조정 + 주문 상태 재계산 (트랜잭션 클라이언트를 받아 동작 → 입고/출고 모듈에서도 사용)
import type { Prisma, TradeOrderStatus } from "@prisma/client";

export class OrderLineLimitError extends Error {}

/** 주문 상태 다시 계산 (종결·취소된 주문은 그대로) */
export async function refreshOrderStatus(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.tradeOrder.findUniqueOrThrow({
    where: { id: orderId },
    select: { status: true, lines: { select: { quantity: true, processedQty: true } } },
  });
  if (order.status === "CLOSED" || order.status === "CANCELLED") return order.status;
  const all = order.lines.every((l) => l.processedQty >= l.quantity);
  const any = order.lines.some((l) => l.processedQty > 0);
  const status: TradeOrderStatus = all ? "DONE" : any ? "PARTIAL" : "OPEN";
  if (status !== order.status) {
    await tx.tradeOrder.update({ where: { id: orderId }, data: { status, version: { increment: 1 } } });
  }
  return status;
}

/**
 * 처리수량 증감 (입고/출고 수량 수정 시). 0 미만이나 주문 수량 초과가 되면 거부.
 * 조건부 UPDATE 라서 동시 처리에도 범위를 벗어나지 않는다.
 */
export async function adjustOrderLineProcessed(tx: Prisma.TransactionClient, lineId: string, delta: number) {
  if (delta === 0) return;
  const rows = await tx.$queryRaw<{ orderId: string }[]>`
    UPDATE "TradeOrderLine"
    SET "processedQty" = "processedQty" + ${delta}
    WHERE "id" = ${lineId}
      AND "processedQty" + ${delta} >= 0
      AND "processedQty" + ${delta} <= "quantity"
    RETURNING "orderId"`;
  if (rows.length === 0) {
    const line = await tx.tradeOrderLine.findUnique({
      where: { id: lineId },
      select: { quantity: true, processedQty: true, order: { select: { orderNo: true } } },
    });
    if (!line) throw new OrderLineLimitError("연결된 주문 품목을 찾을 수 없습니다.");
    throw new OrderLineLimitError(
      `주문 ${line.order.orderNo}의 수량 범위를 벗어납니다. (주문 ${line.quantity.toLocaleString()}, 처리 ${line.processedQty.toLocaleString()}, 변경 ${delta > 0 ? "+" : ""}${delta.toLocaleString()})`
    );
  }
  await refreshOrderStatus(tx, rows[0].orderId);
}
