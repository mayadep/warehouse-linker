// 배차 상수·규칙 (서버/클라이언트 공용)
import type { StorageTypeCode } from "@/modules/warehouse/codes";

export type DispatchStatusCode = "PLANNED" | "LOADED" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED";

export const DISPATCH_STATUS_LABELS: Record<DispatchStatusCode, string> = {
  PLANNED: "배차",
  LOADED: "상차 완료",
  IN_TRANSIT: "배송중",
  DELIVERED: "배송 완료",
  CANCELLED: "취소",
};

export const DISPATCH_STATUS_STYLE: Record<DispatchStatusCode, string> = {
  PLANNED: "bg-gray-100 text-gray-700",
  LOADED: "bg-sky-100 text-sky-800",
  IN_TRANSIT: "bg-amber-100 text-amber-800",
  DELIVERED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-700",
};

/** 다음 단계와 버튼 문구 */
export const DISPATCH_NEXT: Partial<Record<DispatchStatusCode, { to: DispatchStatusCode; label: string }>> = {
  PLANNED: { to: "LOADED", label: "상차 완료" },
  LOADED: { to: "IN_TRANSIT", label: "출발" },
  IN_TRANSIT: { to: "DELIVERED", label: "배송 완료" },
};

/** 취소 가능한 단계 (출발 전까지) */
export const DISPATCH_CANCELLABLE: DispatchStatusCode[] = ["PLANNED", "LOADED"];

/** 온도 등급: 냉동(2) > 냉장(1) > 실온(0). 차량 등급이 상품 등급 이상이면 실을 수 있다. */
const RANK: Record<StorageTypeCode, number> = { AMBIENT: 0, REFRIGERATED: 1, FROZEN: 2 };

export function canCarry(vehicleType: StorageTypeCode, requiredType: StorageTypeCode): boolean {
  return RANK[vehicleType] >= RANK[requiredType];
}

export const DISPATCH_LIMITS = {
  maxItemsPerRequest: 100,
  maxMemoLength: 200,
  unassignedDays: 14, // 배차 대상 출고 조회 기간 (최근 N일)
} as const;
