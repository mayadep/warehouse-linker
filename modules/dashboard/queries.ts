import "server-only";
// 대시보드 집계 (읽기 전용). 모든 기간은 KST 하루 기준.
import { prisma } from "@/lib/prisma";
import { parseKstDate, todayKst, toKstDate } from "@/lib/datetime";
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
      select: { id: true, quantity: true, partner: { select: { name: true } }, receivedAt: true, product: { select: { name: true, baseUnit: true } } },
    }),
    prisma.outbound.findMany({
      where: { status: "CONFIRMED" },
      orderBy: { shippedAt: "desc" },
      take: limit,
      select: { id: true, quantity: true, partner: { select: { name: true } }, shippedAt: true, product: { select: { name: true, baseUnit: true } } },
    }),
  ]);
  return {
    inbound: ins.map((r): ActivityRow => ({ id: r.id, kind: "IN", productName: r.product.name, quantity: r.quantity, unit: r.product.baseUnit, partner: r.partner?.name ?? null, at: r.receivedAt })),
    outbound: outs.map((r): ActivityRow => ({ id: r.id, kind: "OUT", productName: r.product.name, quantity: r.quantity, unit: r.product.baseUnit, partner: r.partner?.name ?? null, at: r.shippedAt })),
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

export type TrendPoint = { date: string; label: string; inCount: number; outCount: number };

/** 최근 N일(오늘 포함, KST) 일자별 확정 입고·출고 건수. 건수가 없는 날도 0으로 채운다 */
export async function getInOutTrend(days = 7): Promise<TrendPoint[]> {
  const today = parseKstDate(todayKst())!;
  const start = new Date(today.getTime() - (days - 1) * DAY_MS);
  const end = new Date(today.getTime() + DAY_MS);
  type Row = { d: string; n: number };
  const [ins, outs] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT to_char("receivedAt" + interval '9 hours', 'YYYY-MM-DD') AS d, COUNT(*)::int AS n
      FROM "Inbound" WHERE "status" = 'CONFIRMED' AND "receivedAt" >= ${start} AND "receivedAt" < ${end} GROUP BY 1`,
    prisma.$queryRaw<Row[]>`
      SELECT to_char("shippedAt" + interval '9 hours', 'YYYY-MM-DD') AS d, COUNT(*)::int AS n
      FROM "Outbound" WHERE "status" = 'CONFIRMED' AND "shippedAt" >= ${start} AND "shippedAt" < ${end} GROUP BY 1`,
  ]);
  const inMap = new Map(ins.map((r) => [r.d, r.n]));
  const outMap = new Map(outs.map((r) => [r.d, r.n]));
  return Array.from({ length: days }, (_, i) => {
    const date = toKstDate(new Date(start.getTime() + i * DAY_MS));
    return { date, label: `${date.slice(5, 7)}/${date.slice(8)}`, inCount: inMap.get(date) ?? 0, outCount: outMap.get(date) ?? 0 };
  });
}

export type WarehouseStockRow = { id: string; name: string; quantity: number };

/** 창고별 재고 수량 (구획 재고 합). 위치가 지정되지 않은 재고는 '위치 미지정'으로 묶는다 */
export async function getWarehouseStock(): Promise<WarehouseStockRow[]> {
  const rows = await prisma.$queryRaw<{ id: string | null; name: string | null; qty: bigint }[]>`
    SELECT w."id" AS id, w."name" AS name, SUM(sb."quantity")::bigint AS qty
    FROM "StockBalance" sb
    LEFT JOIN "Location" l ON l."id" = sb."locationId"
    LEFT JOIN "Warehouse" w ON w."id" = l."warehouseId"
    GROUP BY w."id", w."name" ORDER BY qty DESC`;
  return rows.map((r) => ({ id: r.id ?? "none", name: r.name ?? "위치 미지정", quantity: Number(r.qty) }));
}

export type OrderStatusCount = { type: "PURCHASE" | "SALES"; open: number; partial: number; done: number };

/** 발주·수주 상태 현황 (진행 전·일부 처리·완료). 종결·취소는 제외 */
export async function getOrderStatusCounts(): Promise<OrderStatusCount[]> {
  const g = await prisma.tradeOrder.groupBy({ by: ["type", "status"], _count: { _all: true }, where: { status: { in: ["OPEN", "PARTIAL", "DONE"] } } });
  const n = (type: string, status: string) => g.find((x) => x.type === type && x.status === status)?._count._all ?? 0;
  return (["PURCHASE", "SALES"] as const).map((type) => ({ type, open: n(type, "OPEN"), partial: n(type, "PARTIAL"), done: n(type, "DONE") }));
}
