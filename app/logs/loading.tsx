import { FilterBarSkeleton, PageHeaderSkeleton, TableSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="불러오는 중">
      <PageHeaderSkeleton description />
      <FilterBarSkeleton />
      <TableSkeleton />
    </div>
  );
}
