import Link from "next/link";
import { connection } from "next/server";
import { BarChart3Icon, DownloadIcon, ReceiptTextIcon, RotateCcwIcon, SearchIcon, WalletIcon } from "lucide-react";
import Forbidden from "@/components/Forbidden";
import EmptyState from "@/components/EmptyState";
import KpiCard from "@/components/KpiCard";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import {
  REPORT_GROUPS,
  REPORT_GROUP_LABELS,
  REPORT_KINDS,
  REPORT_KIND_LABELS,
  REPORT_PARTNER_LABELS,
  REPORT_PRESETS,
} from "@/modules/report/codes";
import { kstDaysAgo, parseReportFilter, type ReportFilter } from "@/modules/report/validation";
import { getReportSummary } from "@/modules/report/queries";
import { todayKst } from "@/lib/datetime";

function qs(f: Pick<ReportFilter, "kind" | "group" | "from" | "to">, over: Partial<ReportFilter> = {}) {
  const m = { ...f, ...over };
  return new URLSearchParams({ kind: m.kind, group: m.group, from: m.from, to: m.to }).toString();
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection(); // 항상 요청 시점의 DB 데이터를 조회
  const user = await requirePageUser();
  if (!can(user.role, "admin")) return <Forbidden title="리포트" />;
  const f = parseReportFilter(await searchParams);
  const summary = f.error ? null : await getReportSummary(f);
  const kindLabel = REPORT_KIND_LABELS[f.kind];
  const firstCol = f.group === "partner" ? REPORT_PARTNER_LABELS[f.kind] : f.group === "day" ? "일자" : "상품";
  const colSpan = f.group === "product" ? 5 : 3;

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">리포트</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          기간별 확정 {kindLabel} 집계입니다. 대기·취소 건은 제외하며, 기간은 한국시간 기준 종료일을 포함합니다.
        </p>
      </div>

      <form className="mb-2 flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3">
        <NativeSelect name="kind" defaultValue={f.kind} className="[&_select]:bg-card" aria-label="구분">
          {REPORT_KINDS.map((k) => (
            <option key={k} value={k}>
              {REPORT_KIND_LABELS[k]}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="group" defaultValue={f.group} className="[&_select]:bg-card" aria-label="집계 기준">
          {REPORT_GROUPS.map((g) => (
            <option key={g} value={g}>
              {REPORT_GROUP_LABELS[g]}
            </option>
          ))}
        </NativeSelect>
        <Input type="date" name="from" defaultValue={f.from} max={todayKst()} className="w-40 bg-card" aria-label="시작일" />
        <span className="text-sm text-muted-foreground">~</span>
        <Input type="date" name="to" defaultValue={f.to} max={todayKst()} className="w-40 bg-card" aria-label="종료일" />
        <Button type="submit">
          <SearchIcon data-icon="inline-start" />
          조회
        </Button>
        <Link href="/reports" className={buttonVariants({ variant: "ghost" })}>
          <RotateCcwIcon data-icon="inline-start" />
          초기화
        </Link>
        {!f.error && (
          <a href={`/reports/export?${qs(f)}`} className={buttonVariants({ variant: "outline" }) + " ml-auto"}>
            <DownloadIcon data-icon="inline-start" />
            엑셀 내보내기
          </a>
        )}
      </form>

      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-sm text-muted-foreground">기간</span>
        {REPORT_PRESETS.map((p) => {
          const from = kstDaysAgo(p.days - 1);
          const to = todayKst();
          const on = f.from === from && f.to === to;
          return (
            <Link
              key={p.label}
              href={`/reports?${qs(f, { from, to })}`}
              className={buttonVariants({ variant: on ? "default" : "outline", size: "sm" })}
            >
              {p.label}
            </Link>
          );
        })}
      </div>

      {f.error && (
        <p role="alert" className="mb-4 rounded-lg border border-danger-foreground/30 bg-card px-4 py-3 text-sm text-danger-foreground">
          {f.error}
        </p>
      )}

      {summary && (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-2">
            <KpiCard label={`${kindLabel} 건수`} value={summary.totalCount.toLocaleString()} unit="건" icon={ReceiptTextIcon} note={`${f.from} ~ ${f.to}`} />
            <KpiCard
              label={`${kindLabel} 금액`}
              value={summary.totalAmount.toLocaleString()}
              unit="원"
              icon={WalletIcon}
              note={summary.noPriceCount > 0 ? `단가 없는 ${summary.noPriceCount.toLocaleString()}건 제외` : undefined}
            />
          </div>

          <div className="max-h-[60vh] overflow-auto rounded-lg border">
            <table className="data-table">
              <thead>
                <tr>
                  <th className={f.group === "day" ? "" : "left"}>{firstCol}</th>
                  {f.group === "product" && <th>단위</th>}
                  <th className="num">건수</th>
                  {f.group === "product" && <th className="num">수량</th>}
                  <th className="num">금액(원)</th>
                </tr>
              </thead>
              <tbody>
                {summary.rows.length === 0 && (
                  <tr>
                    <td colSpan={colSpan} className="p-0">
                      <EmptyState icon={BarChart3Icon} title="조건에 맞는 내역이 없습니다." description="기간이나 집계 기준을 바꿔 보세요." />
                    </td>
                  </tr>
                )}
                {summary.rows.map((r) => (
                  <tr key={r.key}>
                    <td className={f.group === "day" ? "tabular-nums" : "left"}>
                      {r.code && <span className="mr-2 text-muted-foreground tabular-nums">{r.code}</span>}
                      {r.label}
                    </td>
                    {f.group === "product" && <td>{r.unit}</td>}
                    <td className="num">{r.count.toLocaleString()}</td>
                    {f.group === "product" && <td className="num">{r.quantity?.toLocaleString()}</td>}
                    <td className="num">{r.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
              {summary.rows.length > 0 && (
                <tfoot>
                  <tr className="font-semibold">
                    <td className={f.group === "day" ? "" : "left"}>합계</td>
                    {f.group === "product" && <td />}
                    <td className="num">{summary.totalCount.toLocaleString()}</td>
                    {f.group === "product" && <td />}
                    <td className="num">{summary.totalAmount.toLocaleString()}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </>
      )}
    </div>
  );
}
