import { FormSkeleton, PageHeaderSkeleton, TableSkeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="불러오는 중">
      <PageHeaderSkeleton />
      <FormSkeleton />
      <div className="mt-10">
        <TableSkeleton rows={6} />
      </div>
    </div>
  );
}
