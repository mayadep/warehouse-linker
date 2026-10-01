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
} from "@/lib/form";

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
  requestId: string;
  /** 유사 입고 경고를 확인하고 그래도 등록 */
  confirmDuplicate: boolean;
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
  for (const [k, r] of Object.entries({ ...c, requestId })) {
    if (r.error) errors[k as InboundField] = r.error;
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
      requestId: requestId.value,
      confirmDuplicate: parseConfirm(fd),
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
