import type { StockAdjustReason } from "@prisma/client";

/** 재고조정 사유: 감소(-) / 증가(+) 방향은 사유가 정한다 */
export const ADJUST_REASONS: { value: StockAdjustReason; label: string; sign: 1 | -1 }[] = [
  { value: "EXPIRED", label: "유통기한 경과 폐기", sign: -1 },
  { value: "SPOILED", label: "부패·변질 폐기", sign: -1 },
  { value: "DAMAGED", label: "파손", sign: -1 },
  { value: "LOST", label: "분실", sign: -1 },
  { value: "COUNT_MINUS", label: "실사 감소", sign: -1 },
  { value: "OTHER_MINUS", label: "기타 감소", sign: -1 },
  { value: "COUNT_PLUS", label: "실사 증가", sign: 1 },
  { value: "OTHER_PLUS", label: "기타 증가", sign: 1 },
];

export const ADJUST_REASON_LABELS = Object.fromEntries(ADJUST_REASONS.map((r) => [r.value, r.label])) as Record<
  StockAdjustReason,
  string
>;

export const ADJUST_MEMO_MAX = 200;
