import "server-only";
// 재고조정 화면 조회 (읽기 전용)
import type { Prisma, StockAdjustReason } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dateOnlyToDb, dbToDateOnly, parseKstDate, todayKst } from "@/lib/datetime";
import { ADJUST_REASONS } from "./codes";

const DAY_MS = 24 * 60 * 60 * 1000;
export const ADJUST_PAGE_SIZE = 30;

export type AdjustFilter = {
  q: string;
  reason: StockAdjustReason | "";
  from: string; // YYYY-MM-DD (KST) 또는 ""
  to: string;
  page: number;
};

export function parseAdjustFilter(sp: Record<string, string | string[] | undefined>): AdjustFilter {
  const one = (k: string) => {
    const v = sp[k];
    return (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
  };
  const reason = one("reason");
  const from = one("from");
  const to = one("to");
  const page = Number(one("page"));
  return {
    q: one("q").slice(0, 50),
    reason: ADJUST_REASONS.some((r) => r.value === reason) ? (reason as StockAdjustReason) : "",
    from: parseKstDate(from) ? from : "",
    to: parseKstDate(to) ? to : "",
    page: Number.isInteger(page) && page >= 1 && page <= 100_000 ? page : 1,
  };
}

/** 조정 이력 (최신순, 조정 1건 = 1행. 여러 칸에 걸치면 칸 목록을 함께) */
export async function listAdjustments(f: AdjustFilter) {
  const where: Prisma.StockAdjustmentWhereInput = {};
  if (f.reason) where.reason = f.reason;
  if (f.q) {
    where.product = {
      OR: [{ sku: { contains: f.q, mode: "insensitive" } }, { name: { contains: f.q, mode: "insensitive" } }],
    };
  }
  const fromAt = f.from ? parseKstDate(f.from) : null;
  const toAt = f.to ? parseKstDate(f.to) : null;
  if (fromAt || toAt) {
    where.createdAt = {
      ...(fromAt ? { gte: fromAt } : {}),
      ...(toAt ? { lt: new Date(toAt.getTime() + DAY_MS) } : {}), // 종료일 하루 전체 포함
    };
  }
  const total = await prisma.stockAdjustment.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / ADJUST_PAGE_SIZE));
  const page = Math.min(f.page, totalPages);
  const rows = await prisma.stockAdjustment.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * ADJUST_PAGE_SIZE,
    take: ADJUST_PAGE_SIZE,
    select: {
      id: true,
      reason: true,
      quantity: true,
      memo: true,
      createdAt: true,
      product: { select: { sku: true, name: true, baseUnit: true } },
      createdBy: { select: { name: true } },
      movements: {
        orderBy: { createdAt: "asc" },
        select: { quantity: true, expiryDate: true, location: { select: { code: true } } },
      },
    },
  });
  return { rows, total, page, totalPages };
}

export type ExpiredBucket = {
  productId: string;
  sku: string;
  name: string;
  baseUnit: string;
  locationId: string | null;
  locationCode: string | null;
  expiryDate: string;
  quantity: number;
  overdueDays: number;
};

/** 유통기한이 지난(오늘 KST 이전) 칸 재고. 같은 위치·유통기한의 입고일별 재고는 합침. 오래된 순 */
export async function listExpiredBuckets(limit = 200): Promise<{ total: number; rows: ExpiredBucket[] }> {
  const today = dateOnlyToDb(todayKst());
  const rows = await prisma.stockBalance.findMany({
    where: { quantity: { gt: 0 }, expiryDate: { lt: today } },
    select: {
      productId: true,
      locationId: true,
      expiryDate: true,
      quantity: true,
      location: { select: { code: true } },
      product: { select: { sku: true, name: true, baseUnit: true } },
    },
  });
  const groups = new Map<string, ExpiredBucket>();
  for (const r of rows) {
    const expiry = r.expiryDate!;
    const expiryDate = dbToDateOnly(expiry);
    const key = `${r.productId}|${r.locationId ?? ""}|${expiryDate}`;
    const g = groups.get(key);
    if (g) {
      g.quantity += r.quantity;
      continue;
    }
    groups.set(key, {
      productId: r.productId,
      sku: r.product.sku,
      name: r.product.name,
      baseUnit: r.product.baseUnit,
      locationId: r.locationId,
      locationCode: r.location?.code ?? null,
      expiryDate,
      quantity: r.quantity,
      overdueDays: Math.round((today.getTime() - expiry.getTime()) / DAY_MS),
    });
  }
  const all = [...groups.values()].sort(
    (a, b) => a.expiryDate.localeCompare(b.expiryDate) || a.sku.localeCompare(b.sku)
  );
  return { total: all.length, rows: all.slice(0, limit) };
}
