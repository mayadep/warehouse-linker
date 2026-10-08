// 거래처 입력값 검증 (서버에서 반드시 실행)
import { UUID_RE, parseVersion, text } from "@/lib/form";
import {
  isPartnerType,
  normalizePartnerName,
  PARTNER_KIND_LABELS,
  PARTNER_LIMITS,
  type PartnerKind,
  type PartnerTypeCode,
} from "./codes";

export type PartnerFieldErrors = Partial<Record<"name" | "type" | "isActive" | "partnerId" | "version", string>>;
type Result<T> = { ok: true; data: T } | { ok: false; errors: PartnerFieldErrors; message?: string };

function parseName(fd: FormData, errors: PartnerFieldErrors): string {
  const name = normalizePartnerName(text(fd, "name"));
  if (!name) errors.name = "거래처명을 입력하세요.";
  else if (name.length > PARTNER_LIMITS.maxName) errors.name = `거래처명은 ${PARTNER_LIMITS.maxName}자 이내로 입력하세요.`;
  return name;
}

function parseType(fd: FormData, errors: PartnerFieldErrors): PartnerTypeCode {
  const type = text(fd, "type");
  if (!isPartnerType(type)) {
    errors.type = "거래처 구분을 선택하세요.";
    return "SUPPLIER";
  }
  return type;
}

export type PartnerCreateInput = { name: string; type: PartnerTypeCode };

export function parsePartnerCreateForm(fd: FormData): Result<PartnerCreateInput> {
  const errors: PartnerFieldErrors = {};
  const name = parseName(fd, errors);
  const type = parseType(fd, errors);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { name, type } };
}

export type PartnerUpdateInput = { partnerId: string; version: number; name: string; type: PartnerTypeCode; isActive: boolean };

export function parsePartnerUpdateForm(fd: FormData): Result<PartnerUpdateInput> {
  const errors: PartnerFieldErrors = {};
  const partnerId = text(fd, "partnerId");
  const version = parseVersion(fd);
  if (!UUID_RE.test(partnerId) || version.error) {
    return { ok: false, errors: {}, message: "잘못된 요청입니다. 새로고침 후 다시 시도하세요." };
  }
  const name = parseName(fd, errors);
  const type = parseType(fd, errors);
  const active = text(fd, "isActive");
  if (active !== "1" && active !== "0") errors.isActive = "사용 여부를 선택하세요.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { partnerId, version: version.value, name, type, isActive: active === "1" } };
}

/**
 * 입출고·주문 폼의 거래처 선택값 (partnerId). 형식만 확인하고,
 * 존재·사용 여부·용도(공급처/출고처)는 서비스의 resolvePartner 에서 확인한다.
 */
export function parsePartnerId(
  fd: FormData,
  kind: PartnerKind,
  required: boolean
): { value: string | null; error?: string } {
  const label = PARTNER_KIND_LABELS[kind];
  const v = text(fd, "partnerId");
  if (!v) return required ? { value: null, error: `${label}를 선택하세요.` } : { value: null };
  if (!UUID_RE.test(v)) return { value: null, error: `잘못된 ${label}입니다.` };
  return { value: v };
}
