import Link from "next/link";
import { connection } from "next/server";
import { listStockStatus, parseStockFilter, type StockFilter } from "@/modules/stock/queries";
import { listWarehouseOptions } from "@/modules/warehouse/location";
import StockTable, { type StockRow } from "./StockTable";
import Forbidden from "@/components/Forbidden";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { ChevronLeftIcon, ChevronRightIcon, RotateCcwIcon, SearchIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
});

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
  const user = await requirePageUser();
  if (!can(user.role, "stock.view")) return <Forbidden title="재고현황" />;
  const showPrice = can(user.role, "price.view");
  const canEdit = can(user.role, "admin"); // 안전재고·보관위치 변경
  const filter = parseStockFilter(await searchParams);
  const [{ rows, summary, categories, pagination }, warehouses] = await Promise.all([
    listStockStatus(filter),
    canEdit ? listWarehouseOptions() : Promise.resolve([]),
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
    // 금액 권한이 없으면 내려주지 않음
    price: showPrice ? r.price : null,
    stock: r.stock,
    safetyStock: r.safetyStock,
    status: r.status,
    stockValue: showPrice ? r.stockValue : null,
    lastInboundText: r.lastInboundAt ? dateFmt.format(r.lastInboundAt) : null,
    lastOutboundText: r.lastOutboundAt ? dateFmt.format(r.lastOutboundAt) : null,
  }));

  const cards = [
    { label: "전체 품목", value: `${summary.total.toLocaleString()}개`, href: "/stock", tone: "text-foreground" },
    { label: "재고 없음", value: `${summary.out.toLocaleString()}개`, href: "/stock?status=out", tone: "text-red-600" },
    { label: "부족 (안전재고 이하)", value: `${summary.low.toLocaleString()}개`, href: "/stock?status=low", tone: "text-amber-600" },
    ...(showPrice
      ? [{ label: "재고금액 (판매가 기준)", value: `${summary.totalValue.toLocaleString()}원`, href: null, tone: "text-foreground" }]
      : []),
  ];

  return (
    <div>
      <h2 className="mb-6 text-2xl font-semibold tracking-tight">재고현황</h2>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((c) => {
          const body = (
            <>
              <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
              <p className={`mt-1.5 text-2xl font-semibold tabular-nums ${c.tone}`}>{c.value}</p>
            </>
          );
          return c.href ? (
            <Link key={c.label} href={c.href} className="rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-indigo-300 hover:bg-indigo-50/40">
              {body}
            </Link>
          ) : (
            <div key={c.label} className="rounded-xl border bg-card p-4 shadow-xs">
              {body}
            </div>
          );
        })}
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="w-56 bg-background pl-8" name="q" defaultValue={filter.q} placeholder="코드·품명 검색" />
        </div>
        <NativeSelect name="category" defaultValue={filter.category} className="[&_select]:bg-background">
          <option value="">전체 분류</option>
          {categories.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="status" defaultValue={filter.status} className="[&_select]:bg-background">
          <option value="all">전체 상태</option>
          <option value="short">부족 + 재고 없음</option>
          <option value="low">부족</option>
          <option value="out">재고 없음</option>
        </NativeSelect>
        <NativeSelect name="sort" defaultValue={filter.sort} className="[&_select]:bg-background">
          <option value="sku">코드순</option>
          <option value="stock">재고 적은 순</option>
          <option value="name">품명순</option>
        </NativeSelect>
        <Button type="submit">
          <SearchIcon data-icon="inline-start" />
          조회
        </Button>
        <Link href="/stock" className={buttonVariants({ variant: "ghost" })}>
          <RotateCcwIcon data-icon="inline-start" />
          초기화
        </Link>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          <b className="font-semibold text-foreground">{matched.toLocaleString()}</b>개 품목
          {matched > 0 &&
            ` · ${((page - 1) * pageSize + 1).toLocaleString()}–${Math.min(page * pageSize, matched).toLocaleString()} 표시`}
        </span>
      </form>
      <StockTable rows={tableRows} warehouses={warehouses} showPrice={showPrice} canEdit={canEdit} />

      {totalPages > 1 && (
        <nav className="mt-5 flex flex-wrap items-center justify-center gap-1" aria-label="페이지">
          {page > 1 ? (
            <Link href={pageHref(filter, page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ChevronLeftIcon data-icon="inline-start" />
              이전
            </Link>
          ) : (
            <span className={buttonVariants({ variant: "outline", size: "sm" }) + " pointer-events-none opacity-50"}>
              <ChevronLeftIcon data-icon="inline-start" />
              이전
            </span>
          )}
          {pageNumbers(page, totalPages).map((n, i) =>
            n === "…" ? (
              <span key={`gap-${i}`} className="px-1 text-muted-foreground">
                …
              </span>
            ) : n === page ? (
              <span key={n} aria-current="page" className={buttonVariants({ size: "sm" }) + " min-w-8 tabular-nums"}>
                {n}
              </span>
            ) : (
              <Link key={n} href={pageHref(filter, n)} className={buttonVariants({ variant: "ghost", size: "sm" }) + " min-w-8 tabular-nums"}>
                {n}
              </Link>
            )
          )}
          {page < totalPages ? (
            <Link href={pageHref(filter, page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              다음
              <ChevronRightIcon data-icon="inline-end" />
            </Link>
          ) : (
            <span className={buttonVariants({ variant: "outline", size: "sm" }) + " pointer-events-none opacity-50"}>
              다음
              <ChevronRightIcon data-icon="inline-end" />
            </span>
          )}
        </nav>
      )}
    </div>
  );
}