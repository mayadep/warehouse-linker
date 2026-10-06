// 대시보드 집계 (읽기 전용). 모든 기간은 KST 하루 기준.
import { prisma } from "@/lib/prisma";
import { parseKstDate, todayKst } from "@/lib/datetime";
import { getStockSummary } from "@/modules/stock/queries";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 오늘·어제(KST 자정~자정) 범위 */
function dayRanges(now = new Date()) {
  const start = parseKstDate(todayKst(now))!;
  const end = new Date(start.getTime() + DAY_MS);
  const prevStart = new Date(start.getTime() - DAY_MS);
  return { start, end, prevStart };
}

export type ActivityRow = {
  id: string;
  kind: "IN" | "OUT";
  productName: string;
  quantity: number;
  unit: string;
  partner: string | null;
  at: Date;
};

export type ShortProduct = { id: string; sku: string; name: string; stock: number; safetyStock: number; baseUnit: string };

/** 오늘의 운영 현황 + 어제 비교 */
export async function getTodayOverview() {
  const { start, end, prevStart } = dayRanges();
  const [inToday, inPrev, outToday, outPrev, stockSum, summary] = await Promise.all([
    prisma.inbound.count({ where: { status: "CONFIRMED", receivedAt: { gte: start, lt: end } } }),
    prisma.inbound.count({ where: { status: "CONFIRMED", receivedAt: { gte: prevStart, lt: start } } }),
    prisma.outbound.count({ where: { status: "CONFIRMED", shippedAt: { gte: start, lt: end } } }),
    prisma.outbound.count({ where: { status: "CONFIRMED", shippedAt: { gte: prevStart, lt: start } } }),
    prisma.product.aggregate({ where: { status: "ACTIVE" }, _sum: { stock: true } }),
    getStockSummary(),
  ]);
  return {
    inToday,
    inPrev,
    outToday,
    outPrev,
    totalStock: stockSum._sum.stock ?? 0,
    productCount: summary.total,
    outCount: summary.out,
    lowCount: summary.low,
  };
}

/** 관리자가 처리해야 할 대기 건수 (상품 확정, 입고·출고 확정) */
export async function getPendingCounts() {
  const [products, inbounds, outbounds] = await Promise.all([
    prisma.product.count({ where: { status: "PENDING" } }),
    prisma.inbound.count({ where: { status: "PENDING" } }),
    prisma.outbound.count({ where: { status: "PENDING" } }),
  ]);
  return { products, inbounds, outbounds };
}

/** 최근 확정된 입고·출고 (최신순) */
export async function getRecentActivity(limit = 6): Promise<{ inbound: ActivityRow[]; outbound: ActivityRow[] }> {
  const [ins, outs] = await Promise.all([
    prisma.inbound.findMany({
      where: { status: "CONFIRMED" },
      orderBy: { receivedAt: "desc" },
      take: limit,
      select: { id: true, quantity: true, supplier: true, receivedAt: true, product: { select: { name: true, baseUnit: true } } },
    }),
    prisma.outbound.findMany({
      where: { status: "CONFIRMED" },
      orderBy: { shippedAt: "desc" },
      take: limit,
      select: { id: true, quantity: true, customer: true, shippedAt: true, product: { select: { name: true, baseUnit: true } } },
    }),
  ]);
  return {
    inbound: ins.map((r): ActivityRow => ({ id: r.id, kind: "IN", productName: r.product.name, quantity: r.quantity, unit: r.product.baseUnit, partner: r.supplier, at: r.receivedAt })),
    outbound: outs.map((r): ActivityRow => ({ id: r.id, kind: "OUT", productName: r.product.name, quantity: r.quantity, unit: r.product.baseUnit, partner: r.customer, at: r.shippedAt })),
  };
}

/** 재고 없음·부족 상품 (재고 적은 순) */
export async function getShortProducts(limit = 5): Promise<ShortProduct[]> {
  return prisma.product.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ stock: { lte: 0 } }, { safetyStock: { gt: 0 }, stock: { gt: 0, lte: prisma.product.fields.safetyStock } }],
    },
    orderBy: [{ stock: "asc" }, { sku: "asc" }],
    take: limit,
    select: { id: true, sku: true, name: true, stock: true, safetyStock: true, baseUnit: true },
  });
}
