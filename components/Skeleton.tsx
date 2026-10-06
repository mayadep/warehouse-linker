import { cn } from "cn";
import { Card } from "@/components/Card";

/** 로딩 자리표시 블록. 페이지 전체를 스피너로 막지 않고 카드·표 모양을 미리 보여준다 */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-border", className)} />;
}

/** KpiCard 와 같은 크기의 로딩 카드 */
export function KpiCardSkeleton() {
  return (
    <Card as="div">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-4 h-8 w-28" />
      <Skeleton className="mt-3 h-3.5 w-24" />
    </Card>
  );
}

/** 표 모양 로딩 (헤더 1줄 + 행 N줄) */
export function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-card" role="status" aria-label="불러오는 중">
      <div className="h-10 border-b bg-surface-subtle" />
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

/** 페이지 제목 줄 (제목 + 선택 설명 + 우측 버튼 자리) */
export function PageHeaderSkeleton({ description = false, action = false }: { description?: boolean; action?: boolean }) {
  return (
    <div className="mb-6 flex items-center justify-between gap-4">
      <div>
        <Skeleton className="h-7 w-40" />
        {description && <Skeleton className="mt-2 h-4 w-72" />}
      </div>
      {action && <Skeleton className="h-9 w-28" />}
    </div>
  );
}

/** 검색·필터 바 */
export function FilterBarSkeleton({ fields = 3 }: { fields?: number }) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3">
      {Array.from({ length: fields }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-36" />
      ))}
      <Skeleton className="h-9 w-16" />
    </div>
  );
}

/** 입력 폼 카드 */
export function FormSkeleton({ fields = 6 }: { fields?: number }) {
  return (
    <Card as="div" role="status" aria-label="불러오는 중">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i}>
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="mt-2 h-9 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="mt-5 h-9 w-24" />
    </Card>
  );
}

/** 카드 목록 (배차·창고 등) */
export function CardListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" role="status" aria-label="불러오는 중">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} as="div">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-3 h-3.5 w-48" />
          <Skeleton className="mt-2 h-3.5 w-40" />
        </Card>
      ))}
    </div>
  );
}
