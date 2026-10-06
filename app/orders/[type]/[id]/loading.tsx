import { KpiCardSkeleton, Skeleton, TableSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="불러오는 중">
      <Skeleton className="h-4 w-24" />
      <div className="mt-2 mb-5 flex items-center justify-between gap-4">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="mb-5 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <KpiCardSkeleton />
        <KpiCardSkeleton />
        <KpiCardSkeleton />
        <KpiCardSkeleton />
      </div>
      <TableSkeleton rows={5} />
    </div>
  );
}
