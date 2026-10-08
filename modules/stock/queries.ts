import "server-only";
// 재고현황·재고원장 조회 (읽기 전용)
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { UUID_RE } from "@/lib/form";
import { dateOnlyToDb, dbToDateOnly, todayKst } from "@/lib/datetime";

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

/** 유통기한 임박 기준: 오늘(KST)부터 N일 이내 (오늘 이전이면 만료) */
export const EXPIRY_SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ExpiryState = "EXPIRED" | "SOON" | "OK";

/** 오늘(KST)·임박 마지막 날 (DB DATE 와 같은 UTC 자정 Date) */
function expiryBounds(now = new Date()) {
  const today = dateOnlyToDb(todayKst(now));
  return { today, soonEnd: new Date(today.getTime() + EXPIRY_SOON_DAYS * DAY_MS) };
}

/** 유통기한 "YYYY-MM-DD" → 만료/임박/정상 + 남은 일수 (오늘 = 0) */
export function expiryStateOf(expiryDate: string, now = new Date()): { state: ExpiryState; days: number } {
  const days = Math.round((dateOnlyToDb(expiryDate).getTime() - dateOnlyToDb(todayKst(now)).getTime()) / DAY_MS);
  return { state: days < 0 ? "EXPIRED" : days <= EXPIRY_SOON_DAYS ? "SOON" : "OK", days };
}

/** 유통기한 조건의 칸별 재고 (alert = 만료+임박) */
function expiryBalanceWhere(kind: "alert" | "expired" | "soon", warehouseId = ""): Prisma.StockBalanceWhereInput {
  const { today, soonEnd } = expiryBounds();
  const expiryDate =
    kind === "expired" ? { lt: today } : kind === "soon" ? { gte: today, lte: soonEnd } : { lte: soonEnd };
  return { expiryDate, ...(warehouseId ? { location: { warehouseId } } : {}) };
}

export type StockFilter = {
  q: string;
  category: string;
  /** 창고 id ("" = 전체 창고) */
  warehouse: string;
  /** 유통기한: "" 전체, alert 만료+임박, expired 만료, soon 임박 */
  expiry: "" | "alert" | "expired" | "soon";
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
  const expiry = first(sp.expiry);
  const sort = first(sp.sort);
  const page = Number(first(sp.page));
  return {
    q: first(sp.q).slice(0, 50),
    category: first(sp.category).slice(0, 50),
    warehouse: UUID_RE.test(first(sp.warehouse)) ? first(sp.warehouse) : "",
    expiry: expiry === "alert" || expiry === "expired" || expiry === "soon" ? expiry : "",
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
  const warehouseId = filter.warehouse;
  const and: Prisma.ProductWhereInput[] = [ACTIVE]; // 확정 대기 상품은 재고현황에서 제외
  // 창고 선택: 그 창고 칸에 재고가 있거나 기본 보관위치가 그 창고인 상품
  if (warehouseId) {
    and.push({
      OR: [{ stockBalances: { some: { location: { warehouseId } } } }, { location: { warehouseId } }],
    });
  }
  if (filter.q) {
    and.push({
      OR: [
        { sku: { contains: filter.q, mode: "insensitive" } },
        { name: { contains: filter.q, mode: "insensitive" } },
      ],
    });
  }
  if (filter.category) and.push({ category: filter.category });
  // 유통기한: 조건에 맞는 칸 재고가 있는 상품 (창고를 고르면 그 창고 칸만)
  if (filter.expiry) and.push({ stockBalances: { some: expiryBalanceWhere(filter.expiry, warehouseId) } });
  if (filter.status !== "all") and.push(statusWhere(filter.status));
  return { AND: and };
}

function buildOrderBy(sort: StockFilter["sort"]): Prisma.ProductOrderByWithRelationInput[] {
  // 마지막에 고유값(sku)을 둬서 페이지 사이 순서가 흔들리지 않게
  if (sort === "stock") return [{ stock: "asc" }, { sku: "asc" }];
  if (sort === "name") return [{ name: "asc" }, { sku: "asc" }];
  return [{ sku: "asc" }];
}

const ACTIVE: Prisma.ProductWhereInput = { status: "ACTIVE" };

/** 재고 없음 + 부족(안전재고 이하) 상품 수 — 헤더 알림·대시보드용 */
export async function countShortStock(): Promise<number> {
  return prisma.product.count({ where: { AND: [ACTIVE, statusWhere("short")] } });
}

/** 유통기한 만료·임박 상품 수 (재고가 남은 칸 기준, 한 상품이 둘 다일 수 있음) — 헤더 알림·대시보드용 */
export async function countExpiryAlerts(): Promise<{ expired: number; soon: number; total: number }> {
  const count = (kind: "alert" | "expired" | "soon") =>
    prisma.product.count({ where: { AND: [ACTIVE, { stockBalances: { some: expiryBalanceWhere(kind) } }] } });
  const [expired, soon, total] = await Promise.all([count("expired"), count("soon"), count("alert")]);
  return { expired, soon, total };
}

/** 요약 (필터와 무관하게 전체 기준, DB 집계) */
export async function getStockSummary() {
  const [total, out, low, value] = await Promise.all([
    prisma.product.count({ where: ACTIVE }),
    prisma.product.count({ where: { AND: [ACTIVE, statusWhere("out")] } }),
    prisma.product.count({ where: { AND: [ACTIVE, statusWhere("low")] } }),
    prisma.$queryRaw<{ total: bigint | null }[]>`
      SELECT SUM("stock"::bigint * "price"::bigint) AS total FROM "Product" WHERE "status" = 'ACTIVE'`,
  ]);
  return { total, out, low, totalValue: Number(value[0]?.total ?? 0) };
}

/**
 * 재고현황 목록: 검색·분류·상태 필터, 정렬, 페이지 나누기를 모두 DB에서 처리
 * 창고를 고르면 그 창고 상품만, 행마다 그 창고 칸 재고 합계(warehouseStock)를 함께 준다.
 * 상태·정렬·요약·안전재고는 상품 전체 재고 기준 그대로
 */
export async function listStockStatus(filter: StockFilter) {
  const where = buildWhere(filter);
  const warehouseId = filter.warehouse;

  const [matched, summary, categoryRows] = await Promise.all([
    prisma.product.count({ where }),
    getStockSummary(),
    prisma.product.findMany({
      where: ACTIVE,
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
          where: { productId: { in: ids }, status: "CONFIRMED" }, // 대기·취소 입고 제외
          _max: { receivedAt: true },
        }),
        prisma.outbound.groupBy({
          by: ["productId"],
          where: { productId: { in: ids }, status: "CONFIRMED" }, // 대기·취소 출고 제외
          _max: { shippedAt: true },
        }),
      ])
    : [[], []];
  const whStockRows =
    warehouseId && ids.length
      ? await prisma.stockBalance.groupBy({
          by: ["productId"],
          where: { productId: { in: ids }, location: { warehouseId } },
          _sum: { quantity: true },
        })
      : [];
  const whStockMap = new Map(whStockRows.map((r) => [r.productId, r._sum.quantity ?? 0]));
  // 가장 빠른 유통기한 (재고가 남은 칸 중, 창고를 고르면 그 창고 칸만)
  const nearestRows = ids.length
    ? await prisma.stockBalance.groupBy({
        by: ["productId"],
        where: { productId: { in: ids }, expiryDate: { not: null }, ...(warehouseId ? { location: { warehouseId } } : {}) },
        _min: { expiryDate: true },
      })
    : [];
  const nearestMap = new Map(nearestRows.map((r) => [r.productId, r._min.expiryDate ? dbToDateOnly(r._min.expiryDate) : null]));
  const lastInMap = new Map(lastIn.map((r) => [r.productId, r._max.receivedAt]));
  const lastOutMap = new Map(lastOut.map((r) => [r.productId, r._max.shippedAt]));

  const rows = products.map(({ location, ...p }) => ({
    ...p,
    locationId: location?.id ?? null,
    locationCode: location?.code ?? null,
    status: stockStatus(p.stock, p.safetyStock),
    warehouseStock: warehouseId ? (whStockMap.get(p.id) ?? 0) : null,
    nearestExpiry: nearestMap.get(p.id) ?? null,
    stockValue: (warehouseId ? (whStockMap.get(p.id) ?? 0) : p.stock) * p.price,
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
  const [product, total, movements, balances] = await Promise.all([
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
        inbound: { select: { partner: { select: { name: true } }, receivedAt: true, memo: true, cancelReason: true } },
        outbound: { select: { partner: { select: { name: true } }, shippedAt: true, memo: true, cancelReason: true } },
        inboundRevision: { select: { reason: true } },
        outboundRevision: { select: { reason: true } },
        location: { select: { code: true } },
      },
    }),
    listProductBalances(productId),
  ]);
  if (!product) return null;
  return { product, total, movements, balances };
}

/**
 * 상품의 칸별 재고 (위치·유통기한 단위로 입고일별 재고를 합침). 자동 출고(선입선출) 순서와 같게:
 * 가장 오래된 입고일 먼저(미상 → 가장 먼저) → 유통기한 미상 → 빠른 순 → 위치 코드
 * lotDate = 그 칸에서 가장 오래된 입고일 (null = 입고일 미상 재고가 있음)
 */
export async function listProductBalances(productId: string) {
  const rows = await prisma.stockBalance.findMany({
    where: { productId },
    select: { locationId: true, expiryDate: true, lotDate: true, quantity: true, location: { select: { code: true } } },
  });
  const groups = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const key = `${r.locationId ?? ""}|${r.expiryDate?.getTime() ?? ""}`;
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { ...r });
      continue;
    }
    g.quantity += r.quantity;
    // 가장 오래된 입고일 (미상이 하나라도 있으면 미상)
    g.lotDate = g.lotDate === null || r.lotDate === null ? null : r.lotDate < g.lotDate ? r.lotDate : g.lotDate;
  }
  const t = (d: Date | null) => (d === null ? -Infinity : d.getTime());
  return [...groups.values()].sort(
    (a, b) =>
      t(a.lotDate) - t(b.lotDate) ||
      t(a.expiryDate) - t(b.expiryDate) ||
      (a.location?.code ?? "").localeCompare(b.location?.code ?? "")
  );
}
