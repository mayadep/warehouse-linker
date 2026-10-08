import "server-only";
// 기간별 집계 (읽기 전용). 확정(CONFIRMED) 건만, 기간은 KST 날짜 기준 종료일 포함
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toKstDateTimeLocal } from "@/lib/datetime";
import { PRODUCT_UNIT_LABELS, type ProductUnitCode } from "@/modules/product/units";
import { REPORT_LIMITS } from "./codes";
import { reportRange, type ReportFilter } from "./validation";

// 테이블·컬럼 이름은 고정 목록에서만 가져온다 (사용자 입력을 SQL 식별자로 쓰지 않음)
const SRC = {
  inbound: { table: Prisma.raw('"Inbound"'), at: Prisma.raw('t."receivedAt"'), price: Prisma.raw('t."unitCost"') },
  outbound: { table: Prisma.raw('"Outbound"'), at: Prisma.raw('t."shippedAt"'), price: Prisma.raw('t."unitPrice"') },
} as const;

export type ReportRow = {
  key: string;
  code: string | null; // 상품별일 때 상품 코드
  label: string; // 일자 / 상품명 / 거래처명
  unit: string | null; // 상품별일 때 단위 (다른 단위끼리는 수량을 합치지 않음)
  count: number;
  quantity: number | null; // 일자별·거래처별은 단위가 섞여 null
  amount: number; // 단가가 있는 건의 수량×단가 합 (원)
};

export type ReportSummary = { rows: ReportRow[]; totalCount: number; totalAmount: number; noPriceCount: number };

type RawRow = { key: string; code: string | null; label: string; unit: string | null; cnt: number; qty: bigint; amount: bigint | null };

export async function getReportSummary(f: ReportFilter): Promise<ReportSummary> {
  const { start, end } = reportRange(f);
  const s = SRC[f.kind];
  const where = Prisma.sql`t."status" = 'CONFIRMED' AND ${s.at} >= ${start} AND ${s.at} < ${end}`;
  const amount = Prisma.sql`SUM(t."quantity"::bigint * ${s.price}::bigint)`;

  let raw: RawRow[];
  if (f.group === "day") {
    raw = await prisma.$queryRaw<RawRow[]>`
      SELECT to_char(${s.at} + interval '9 hours', 'YYYY-MM-DD') AS key, NULL::text AS code,
             to_char(${s.at} + interval '9 hours', 'YYYY-MM-DD') AS label, NULL::text AS unit,
             COUNT(*)::int AS cnt, SUM(t."quantity")::bigint AS qty, ${amount} AS amount
      FROM ${s.table} t WHERE ${where} GROUP BY 1, 3 ORDER BY 1 DESC`;
  } else if (f.group === "product") {
    raw = await prisma.$queryRaw<RawRow[]>`
      SELECT p."id" AS key, p."sku" AS code, p."name" AS label, p."baseUnit"::text AS unit,
             COUNT(*)::int AS cnt, SUM(t."quantity")::bigint AS qty, ${amount} AS amount
      FROM ${s.table} t JOIN "Product" p ON p."id" = t."productId"
      WHERE ${where} GROUP BY p."id", p."sku", p."name", p."baseUnit" ORDER BY amount DESC NULLS LAST, p."sku"`;
  } else {
    raw = await prisma.$queryRaw<RawRow[]>`
      SELECT COALESCE(t."partnerId", '-') AS key, NULL::text AS code, COALESCE(pt."name", '(미지정)') AS label, NULL::text AS unit,
             COUNT(*)::int AS cnt, SUM(t."quantity")::bigint AS qty, ${amount} AS amount
      FROM ${s.table} t LEFT JOIN "Partner" pt ON pt."id" = t."partnerId"
      WHERE ${where} GROUP BY t."partnerId", pt."name" ORDER BY amount DESC NULLS LAST, label`;
  }

  const [{ n }] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT COUNT(*)::int AS n FROM ${s.table} t WHERE ${where} AND ${s.price} IS NULL`;

  const rows: ReportRow[] = raw.map((r) => ({
    key: r.key,
    code: r.code,
    label: r.label,
    unit: r.unit ? (PRODUCT_UNIT_LABELS[r.unit as ProductUnitCode] ?? r.unit) : null,
    count: r.cnt,
    quantity: f.group === "product" ? Number(r.qty) : null,
    amount: Number(r.amount ?? 0),
  }));
  return {
    rows,
    totalCount: rows.reduce((a, r) => a + r.count, 0),
    totalAmount: rows.reduce((a, r) => a + r.amount, 0),
    noPriceCount: n,
  };
}

export type ReportDetailRow = {
  at: string; // KST "YYYY-MM-DDTHH:mm"
  code: string;
  name: string;
  quantity: number;
  unit: string;
  unitPrice: number | null;
  amount: number | null;
  partner: string;
  memo: string;
};

/** 엑셀 상세 시트용 건별 내역 (오래된 순, 최대 maxDetailRows+1건 — 초과 여부 확인용) */
export async function listReportDetail(f: ReportFilter): Promise<ReportDetailRow[]> {
  const { start, end } = reportRange(f);
  const take = REPORT_LIMITS.maxDetailRows + 1;
  const include = { product: { select: { sku: true, name: true, baseUnit: true } }, partner: { select: { name: true } } };
  const map = (
    at: Date,
    r: { quantity: number; memo: string | null; product: { sku: string; name: string; baseUnit: string }; partner: { name: string } | null },
    unitPrice: number | null,
  ): ReportDetailRow => ({
    at: toKstDateTimeLocal(at).replace("T", " "),
    code: r.product.sku,
    name: r.product.name,
    quantity: r.quantity,
    unit: PRODUCT_UNIT_LABELS[r.product.baseUnit as ProductUnitCode] ?? r.product.baseUnit,
    unitPrice,
    amount: unitPrice === null ? null : unitPrice * r.quantity,
    partner: r.partner?.name ?? "",
    memo: r.memo ?? "",
  });

  if (f.kind === "inbound") {
    const list = await prisma.inbound.findMany({
      where: { status: "CONFIRMED", receivedAt: { gte: start, lt: end } },
      include, orderBy: [{ receivedAt: "asc" }, { id: "asc" }], take,
    });
    return list.map((r) => map(r.receivedAt, r, r.unitCost));
  }
  const list = await prisma.outbound.findMany({
    where: { status: "CONFIRMED", shippedAt: { gte: start, lt: end } },
    include, orderBy: [{ shippedAt: "asc" }, { id: "asc" }], take,
  });
  return list.map((r) => map(r.shippedAt, r, r.unitPrice));
}
