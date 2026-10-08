import "server-only";
import type { Prisma, TradeOrderStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { nextDocNumber } from "@/lib/doc-number";
import { changeStock, InsufficientStockError, isUniqueViolation } from "@/modules/stock/service";
import { dateOnlyToDb, toKstDate, toKstDateTimeLocal } from "@/lib/datetime";
import { storageMismatchWarning } from "@/modules/warehouse/assign";
import { inactiveLocationMessage } from "@/modules/warehouse/active";
import { recordAudit } from "@/modules/audit/service";
import { resolvePartner } from "@/modules/partner/service";
import {
  ORDER_PREFIX,
  ORDER_PROCESS_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_TYPE_LABELS,
  type OrderStatusCode,
  type OrderTypeCode,
} from "./codes";
import { refreshOrderStatus } from "./lines";
import type { OrderCreateInput, OrderProcessInput } from "./validation";

export class OrderError extends Error {}

const TX = { timeout: 30_000 };

/** 발주/수주 등록 */
export async function createOrder(input: OrderCreateInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const dup = await tx.tradeOrder.findUnique({ where: { requestId: input.requestId }, select: { orderNo: true } });
      if (dup) throw new OrderError(`이미 처리된 요청입니다. (${dup.orderNo})`);

      const ids = input.lines.map((l) => l.productId);
      const products = await tx.product.findMany({
        where: { id: { in: ids }, status: "ACTIVE" },
        select: { id: true, name: true },
      });
      if (products.length !== ids.length) throw new OrderError("존재하지 않거나 확정되지 않았거나 비활성인 상품이 포함되어 있습니다.");
      const nameOf = new Map(products.map((p) => [p.id, p.name]));

      const orderNo = await nextDocNumber(tx, ORDER_PREFIX[input.type], async (head) => {
        const last = await tx.tradeOrder.findFirst({
          where: { orderNo: { startsWith: head } },
          orderBy: { orderNo: "desc" },
          select: { orderNo: true },
        });
        return last?.orderNo ?? null;
      });

      const partner = await resolvePartner(tx, input.partnerId, input.type === "PURCHASE" ? "SUPPLIER" : "CUSTOMER", {
        error: (m) => new OrderError(m),
      });
      const created = await tx.tradeOrder.create({
        data: {
          type: input.type,
          orderNo,
          partnerId: partner.id,
          dueDate: input.dueDate,
          memo: input.memo,
          requestId: input.requestId,
          lines: {
            create: input.lines.map((l, i) => ({
              seq: i + 1,
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
            })),
          },
        },
        select: { id: true, orderNo: true },
      });
      const typeLabel = ORDER_TYPE_LABELS[input.type];
      await recordAudit(tx, {
        category: "ORDER",
        action: "ORDER_CREATE",
        targetId: created.id,
        targetLabel: orderNo,
        summary: `${typeLabel} 등록: ${orderNo} ${partner.name} (품목 ${input.lines.length}개)`,
        detail: {
          orderNo,
          partner: partner.name,
          dueDate: input.dueDate ? toKstDate(input.dueDate) : null,
          lines: input.lines
            .map((l) => `${nameOf.get(l.productId)} ${l.quantity.toLocaleString()}${l.unitPrice !== null ? ` @${l.unitPrice.toLocaleString()}` : ""}`)
            .join(", "),
          memo: input.memo,
        },
      });
      return created;
    }, TX);
  } catch (e) {
    if (isUniqueViolation(e, "requestId")) throw new OrderError("이미 처리된 요청입니다.");
    throw e;
  }
}

async function lockOrder(tx: Prisma.TransactionClient, orderId: string) {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "TradeOrder" WHERE "id" = ${orderId} FOR UPDATE`;
  if (rows.length === 0) throw new OrderError("존재하지 않는 주문입니다.");
}

/**
 * 발주 입고 보관 온도 경고: 품목별 지정 위치의 창고 유형이 상품 분류와 다르면 문구 (확인한 위치코드는 제외)
 * 위치 미지정·없는 위치는 건너뜀 (없는 위치 오류는 처리 단계에서 안내)
 */
export async function findOrderStorageWarnings(input: OrderProcessInput): Promise<{ warnings: string[]; codes: string[] }> {
  const targets = input.lines.filter((l) => l.locationCode && !input.confirmedLocationCodes.includes(l.locationCode));
  if (targets.length === 0) return { warnings: [], codes: [] };
  const [lines, locations] = await Promise.all([
    prisma.tradeOrderLine.findMany({
      where: { id: { in: targets.map((l) => l.lineId) }, order: { id: input.orderId, type: "PURCHASE" } },
      select: { id: true, product: { select: { name: true, category: true } } },
    }),
    prisma.location.findMany({
      where: { code: { in: targets.map((l) => l.locationCode!) } },
      select: { code: true, warehouse: { select: { name: true, storageType: true } } },
    }),
  ]);
  const warnings: string[] = [];
  const codes = new Set<string>();
  for (const t of targets) {
    const line = lines.find((l) => l.id === t.lineId);
    const loc = locations.find((l) => l.code === t.locationCode);
    const w = line && loc ? storageMismatchWarning(line.product, loc) : null;
    if (w) {
      warnings.push(w);
      codes.add(loc!.code);
    }
  }
  return { warnings, codes: [...codes] };
}

/**
 * 발주 → 입고 / 수주 → 출고 처리 (단일 트랜잭션)
 * - 주문 행 잠금 + version 확인 (동시 처리·화면이 오래된 경우 거부)
 * - 품목별 남은 수량 이하만 처리
 * - 품목마다 입고/출고 기록 + 재고 변경(출고는 재고 부족 시 전체 취소) + 처리수량 증가
 * - 발주 입고는 품목별 위치(비우면 기본 보관위치)·유통기한(비우면 미상) 칸에 넣는다
 * - 요청키(requestId:lineId)로 같은 요청 이중 처리 차단
 */
export async function processOrder(input: OrderProcessInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      await lockOrder(tx, input.orderId);
      const order = await tx.tradeOrder.findUniqueOrThrow({
        where: { id: input.orderId },
        include: { partner: { select: { name: true } }, lines: { include: { product: { select: { name: true, locationId: true } } } } },
      });
      if (order.status !== "OPEN" && order.status !== "PARTIAL") {
        throw new OrderError("완료·종결·취소된 주문은 처리할 수 없습니다.");
      }
      if (order.version !== input.version) {
        throw new OrderError("그 사이 주문 내용이 바뀌었습니다. 새로고침 후 다시 시도하세요.");
      }

      const keyOf = (lineId: string) => `${input.requestId}:${lineId}`;
      const firstKey = keyOf(input.lines[0].lineId);
      const already =
        order.type === "PURCHASE"
          ? await tx.inbound.findUnique({ where: { requestId: firstKey }, select: { id: true } })
          : await tx.outbound.findUnique({ where: { requestId: firstKey }, select: { id: true } });
      if (already) throw new OrderError("이미 처리된 요청입니다.");

      let totalQty = 0;
      const done: string[] = [];
      for (const req of input.lines) {
        const line = order.lines.find((l) => l.id === req.lineId);
        if (!line) throw new OrderError("이 주문에 없는 품목이 포함되어 있습니다.");
        const remaining = line.quantity - line.processedQty;
        if (req.quantity > remaining) {
          throw new OrderError(
            `${line.product.name}: 남은 수량(${remaining.toLocaleString()})보다 많이 처리할 수 없습니다.`
          );
        }

        if (order.type === "PURCHASE") {
          const location = req.locationCode
            ? await tx.location.findUnique({ where: { code: req.locationCode }, select: { id: true } })
            : null;
          if (req.locationCode && !location) {
            throw new OrderError(`${line.product.name}: 존재하지 않는 위치코드입니다: ${req.locationCode}`);
          }
          const inactive = location ? await inactiveLocationMessage(tx, location.id) : null;
          if (inactive) throw new OrderError(`${line.product.name}: ${inactive}`);
          const ib = await tx.inbound.create({
            data: {
              productId: line.productId,
              quantity: req.quantity,
              unitCost: line.unitPrice,
              partnerId: order.partnerId,
              memo: input.memo ?? `발주 ${order.orderNo}`,
              receivedAt: input.at,
              requestId: keyOf(line.id),
              orderLineId: line.id,
              locationId: location?.id ?? null,
              expiryDate: req.expiryDate ? dateOnlyToDb(req.expiryDate) : null,
            },
          });
          await changeStock(tx, {
            productId: line.productId,
            delta: req.quantity,
            type: "INBOUND",
            inboundId: ib.id,
            bucket: { locationId: location?.id ?? line.product.locationId, expiryDate: req.expiryDate },
          });
        } else {
          const ob = await tx.outbound.create({
            data: {
              productId: line.productId,
              quantity: req.quantity,
              unitPrice: line.unitPrice,
              partnerId: order.partnerId,
              memo: input.memo ?? `수주 ${order.orderNo}`,
              shippedAt: input.at,
              requestId: keyOf(line.id),
              orderLineId: line.id,
            },
          });
          try {
            await changeStock(tx, { productId: line.productId, delta: -req.quantity, type: "OUTBOUND", outboundId: ob.id });
          } catch (e) {
            if (e instanceof InsufficientStockError) {
              throw new OrderError(
                `${line.product.name}: 재고가 부족합니다. (현재고 ${e.currentStock.toLocaleString()}, 출고 요청 ${e.requested.toLocaleString()})`
              );
            }
            throw e;
          }
        }

        await tx.tradeOrderLine.update({
          where: { id: line.id },
          data: { processedQty: { increment: req.quantity } },
        });
        totalQty += req.quantity;
        const where = [req.locationCode, req.expiryDate && `유통기한 ${req.expiryDate}`].filter(Boolean).join(", ");
        done.push(`${line.product.name} ${req.quantity.toLocaleString()}${where ? ` (${where})` : ""}`);
      }

      await tx.tradeOrder.update({ where: { id: order.id }, data: { version: { increment: 1 } } });
      const status = await refreshOrderStatus(tx, order.id);
      const processLabel = ORDER_PROCESS_LABELS[order.type as OrderTypeCode];
      await recordAudit(tx, {
        category: "ORDER",
        action: "ORDER_PROCESS",
        targetId: order.id,
        targetLabel: order.orderNo,
        summary: `${order.orderNo} ${processLabel} 처리: 품목 ${input.lines.length}개, 수량 ${totalQty.toLocaleString()}`,
        detail: {
          partner: order.partner.name,
          lines: done.join(", "),
          [order.type === "PURCHASE" ? "receivedAt" : "shippedAt"]: toKstDateTimeLocal(input.at).replace("T", " "),
          status: ORDER_STATUS_LABELS[status as OrderStatusCode] ?? status,
          memo: input.memo,
        },
      });
      return { orderNo: order.orderNo, type: order.type as OrderTypeCode, lineCount: input.lines.length, totalQty, status };
    }, TX);
  } catch (e) {
    if (isUniqueViolation(e, "requestId")) throw new OrderError("이미 처리된 요청입니다.");
    throw e;
  }
}

/** 잔량 종결 (일부 처리된 주문의 남은 수량을 더 처리하지 않음) / 취소 (처리 이력 없는 주문) */
export async function finishOrder(orderId: string, version: number, action: "close" | "cancel") {
  return prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    const order = await tx.tradeOrder.findUniqueOrThrow({
      where: { id: orderId },
      select: { orderNo: true, status: true, version: true, lines: { select: { processedQty: true } } },
    });
    if (order.version !== version) throw new OrderError("그 사이 주문 내용이 바뀌었습니다. 새로고침 후 다시 시도하세요.");
    const processed = order.lines.some((l) => l.processedQty > 0);
    let status: TradeOrderStatus;
    if (action === "cancel") {
      if (order.status !== "OPEN" || processed) throw new OrderError("처리 이력이 있는 주문은 취소할 수 없습니다. 잔량 종결을 사용하세요.");
      status = "CANCELLED";
    } else {
      if (order.status !== "PARTIAL") throw new OrderError("일부 처리된 주문만 잔량 종결할 수 있습니다.");
      status = "CLOSED";
    }
    await tx.tradeOrder.update({ where: { id: orderId }, data: { status, version: { increment: 1 } } });
    await recordAudit(tx, {
      category: "ORDER",
      action: action === "cancel" ? "ORDER_CANCEL" : "ORDER_CLOSE",
      targetId: orderId,
      targetLabel: order.orderNo,
      summary: `${order.orderNo} ${action === "cancel" ? "주문 취소" : "잔량 종결"}`,
      detail: {
        before: { status: ORDER_STATUS_LABELS[order.status as OrderStatusCode] },
        after: { status: ORDER_STATUS_LABELS[status as OrderStatusCode] },
      },
    });
    return { orderNo: order.orderNo, status };
  });
}

// ───────── 조회 ─────────

export const ORDER_PAGE_SIZE = 30;

export async function listOrders(f: { type: OrderTypeCode; status: string; q: string; page: number }) {
  const where: Prisma.TradeOrderWhereInput = { type: f.type };
  if (f.status === "active") where.status = { in: ["OPEN", "PARTIAL"] };
  else if (["OPEN", "PARTIAL", "DONE", "CLOSED", "CANCELLED"].includes(f.status)) where.status = f.status as TradeOrderStatus;
  if (f.q) {
    where.OR = [
      { orderNo: { contains: f.q, mode: "insensitive" } },
      { partner: { name: { contains: f.q, mode: "insensitive" } } },
      { lines: { some: { product: { name: { contains: f.q, mode: "insensitive" } } } } },
    ];
  }
  const [total, rows] = await Promise.all([
    prisma.tradeOrder.count({ where }),
    prisma.tradeOrder.findMany({
      where,
      orderBy: [{ createdAt: "desc" }],
      skip: (Math.max(1, f.page) - 1) * ORDER_PAGE_SIZE,
      take: ORDER_PAGE_SIZE,
      include: {
        partner: { select: { name: true } },
        lines: {
          orderBy: { seq: "asc" },
          select: { quantity: true, processedQty: true, unitPrice: true, product: { select: { name: true } } },
        },
      },
    }),
  ]);
  return { total, rows };
}

export async function getOrderDetail(id: string) {
  return prisma.tradeOrder.findUnique({
    where: { id },
    include: {
      partner: { select: { name: true } },
      lines: {
        orderBy: { seq: "asc" },
        include: {
          product: { select: { id: true, sku: true, name: true, baseUnit: true, stock: true, location: { select: { code: true } } } },
          inbounds: {
            where: { status: { not: "CANCELLED" } }, // 취소된 입고는 처리 수량에서 빠짐
            select: { id: true, quantity: true, receivedAt: true },
            orderBy: { receivedAt: "asc" },
          },
          outbounds: {
            where: { status: { not: "CANCELLED" } }, // 취소된 출고는 처리 수량에서 빠짐
            select: { id: true, quantity: true, shippedAt: true },
            orderBy: { shippedAt: "asc" },
          },
        },
      },
    },
  });
}

export async function listProductsForOrder() {
  return prisma.product.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, sku: true, name: true, category: true, price: true, stock: true, baseUnit: true },
    orderBy: [{ category: "asc" }, { sku: "asc" }],
  });
}
