// 입고 입력값 검증 (서버에서 반드시 실행)
import {
  UUID_RE,
  text,
  parseQuantity,
  parseOptionalMoney,
  parseOptionalText,
  parseDateTime,
  parseReason,
  parseRequestId,
  parseVersion,
  parseConfirm,
  parseOptionalDate,
} from "@/lib/form";
import { LOCATION_CODE_RE } from "@/modules/warehouse/codes";

export const INBOUND_LIMITS = {
  maxQuantity: 1_000_000,
  maxUnitCost: 100_000_000,
  maxSupplierLength: 100,
  maxMemoLength: 500,
  maxReasonLength: 200,
} as const;

export type InboundInput = {
  productId: string;
  quantity: number;
  unitCost: number | null;
  supplier: string | null;
  memo: string | null;
  receivedAt: Date;
};

/** 신규 입고 등록 입력 (중복 방지 정보 포함) */
export type InboundCreateInput = InboundInput & {
  /** 유통기한 "YYYY-MM-DD" (선택, 나중에 재고현황에서 입력 가능) */
  expiryDate: string | null;
  /** 넣을 위치코드 (선택, 비우면 상품 기본 보관위치) — 존재 여부는 서비스에서 확인 */
  locationCode: string | null;
  requestId: string;
  /** 유사 입고 경고를 확인하고 그래도 등록 */
  confirmDuplicate: boolean;
  /** 보관 온도 경고를 확인한 위치코드 (지금 위치코드와 같을 때만 경고를 건너뜀) */
  confirmedLocationCode: string | null;
};

export type InboundField = keyof InboundCreateInput;
export type InboundFieldErrors = Partial<Record<InboundField, string>>;

export type ParseResult =
  | { ok: true; data: InboundCreateInput }
  | { ok: false; errors: InboundFieldErrors };

/** 입고 수정 입력 (상품은 변경 불가) */
export type InboundUpdateInput = Omit<InboundInput, "productId"> & {
  inboundId: string;
  version: number;
  reason: string;
};
export type InboundUpdateField = keyof InboundUpdateInput;
export type InboundUpdateFieldErrors = Partial<Record<InboundUpdateField, string>>;
export type UpdateParseResult =
  | { ok: true; data: InboundUpdateInput }
  | { ok: false; errors: InboundUpdateFieldErrors };

const overMax = `한 번에 ${INBOUND_LIMITS.maxQuantity.toLocaleString()}개까지 입고할 수 있습니다.`;

function parseCommon(fd: FormData, now: Date, receivedAtRequired: boolean) {
  return {
    quantity: parseQuantity(fd, INBOUND_LIMITS.maxQuantity, overMax),
    unitCost: parseOptionalMoney(fd, "unitCost", "단가", INBOUND_LIMITS.maxUnitCost),
    supplier: parseOptionalText(fd, "supplier", "공급처", INBOUND_LIMITS.maxSupplierLength),
    memo: parseOptionalText(fd, "memo", "비고", INBOUND_LIMITS.maxMemoLength),
    receivedAt: parseDateTime(fd, "receivedAt", "입고일시", "입고", now, receivedAtRequired),
  };
}

export function parseInboundForm(fd: FormData, now = new Date()): ParseResult {
  const errors: InboundFieldErrors = {};

  const productId = text(fd, "productId");
  if (!productId) errors.productId = "상품을 선택하세요.";
  else if (!UUID_RE.test(productId)) errors.productId = "잘못된 상품입니다.";

  const c = parseCommon(fd, now, false);
  const requestId = parseRequestId(fd);
  const expiryDate = parseOptionalDate(fd, "expiryDate", "유통기한");
  for (const [k, r] of Object.entries({ ...c, requestId, expiryDate })) {
    if (r.error) errors[k as InboundField] = r.error;
  }
  const locationCode = text(fd, "locationCode").toUpperCase() || null;
  if (locationCode && !LOCATION_CODE_RE.test(locationCode)) {
    errors.locationCode = "위치코드 형식이 올바르지 않습니다. (예: RF1-R01-2-3)";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      productId,
      quantity: c.quantity.value,
      unitCost: c.unitCost.value,
      supplier: c.supplier.value,
      memo: c.memo.value,
      receivedAt: c.receivedAt.value,
      expiryDate: expiryDate.value,
      locationCode,
      requestId: requestId.value,
      confirmDuplicate: parseConfirm(fd),
      confirmedLocationCode: text(fd, "confirmedLocationCode").toUpperCase() || null,
    },
  };
}

export function parseInboundUpdateForm(fd: FormData, now = new Date()): UpdateParseResult {
  const errors: InboundUpdateFieldErrors = {};

  const inboundId = text(fd, "inboundId");
  if (!UUID_RE.test(inboundId)) errors.inboundId = "잘못된 입고 건입니다.";

  const version = parseVersion(fd);
  const reason = parseReason(fd, INBOUND_LIMITS.maxReasonLength);
  const c = parseCommon(fd, now, true);
  for (const [k, r] of Object.entries({ ...c, version, reason })) {
    if (r.error) errors[k as InboundUpdateField] = r.error;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      inboundId,
      version: version.value,
      quantity: c.quantity.value,
      unitCost: c.unitCost.value,
      supplier: c.supplier.value,
      memo: c.memo.value,
      receivedAt: c.receivedAt.value,
      reason: reason.value,
    },
  };
}

/** 입고 확정 (관리자): 단가 입력 가능 */
export type InboundConfirmInput = { inboundId: string; version: number; unitCost: number | null };

export function parseInboundConfirmForm(
  fd: FormData
): { ok: true; data: InboundConfirmInput } | { ok: false; message: string } {
  const inboundId = text(fd, "inboundId");
  const version = parseVersion(fd);
  if (!UUID_RE.test(inboundId) || version.error) return { ok: false, message: "잘못된 요청입니다. 새로고침 후 다시 시도하세요." };
  const unitCost = parseOptionalMoney(fd, "unitCost", "단가", INBOUND_LIMITS.maxUnitCost);
  if (unitCost.error) return { ok: false, message: unitCost.error };
  return { ok: true, data: { inboundId, version: version.value, unitCost: unitCost.value } };
}

/** 입고 취소(확정 건) · 삭제(대기 건): 사유 필수 */
export type InboundVoidInput = { inboundId: string; version: number; reason: string };

export function parseInboundVoidForm(
  fd: FormData
): { ok: true; data: InboundVoidInput } | { ok: false; message: string } {
  const inboundId = text(fd, "inboundId");
  const version = parseVersion(fd);
  if (!UUID_RE.test(inboundId) || version.error) return { ok: false, message: "잘못된 요청입니다. 새로고침 후 다시 시도하세요." };
  const reason = text(fd, "reason");
  if (!reason) return { ok: false, message: "사유를 입력하세요." };
  if (reason.length > INBOUND_LIMITS.maxReasonLength)
    return { ok: false, message: `사유는 ${INBOUND_LIMITS.maxReasonLength}자 이내로 입력하세요.` };
  return { ok: true, data: { inboundId, version: version.value, reason } };
}
