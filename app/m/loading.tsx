import { Skeleton } from "@/components/Skeleton";

/** 현장 화면 이동 중 로딩 (PC 표 모양 대신 카드 모양) */
export default function MobileLoading() {
  return (
    <div role="status" aria-label="불러오는 중" className="flex flex-col gap-3">
      <Skeleton className="h-7 w-32" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}
