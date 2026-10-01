// 재고현황·재고원장 조회 (읽기 전용)
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type StockStatus = "OUT" | "LOW" | "OK";

export const STOCK_STATUS_LABELS: Record<StockStatus, string> = {
  OUT: "재고 없음",
  LOW: "부족",
  OK: "정상",
};

/** 재고 0 → 없음, 현재고 ≤ 안전재고(>0) → 부족, 그 외 정상 */
export function stockStatus(stock: number, safetyStock: number): StockStatus {
  if (stock <= 0) return "OUT";
  if (safetyStock > 0 && stock <= safetyStock) return "LOW";
  return "OK";
}

export type StockFilter = {
  q: string;
  category: string;
  /** all: 전체, short: 부족+재고없음, low: 부족만, out: 재고없음만 */
  status: "all" | "short" | "low" | "out";
  sort: "sku" | "stock" | "name";
  page: number;
};

export const STOCK_PAGE_SIZE = 50;

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
}

/** URL 검색조건 → 필터 (허용된 값만) */
export function parseStockFilter(sp: SearchParams): StockFilter {
  const status = first(sp.status);
  const sort = first(sp.sort);
  const page = Number(first(sp.page));
  return {
    q: first(sp.q).slice(0, 50),
    category: first(sp.category).slice(0, 50),
    status: status === "short" || status === "low" || status === "out" ? status : "all",
    sort: sort === "stock" || sort === "name" ? sort : "sku",
    page: Number.isInteger(page) && page >= 1 && page <= 100_000 ? page : 1,
  };
}

/** 상태 조건 (stockStatus 와 같은 규칙을 DB 조건으로) */
function statusWhere(status: StockFilter["status"]): Prisma.ProductWhereInput {
  const out: Prisma.ProductWhereInput = { stock: { lte: 0 } };
  // 0 < 재고 ≤ 안전재고 (컬럼끼리 비교)
  const low: Prisma.ProductWhereInput = {
    safetyStock: { gt: 0 },
    stock: { gt: 0, lte: prisma.product.fields.safetyStock },
  };
  if (status === "out") return out;
  if (status === "low") return low;
  if (status === "short") return { OR: [out, low] };
  return {};
}

function buildWhere(filter: StockFilter): Prisma.ProductWhereInput {
  const and: Prisma.ProductWhereInput[] = [];
  if (filter.q) {
    and.push({
      OR: [
        { sku: { contains: filter.q, mode: "insensitive" } },
        { name: { contains: filter.q, mode: "insensitive" } },
      ],
    });
  }
  if (filter.category) and.push({ category: filter.category });
  if (filter.status !== "all") and.push(statusWhere(filter.status));
  return and.length ? { AND: and } : {};
}

function buildOrderBy(sort: StockFilter["sort"]): Prisma.ProductOrderByWithRelationInput[] {
  // 마지막에 고유값(sku)을 둬서 페이지 사이 순서가 흔들리지 않게
  if (sort === "stock") return [{ stock: "asc" }, { sku: "asc" }];
  if (sort === "name") return [{ name: "asc" }, { sku: "asc" }];
  return [{ sku: "asc" }];
}

/** 요약 (필터와 무관하게 전체 기준, DB 집계) */
async function getStockSummary() {
  const [total, out, low, value] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: statusWhere("out") }),
    prisma.product.count({ where: statusWhere("low") }),
    prisma.$queryRaw<{ total: bigint | null }[]>`
      SELECT SUM("stock"::bigint * "price"::bigint) AS total FROM "Product"`,
  ]);
  return { total, out, low, totalValue: Number(value[0]?.total ?? 0) };
}

/**
 * 재고현황 목록: 검색·분류·상태 필터, 정렬, 페이지 나누기를 모두 DB에서 처리
 */
export async function listStockStatus(filter: StockFilter) {
  const where = buildWhere(filter);

  const [matched, summary, categoryRows] = await Promise.all([
    prisma.product.count({ where }),
    getStockSummary(),
    prisma.product.findMany({
      distinct: ["category"],
      select: { category: true },
      orderBy: { category: "asc" },
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(matched / STOCK_PAGE_SIZE));
  const page = Math.min(filter.page, totalPages);

  const products = await prisma.product.findMany({
    where,
    orderBy: buildOrderBy(filter.sort),
    skip: (page - 1) * STOCK_PAGE_SIZE,
    take: STOCK_PAGE_SIZE,
    select: {
      id: true,
      sku: true,
      name: true,
      category: true,
      baseUnit: true,
      boxQty: true,
      price: true,
      stock: true,
      safetyStock: true,
      location: { select: { id: true, code: true } },
    },
  });

  // 최근 입고/출고일은 현재 페이지 상품만
  const ids = products.map((p) => p.id);
  const [lastIn, lastOut] = ids.length
    ? await Promise.all([
        prisma.inbound.groupBy({
          by: ["productId"],
          where: { productId: { in: ids } },
          _max: { receivedAt: true },
        }),
        prisma.outbound.groupBy({
          by: ["productId"],
          where: { productId: { in: ids } },
          _max: { shippedAt: true },
        }),
      ])
    : [[], []];
  const lastInMap = new Map(lastIn.map((r) => [r.productId, r._max.receivedAt]));
  const lastOutMap = new Map(lastOut.map((r) => [r.productId, r._max.shippedAt]));

  const rows = products.map(({ location, ...p }) => ({
    ...p,
    locationId: location?.id ?? null,
    locationCode: location?.code ?? null,
    status: stockStatus(p.stock, p.safetyStock),
    stockValue: p.stock * p.price,
    lastInboundAt: lastInMap.get(p.id) ?? null,
    lastOutboundAt: lastOutMap.get(p.id) ?? null,
  }));

  return {
    rows,
    summary,
    categories: categoryRows.map((c) => c.category),
    pagination: { page, totalPages, matched, pageSize: STOCK_PAGE_SIZE },
  };
}

/** 상품별 재고원장 (최근 limit 건, 최신순) */
export async function getStockLedger(productId: string, limit = 50) {
  const [product, total, movements] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, sku: true, name: true, baseUnit: true, stock: true, safetyStock: true },
    }),
    prisma.stockMovement.count({ where: { productId } }),
    prisma.stockMovement.findMany({
      where: { productId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      include: {
        inbound: { select: { supplier: true, receivedAt: true, memo: true } },
        outbound: { select: { customer: true, shippedAt: true, memo: true } },
        inboundRevision: { select: { reason: true } },
        outboundRevision: { select: { reason: true } },
      },
    }),
  ]);
  if (!product) return null;
  return { product, total, movements };
}
