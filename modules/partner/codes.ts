// 거래처 라벨·상수 (서버/클라이언트 공용)

export type PartnerTypeCode = "SUPPLIER" | "CUSTOMER" | "BOTH";
/** 입출고·주문에서 거래처를 고르는 용도: 입고·발주 = 공급처, 출고·수주 = 출고처 */
export type PartnerKind = "SUPPLIER" | "CUSTOMER";

export const PARTNER_TYPES: PartnerTypeCode[] = ["SUPPLIER", "CUSTOMER", "BOTH"];

export const PARTNER_TYPE_LABELS: Record<PartnerTypeCode, string> = {
  SUPPLIER: "공급처",
  CUSTOMER: "출고처",
  BOTH: "공급처·출고처",
};

export const PARTNER_TYPE_TONE: Record<PartnerTypeCode, "sky" | "amber" | "indigo"> = {
  SUPPLIER: "sky",
  CUSTOMER: "amber",
  BOTH: "indigo",
};

export const PARTNER_KIND_LABELS: Record<PartnerKind, string> = {
  SUPPLIER: "공급처",
  CUSTOMER: "출고처",
};

export const PARTNER_LIMITS = {
  maxName: 100,
} as const;

export function isPartnerType(v: string): v is PartnerTypeCode {
  return (PARTNER_TYPES as string[]).includes(v);
}

/** 이 유형의 거래처를 해당 용도로 쓸 수 있는지 */
export function partnerAllows(type: PartnerTypeCode, kind: PartnerKind): boolean {
  return type === "BOTH" || type === kind;
}

/** 이름 정리: 앞뒤 공백 제거 + 연속 공백 1칸으로 (DB 에서 대소문자 무시 중복 검사) */
export function normalizePartnerName(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}
