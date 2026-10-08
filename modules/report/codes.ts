// 기간별 리포트 라벨·상수
export const REPORT_KINDS = ["inbound", "outbound"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];
export const REPORT_KIND_LABELS: Record<ReportKind, string> = { inbound: "입고", outbound: "출고" };
/** 거래처 칸 이름 (입고 = 공급처, 출고 = 출고처) */
export const REPORT_PARTNER_LABELS: Record<ReportKind, string> = { inbound: "공급처", outbound: "출고처" };

export const REPORT_GROUPS = ["day", "product", "partner"] as const;
export type ReportGroup = (typeof REPORT_GROUPS)[number];
export const REPORT_GROUP_LABELS: Record<ReportGroup, string> = { day: "일자별", product: "상품별", partner: "거래처별" };

export const REPORT_LIMITS = {
  maxDays: 366, // 조회 기간 최대 일수
  defaultDays: 7, // 기본 조회 기간 (오늘 포함)
  maxDetailRows: 50000, // 엑셀 상세 시트 최대 행
} as const;

/** 기간 바로가기: 오늘 포함 N일 */
export const REPORT_PRESETS = [
  { label: "오늘", days: 1 },
  { label: "7일", days: 7 },
  { label: "30일", days: 30 },
] as const;
