import { FilterBarSkeleton, KpiCardSkeleton, PageHeaderSkeleton, TableSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="불러오는 중">
      <PageHeaderSkeleton />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCardSkeleton />
        <KpiCardSkeleton />
        <KpiCardSkeleton />
        <KpiCardSkeleton />
      </div>
      <FilterBarSkeleton />
      <TableSkeleton />
    </div>
  );
}
