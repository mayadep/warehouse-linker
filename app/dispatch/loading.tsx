import { CardListSkeleton, PageHeaderSkeleton, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="불러오는 중">
      <PageHeaderSkeleton action />
      <Skeleton className="mb-4 h-9 w-48" />
      <CardListSkeleton />
    </div>
  );
}
