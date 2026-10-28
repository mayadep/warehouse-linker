import { CardListSkeleton, Skeleton } from "@/components/Skeleton";

export default function Loading() {
  return (
    <div role="status" aria-label="불러오는 중">
      <Skeleton className="h-4 w-20" />
      <div className="mt-2 mb-6">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="mt-2 h-4 w-96" />
      </div>
      <CardListSkeleton count={3} />
    </div>
  );
}
