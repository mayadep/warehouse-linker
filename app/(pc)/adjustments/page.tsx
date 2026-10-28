import Link from "next/link";
import { connection } from "next/server";
import { ChevronLeftIcon, ChevronRightIcon, ClipboardListIcon, RotateCcwIcon, SearchIcon } from "lucide-react";
import Forbidden from "@/components/Forbidden";
import EmptyState from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { ADJUST_REASONS, ADJUST_REASON_LABELS } from "@/modules/stock/codes";
import { dbToDateOnly } from "@/lib/datetime";
import {
  listAdjustments,
  listExpiredBuckets,
  parseAdjustFilter,
  type AdjustFilter,
} from "@/modules/stock/adjust-queries";
import AdjustForm from "./AdjustForm";
import ExpiredPanel from "./ExpiredPanel";

const dateTimeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** 현재 필터를 유지한 채 페이지만 바꾼 URL */
function pageHref(f: AdjustFilter, page: number): string {
  const sp = new URLSearchParams();
  if (f.reason) sp.set("reason", f.reason);
  if (f.q) sp.set("q", f.q);
  if (f.from) sp.set("from", f.from);
  if (f.to) sp.set("to", f.to);
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `/adjustments?${qs}` : "/adjustments";
}

export default async function AdjustmentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection(); // 항상 요청 시점의 DB 데이터를 조회
  const user = await requirePageUser();
  if (!can(user.role, "admin")) return <Forbidden title="재고조정" />;
  const filter = parseAdjustFilter(await searchParams);
  const [expired, { rows, total, page, totalPages }] = await Promise.all([
    listExpiredBuckets(),
    listAdjustments(filter),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">재고조정</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          폐기·파손·분실·실사 차이처럼 입출고 외 사유로 재고를 늘리거나 줄입니다. 모든 조정은 사유와 함께 이력에 남습니다.
        </p>
      </div>

      <ExpiredPanel rows={expired.rows} total={expired.total} />

      <section>
        <h3 className="mb-2 text-base font-semibold">조정 등록</h3>
        <AdjustForm />
      </section>

      <section>
        <h3 className="mb-2 text-base font-semibold">조정 이력</h3>
        <form className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3">
          <NativeSelect name="reason" defaultValue={filter.reason} className="[&_select]:bg-card">
            <option value="">전체 사유</option>
            {ADJUST_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.sign > 0 ? "＋ " : "－ "}
                {r.label}
              </option>
            ))}
          </NativeSelect>
          <Input type="date" name="from" defaultValue={filter.from} className="w-40 bg-card" aria-label="시작일" />
          <span className="text-sm text-muted-foreground">~</span>
          <Input type="date" name="to" defaultValue={filter.to} className="w-40 bg-card" aria-label="종료일" />
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="w-64 bg-card pl-8" name="q" defaultValue={filter.q} placeholder="상품명·코드 검색" />
          </div>
          <Button type="submit">
            <SearchIcon data-icon="inline-start" />
            조회
          </Button>
          <Link href="/adjustments" className={buttonVariants({ variant: "ghost" })}>
            <RotateCcwIcon data-icon="inline-start" />
            초기화
          </Link>
          <span className="ml-auto text-sm text-muted-foreground tabular-nums">
            <b className="font-semibold text-foreground">{total.toLocaleString()}</b>건
          </span>
        </form>

        <div className="max-h-[70vh] overflow-auto rounded-lg border">
          <table className="data-table">
            <thead>
              <tr>
                <th>일시</th>
                <th className="left">상품</th>
                <th className="left">위치 · 유통기한</th>
                <th>사유</th>
                <th className="num">수량</th>
                <th className="left">메모</th>
                <th>처리자</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-0">
                    <EmptyState
                      icon={ClipboardListIcon}
                      title="조정 이력이 없습니다."
                      description="조건을 바꾸거나 위에서 조정을 등록해 보세요."
                    />
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-muted-foreground tabular-nums">
                    {dateTimeFmt.format(r.createdAt)}
                  </td>
                  <td className="left">
                    <span className="font-mono text-xs text-muted-foreground">{r.product.sku}</span> {r.product.name}
                  </td>
                  <td className="left whitespace-nowrap">
                    {r.movements.map((m, i) => (
                      <div key={i}>
                        <span className="font-mono">{m.location?.code ?? "미지정"}</span>{" "}
                        <span className="text-xs text-muted-foreground">
                          {m.expiryDate ? dbToDateOnly(m.expiryDate) : "유통기한 미상"}
                        </span>
                        {r.movements.length > 1 && (
                          <span className="text-xs text-muted-foreground"> ({m.quantity.toLocaleString()})</span>
                        )}
                      </div>
                    ))}
                  </td>
                  <td>
                    <Badge variant={r.quantity > 0 ? "indigo" : "gray"}>{ADJUST_REASON_LABELS[r.reason]}</Badge>
                  </td>
                  <td className={`num ${r.quantity > 0 ? "text-indigo-700" : "text-red-700"}`}>
                    {r.quantity > 0 ? "+" : ""}
                    {r.quantity.toLocaleString()} {r.product.baseUnit}
                  </td>
                  <td className="left max-w-64 truncate text-muted-foreground" title={r.memo ?? undefined}>
                    {r.memo ?? ""}
                  </td>
                  <td className="text-muted-foreground">{r.createdBy?.name ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <nav className="mt-5 flex items-center justify-center gap-2" aria-label="페이지">
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
            <span className="px-2 text-sm text-muted-foreground tabular-nums">
              <b className="font-semibold text-foreground">{page}</b> / {totalPages}
            </span>
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
      </section>
    </div>
  );
}
