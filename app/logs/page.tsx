import Link from "next/link";
import Forbidden from "@/components/Forbidden";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { connection } from "next/server";
import {
  AUDIT_CATEGORIES,
  AUDIT_CATEGORY_LABELS,
  AUDIT_CATEGORY_TONE,
  AUDIT_FIELD_LABELS,
  auditActionLabel,
  type AuditCategoryCode,
} from "@/modules/audit/codes";
import { listAuditLogs, parseAuditFilter, type AuditFilter } from "@/modules/audit/queries";
import { ChevronLeftIcon, ChevronRightIcon, ClipboardListIcon, RotateCcwIcon, SearchIcon } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";

const dateTimeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

/** 현재 필터를 유지한 채 페이지만 바꾼 URL */
function pageHref(f: AuditFilter, page: number): string {
  const sp = new URLSearchParams();
  if (f.category) sp.set("category", f.category);
  if (f.q) sp.set("q", f.q);
  if (f.from) sp.set("from", f.from);
  if (f.to) sp.set("to", f.to);
  if (page > 1) sp.set("page", String(page));
  const qs = sp.toString();
  return qs ? `/logs?${qs}` : "/logs";
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "number") return v.toLocaleString();
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "예" : "아니오";
  return JSON.stringify(v);
}

/** 상세 JSON → "항목: 값" 줄 목록 (before/after 가 있으면 "전 → 후") */
function detailLines(detail: unknown): string[] {
  if (!detail || typeof detail !== "object" || Array.isArray(detail)) return [];
  const d = detail as Record<string, unknown>;
  const label = (k: string) => AUDIT_FIELD_LABELS[k] ?? k;
  const out: string[] = [];
  const { before, after, ...rest } = d;
  if (before && after && typeof before === "object" && typeof after === "object") {
    const b = before as Record<string, unknown>;
    for (const [k, v] of Object.entries(after as Record<string, unknown>)) {
      out.push(`${label(k)}: ${fmtValue(b[k])} → ${fmtValue(v)}`);
    }
  }
  for (const [k, v] of Object.entries(rest)) out.push(`${label(k)}: ${fmtValue(v)}`);
  return out;
}

export default async function LogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection(); // 항상 요청 시점의 DB 데이터를 조회
  const user = await requirePageUser();
  if (!can(user.role, "admin")) return <Forbidden title="로그" />;
  const filter = parseAuditFilter(await searchParams);
  const { rows, total, page, totalPages } = await listAuditLogs(filter);

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">로그</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          모든 등록·수정·처리 작업 기록입니다. 기록은 수정하거나 삭제할 수 없습니다.
        </p>
      </div>

      <form className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3">
        <NativeSelect name="category" defaultValue={filter.category} className="[&_select]:bg-card">
          <option value="">전체 구분</option>
          {AUDIT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {AUDIT_CATEGORY_LABELS[c]}
            </option>
          ))}
        </NativeSelect>
        <Input type="date" name="from" defaultValue={filter.from} className="w-40 bg-card" aria-label="시작일" />
        <span className="text-sm text-muted-foreground">~</span>
        <Input type="date" name="to" defaultValue={filter.to} className="w-40 bg-card" aria-label="종료일" />
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="w-64 bg-card pl-8" name="q" defaultValue={filter.q} placeholder="대상·내용 검색" />
        </div>
        <Button type="submit">
          <SearchIcon data-icon="inline-start" />
          조회
        </Button>
        <Link href="/logs" className={buttonVariants({ variant: "ghost" })}>
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
              <th>구분</th>
              <th>작업</th>
              <th className="left">대상</th>
              <th className="left">내용</th>
              <th>작업자</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-0">
                  <EmptyState icon={ClipboardListIcon} title="조건에 맞는 기록이 없습니다." description="기간이나 검색 조건을 바꿔 보세요." />
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const cat = r.category as AuditCategoryCode;
              const lines = detailLines(r.detail);
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap text-muted-foreground tabular-nums">{dateTimeFmt.format(r.createdAt)}</td>
                  <td>
                    <Badge variant={AUDIT_CATEGORY_TONE[cat]}>{AUDIT_CATEGORY_LABELS[cat]}</Badge>
                  </td>
                  <td className="whitespace-nowrap">{auditActionLabel(r.action)}</td>
                  <td className="left max-w-48 truncate" title={r.targetLabel ?? undefined}>
                    {r.targetLabel ?? "-"}
                  </td>
                  <td className="left max-w-xl">
                    {lines.length > 0 ? (
                      <details>
                        <summary className="cursor-pointer">{r.summary}</summary>
                        <ul className="mt-1 inline-block space-y-0.5 text-left text-xs text-muted-foreground">
                          {lines.map((l, i) => (
                            <li key={i}>{l}</li>
                          ))}
                        </ul>
                      </details>
                    ) : (
                      r.summary
                    )}
                  </td>
                  <td className="text-muted-foreground">{r.actor ?? "-"}</td>
                </tr>
              );
            })}
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
    </div>
  );
}
