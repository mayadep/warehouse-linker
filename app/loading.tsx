import { KpiCardSkeleton, Skeleton, TableSkeleton } from "@/components/Skeleton";

/** 페이지 이동 중 보여 주는 공통 로딩 화면 (제목 + KPI 카드 + 표 모양). 스피너로 화면 전체를 막지 않는다 */
export default function Loading() {
  return (
    <div role="status" aria-label="불러오는 중">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="mt-2 h-4 w-72" />
      <div className="mt-6 mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCardSkeleton />
        <KpiCardSkeleton />
        <KpiCardSkeleton />
        <KpiCardSkeleton />
      </div>
      <TableSkeleton />
    </div>
  );
}
