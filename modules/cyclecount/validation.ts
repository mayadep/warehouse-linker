// 재고 실사 입력값 검증 (서버에서 반드시 실행)
import { INT_RE, UUID_RE, parseOptionalDate, parseOptionalText, parseRequestId, parseVersion, text } from "@/lib/form";
import { COUNT_LIMITS } from "./codes";

type Fail = { ok: false; message: string };

export type CountCreateInput = { requestId: string; warehouseId: string | null; locationPrefix: string; memo: string | null };

/** 실사표 만들기: 창고 또는 위치코드 앞부분 중 하나 이상 필수 */
export function parseCountCreateForm(fd: FormData): { ok: true; data: CountCreateInput } | Fail {
  const requestId = parseRequestId(fd);
  if (requestId.error) return { ok: false, message: requestId.error };
  const warehouseId = text(fd, "warehouseId");
  if (warehouseId && !UUID_RE.test(warehouseId)) return { ok: false, message: "잘못된 창고입니다." };
  const locationPrefix = text(fd, "locationPrefix").toUpperCase();
  if (locationPrefix && !/^[A-Z0-9-]{1,30}$/.test(locationPrefix)) {
    return { ok: false, message: "위치코드 앞부분은 영문 대문자·숫자·- 로 입력하세요. (예: RF1-R01)" };
  }
  if (!warehouseId && !locationPrefix) return { ok: false, message: "창고를 고르거나 위치코드 앞부분을 입력하세요." };
  const memo = parseOptionalText(fd, "memo", "메모", COUNT_LIMITS.maxMemo);
  if (memo.error) return { ok: false, message: memo.error };
  return { ok: true, data: { requestId: requestId.value, warehouseId: warehouseId || null, locationPrefix, memo: memo.value } };
}

/** 실사 수량 입력 (빈 값 = 입력 취소) */
export function parseCountLineForm(fd: FormData): { ok: true; data: { lineId: string; countedQty: number | null } } | Fail {
  const lineId = text(fd, "lineId");
  if (!UUID_RE.test(lineId)) return { ok: false, message: "잘못된 실사 줄입니다." };
  const raw = text(fd, "countedQty").replaceAll(",", "");
  if (!raw) return { ok: true, data: { lineId, countedQty: null } };
  if (!INT_RE.test(raw)) return { ok: false, message: "실사 수량은 0 이상의 정수여야 합니다." };
  const countedQty = Number(raw);
  if (countedQty > COUNT_LIMITS.maxQty) return { ok: false, message: "실사 수량이 너무 큽니다." };
  return { ok: true, data: { lineId, countedQty } };
}

export type CountFoundInput = {
  countId: string;
  /** 상품코드(SKU) 또는 상품 바코드 */
  productKey: string;
  locationCode: string;
  expiryDate: string | null;
  countedQty: number;
};

/** 발견분 추가: 실사표에 없던 재고(장부 0)를 위치·상품·수량으로 추가 */
export function parseCountFoundForm(fd: FormData): { ok: true; data: CountFoundInput } | Fail {
  const countId = text(fd, "countId");
  const productKey = text(fd, "productKey").replace(/\s+/g, "");
  if (!UUID_RE.test(countId)) return { ok: false, message: "잘못된 요청입니다." };
  if (!productKey || productKey.length > 40) return { ok: false, message: "상품코드 또는 바코드를 입력하세요." };
  const locationCode = text(fd, "locationCode").toUpperCase();
  if (!/^[A-Z0-9-]{3,40}$/.test(locationCode)) return { ok: false, message: "위치코드 형식이 올바르지 않습니다. (예: RF1-R01-2-3)" };
  const expiry = parseOptionalDate(fd, "expiryDate", "유통기한");
  if (expiry.error) return { ok: false, message: expiry.error };
  const raw = text(fd, "countedQty").replaceAll(",", "");
  if (!INT_RE.test(raw) || Number(raw) < 1) return { ok: false, message: "수량은 1 이상의 정수여야 합니다." };
  if (Number(raw) > COUNT_LIMITS.maxQty) return { ok: false, message: "실사 수량이 너무 큽니다." };
  return { ok: true, data: { countId, productKey, locationCode, expiryDate: expiry.value, countedQty: Number(raw) } };
}

/** 확정·취소 (version 으로 동시 처리 방지) */
export function parseCountTransitionForm(fd: FormData): { ok: true; data: { countId: string; version: number } } | Fail {
  const countId = text(fd, "countId");
  if (!UUID_RE.test(countId)) return { ok: false, message: "잘못된 실사표입니다." };
  const version = parseVersion(fd);
  if (version.error) return { ok: false, message: version.error };
  return { ok: true, data: { countId, version: version.value } };
}
