import type { CycleCountStatus } from "@prisma/client";

export const COUNT_STATUS_LABELS: Record<CycleCountStatus, string> = {
  COUNTING: "실사 중",
  CONFIRMED: "확정",
  CANCELLED: "취소",
};

export const COUNT_STATUS_TONE: Record<CycleCountStatus, "indigo" | "gray" | "red"> = {
  COUNTING: "indigo",
  CONFIRMED: "gray",
  CANCELLED: "red",
};

export const COUNT_LIMITS = {
  maxLines: 3000, // 실사표 한 장의 최대 줄 수 (넘으면 범위를 좁힌다)
  maxQty: 10_000_000,
  maxMemo: 200,
  maxScope: 60,
} as const;
