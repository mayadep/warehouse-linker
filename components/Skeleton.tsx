import { cn } from "cn";

/** 로딩 자리표시 블록. 페이지 전체를 스피너로 막지 않고 카드·표 모양을 미리 보여준다 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-[#e3e8f0]", className)} />;
}

/** KpiCard 와 같은 크기의 로딩 카드 */
export function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-4 h-8 w-28" />
      <Skeleton className="mt-3 h-3.5 w-24" />
    </div>
  );
}

/** 표 모양 로딩 (헤더 1줄 + 행 N줄) */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card" role="status" aria-label="불러오는 중">
      <div className="h-10 border-b bg-[#f8fafc]" />
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-12 items-center gap-6 border-b px-4 last:border-b-0">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 flex-1" />
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="h-3.5 w-20" />
        </div>
      ))}
    </div>
  );
}
