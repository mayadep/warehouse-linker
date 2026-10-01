import Link from "next/link";
import { connection } from "next/server";
import { listStockStatus, parseStockFilter, type StockFilter } from "@/modules/stock/queries";
import { listWarehouseOptions } from "@/modules/warehouse/location";
import StockTable, { type StockRow } from "./StockTable";

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
});

const select = "rounded border border-gray-300 px-2 py-1.5 text-sm";

/** 현재 필터를 유지한 채 페이지만 바꾼 URL */
function pageHref(filter: StockFilter, page: number): string {
  const sp = new URLSearchParams();
  if (filter.q) sp.set("q", filter.q);
  if (filter.category) sp.set("category", filter.category);
  if (filter.status !== "all") sp.set("status", filter.status);
  if (filter.sort !== "sku") sp.set("sort", filter.sort);
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `/stock?${qs}` : "/stock";
}

/** 현재 페이지 주변 번호 (1 … 4 5 [6] 7 8 … 20) */
function pageNumbers(page: number, total: number): (number | "…")[] {
  const set = new Set([1, total, page - 2, page - 1, page, page + 1, page + 2]);
  const nums = [...set].filter((n) => n >= 1 && n <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  nums.forEach((n, i) => {
    if (i > 0 && n - nums[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection(); // 항상 요청 시점의 DB 데이터를 조회
  const filter = parseStockFilter(await searchParams);
  const [{ rows, summary, categories, pagination }, warehouses] = await Promise.all([
    listStockStatus(filter),
    listWarehouseOptions(),
  ]);
  const { page, totalPages, matched, pageSize } = pagination;

  const tableRows: StockRow[] = rows.map((r) => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    category: r.category,
    locationId: r.locationId,
    locationCode: r.locationCode,
    baseUnit: r.baseUnit,
    boxQty: r.boxQty,
    price: r.price,
    stock: r.stock,
    safetyStock: r.safetyStock,
    status: r.status,
    stockValue: r.stockValue,
    lastInboundText: r.lastInboundAt ? dateFmt.format(r.lastInboundAt) : null,
    lastOutboundText: r.lastOutboundAt ? dateFmt.format(r.lastOutboundAt) : null,
  }));

  const cards = [
    { label: "전체 품목", value: `${summary.total.toLocaleString()}개`, href: "/stock", tone: "text-gray-900" },
    { label: "재고 없음", value: `${summary.out.toLocaleString()}개`, href: "/stock?status=out", tone: "text-red-600" },
    { label: "부족 (안전재고 이하)", value: `${summary.low.toLocaleString()}개`, href: "/stock?status=low", tone: "text-amber-600" },
    { label: "재고금액 (판매가 기준)", value: `${summary.totalValue.toLocaleString()}원`, href: null, tone: "text-gray-900" },
  ];

  return (
    <div className="max-w-6xl">
      <h2 className="mb-6 text-xl font-bold">재고현황</h2>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => {
          const body = (
            <>
              <p className="text-xs text-gray-500">{c.label}</p>
              <p className={`mt-1 text-lg font-semibold ${c.tone}`}>{c.value}</p>
            </>
          );
          return c.href ? (
            <Link key={c.label} href={c.href} className="rounded border border-gray-200 p-3 hover:bg-gray-50">
              {body}
            </Link>
          ) : (
            <div key={c.label} className="rounded border border-gray-200 p-3">
              {body}
            </div>
          );
        })}
      </div>

      <form className="mb-3 flex flex-wrap items-center gap-2">
        <input
          name="q"
          defaultValue={filter.q}
          placeholder="코드·품명 검색"
          className="w-48 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
        <select name="category" defaultValue={filter.category} className={select}>
          <option value="">전체 분류</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={filter.status} className={select}>
          <option value="all">전체 상태</option>
          <option value="short">부족 + 재고 없음</option>
          <option value="low">부족</option>
          <option value="out">재고 없음</option>
        </select>
        <select name="sort" defaultValue={filter.sort} className={select}>
          <option value="sku">코드순</option>
          <option value="stock">재고 적은 순</option>
          <option value="name">품명순</option>
        </select>
        <button className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100">조회</button>
        <Link href="/stock" className="px-2 text-sm text-gray-500 hover:underline">
          초기화
        </Link>
        <span className="ml-auto text-sm text-gray-500">
          {matched.toLocaleString()}개 품목
          {matched > 0 &&
            ` · ${((page - 1) * pageSize + 1).toLocaleString()}–${Math.min(page * pageSize, matched).toLocaleString()} 표시`}
        </span>
      </form>

      <StockTable rows={tableRows} warehouses={warehouses} />

      {totalPages > 1 && (
        <nav className="mt-4 flex flex-wrap items-center justify-center gap-1 text-sm" aria-label="페이지">
          {page > 1 ? (
            <Link href={pageHref(filter, page - 1)} className="rounded border px-2 py-1 hover:bg-gray-100">
              ‹ 이전
            </Link>
          ) : (
            <span className="rounded border px-2 py-1 text-gray-300">‹ 이전</span>
          )}
          {pageNumbers(page, totalPages).map((n, i) =>
            n === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-gray-400">
                …
              </span>
            ) : n === page ? (
              <span key={n} aria-current="page" className="rounded border border-blue-600 bg-blue-600 px-2 py-1 text-white">
                {n}
              </span>
            ) : (
              <Link key={n} href={pageHref(filter, n)} className="rounded border px-2 py-1 hover:bg-gray-100">
                {n}
              </Link>
            )
          )}
          {page < totalPages ? (
            <Link href={pageHref(filter, page + 1)} className="rounded border px-2 py-1 hover:bg-gray-100">
              다음 ›
            </Link>
          ) : (
            <span className="rounded border px-2 py-1 text-gray-300">다음 ›</span>
          )}
        </nav>
      )}
    </div>
  );
}
