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

export const DISPATCH_STATUS_TONE: Record<DispatchStatusCode, "gray" | "slate" | "sky" | "amber" | "green" | "red"> = {
  PLANNED: "gray",
  LOADED: "sky",
  IN_TRANSIT: "amber",
  DELIVERED: "green",
  CANCELLED: "red",
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
