// 폼 입력값 공통 파서 (서버 검증용). 각 모듈 validation 에서 사용한다.
import { isDateOnly, parseKstDateTimeLocal } from "./datetime";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const INT_RE = /^\d+$/;

export type FieldResult<T> = { value: T; error?: string };

export function text(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

/** 수량 입력 단위: BOX 면 박스 수로 입력 (서버에서 박스당 입수를 곱해 기본단위로 환산) */
export function isBoxQtyUnit(fd: FormData): boolean {
  return text(fd, "qtyUnit") === "BOX";
}

/** 1 이상 정수 수량 */
export function parseQuantity(fd: FormData, max: number, overMaxMessage: string): FieldResult<number> {
  const raw = text(fd, "quantity").replaceAll(",", "");
  if (!raw) return { value: 0, error: "수량을 입력하세요." };
  if (!INT_RE.test(raw)) return { value: 0, error: "수량은 1 이상의 정수여야 합니다." };
  const n = Number(raw);
  if (n < 1) return { value: 0, error: "수량은 1 이상이어야 합니다." };
  if (n > max) return { value: 0, error: overMaxMessage };
  return { value: n };
}

/** 선택 입력 금액 (0 이상 정수, 빈값 null) */
export function parseOptionalMoney(
  fd: FormData,
  key: string,
  label: string,
  max: number
): FieldResult<number | null> {
  const raw = text(fd, key).replaceAll(",", "");
  if (!raw) return { value: null };
  if (!INT_RE.test(raw)) return { value: null, error: `${label}는 0 이상의 정수여야 합니다.` };
  const n = Number(raw);
  if (n > max) return { value: null, error: `${label}가 너무 큽니다.` };
  return { value: n };
}

export function parseOptionalText(
  fd: FormData,
  key: string,
  label: string,
  max: number
): FieldResult<string | null> {
  const v = text(fd, key);
  if (v.length > max) return { value: null, error: `${label}는 ${max}자 이내로 입력하세요.` };
  return { value: v || null };
}

/** 선택 입력 날짜 "YYYY-MM-DD" (빈값 null). 유통기한 등 시각 없는 날짜 */
export function parseOptionalDate(fd: FormData, key: string, label: string): FieldResult<string | null> {
  const v = text(fd, key);
  if (!v) return { value: null };
  if (!isDateOnly(v)) return { value: null, error: `${label} 형식이 올바르지 않습니다. (예: 2026-12-31)` };
  const y = Number(v.slice(0, 4));
  if (y < 2000 || y > 2100) return { value: null, error: `${label}가 올바르지 않습니다.` };
  return { value: v };
}

/** 일시(KST datetime-local): 비어 있으면 required 여부에 따라 now 또는 오류. 미래 시각 불가 */
export function parseDateTime(
  fd: FormData,
  key: string,
  label: string,
  verb: string,
  now: Date,
  required: boolean
): FieldResult<Date> {
  const raw = text(fd, key);
  if (!raw) return required ? { value: now, error: `${label}를 입력하세요.` } : { value: now };
  const d = parseKstDateTimeLocal(raw);
  if (!d) return { value: now, error: `${label} 형식이 올바르지 않습니다.` };
  if (d.getTime() > now.getTime() + 5 * 60 * 1000)
    return { value: now, error: `미래 시각으로 ${verb}할 수 없습니다.` };
  if (d.getFullYear() < 2000) return { value: now, error: `${label}가 올바르지 않습니다.` };
  return { value: d };
}

export function parseReason(fd: FormData, max: number): FieldResult<string> {
  const v = text(fd, "reason");
  if (!v) return { value: "", error: "수정 사유를 입력하세요." };
  if (v.length > max) return { value: "", error: `수정 사유는 ${max}자 이내로 입력하세요.` };
  return { value: v };
}

export function parseRequestId(fd: FormData): FieldResult<string> {
  const v = text(fd, "requestId");
  if (!UUID_RE.test(v)) return { value: "", error: "잘못된 요청입니다. 새로고침 후 다시 시도하세요." };
  return { value: v.toLowerCase() };
}

export function parseVersion(fd: FormData): FieldResult<number> {
  const raw = text(fd, "version");
  if (!INT_RE.test(raw)) return { value: -1, error: "잘못된 요청입니다. 새로고침 후 다시 시도하세요." };
  return { value: Number(raw) };
}

/** 유사 건 경고를 확인하고 그래도 등록하는 경우 "1" */
export function parseConfirm(fd: FormData, key = "confirmDuplicate"): boolean {
  return text(fd, key) === "1";
}
