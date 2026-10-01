// 출고 입력값 검증 (서버에서 반드시 실행)
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

export const OUTBOUND_LIMITS = {
  maxQuantity: 1_000_000,
  maxUnitPrice: 100_000_000,
  maxCustomerLength: 100,
  maxMemoLength: 500,
  maxReasonLength: 200,
} as const;

export type OutboundInput = {
  productId: string;
  quantity: number;
  unitPrice: number | null;
  customer: string | null;
  memo: string | null;
  shippedAt: Date;
};

export type OutboundCreateInput = OutboundInput & {
  requestId: string;
  confirmDuplicate: boolean;
};
export type OutboundField = keyof OutboundCreateInput;
export type OutboundFieldErrors = Partial<Record<OutboundField, string>>;
export type OutboundParseResult =
  | { ok: true; data: OutboundCreateInput }
  | { ok: false; errors: OutboundFieldErrors };

/** 출고 수정 입력 (상품은 변경 불가) */
export type OutboundUpdateInput = Omit<OutboundInput, "productId"> & {
  outboundId: string;
  version: number;
  reason: string;
};
export type OutboundUpdateField = keyof OutboundUpdateInput;
export type OutboundUpdateFieldErrors = Partial<Record<OutboundUpdateField, string>>;
export type OutboundUpdateParseResult =
  | { ok: true; data: OutboundUpdateInput }
  | { ok: false; errors: OutboundUpdateFieldErrors };

const overMax = `한 번에 ${OUTBOUND_LIMITS.maxQuantity.toLocaleString()}개까지 출고할 수 있습니다.`;

function parseCommon(fd: FormData, now: Date, shippedAtRequired: boolean) {
  return {
    quantity: parseQuantity(fd, OUTBOUND_LIMITS.maxQuantity, overMax),
    unitPrice: parseOptionalMoney(fd, "unitPrice", "출고단가", OUTBOUND_LIMITS.maxUnitPrice),
    customer: parseOptionalText(fd, "customer", "출고처", OUTBOUND_LIMITS.maxCustomerLength),
    memo: parseOptionalText(fd, "memo", "비고", OUTBOUND_LIMITS.maxMemoLength),
    shippedAt: parseDateTime(fd, "shippedAt", "출고일시", "출고", now, shippedAtRequired),
  };
}

export function parseOutboundForm(fd: FormData, now = new Date()): OutboundParseResult {
  const errors: OutboundFieldErrors = {};

  const productId = text(fd, "productId");
  if (!productId) errors.productId = "상품을 선택하세요.";
  else if (!UUID_RE.test(productId)) errors.productId = "잘못된 상품입니다.";

  const c = parseCommon(fd, now, false);
  const requestId = parseRequestId(fd);
  for (const [k, r] of Object.entries({ ...c, requestId })) {
    if (r.error) errors[k as OutboundField] = r.error;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      productId,
      quantity: c.quantity.value,
      unitPrice: c.unitPrice.value,
      customer: c.customer.value,
      memo: c.memo.value,
      shippedAt: c.shippedAt.value,
      requestId: requestId.value,
      confirmDuplicate: parseConfirm(fd),
    },
  };
}

export function parseOutboundUpdateForm(fd: FormData, now = new Date()): OutboundUpdateParseResult {
  const errors: OutboundUpdateFieldErrors = {};

  const outboundId = text(fd, "outboundId");
  if (!UUID_RE.test(outboundId)) errors.outboundId = "잘못된 출고 건입니다.";

  const version = parseVersion(fd);
  const reason = parseReason(fd, OUTBOUND_LIMITS.maxReasonLength);
  const c = parseCommon(fd, now, true);
  for (const [k, r] of Object.entries({ ...c, version, reason })) {
    if (r.error) errors[k as OutboundUpdateField] = r.error;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    data: {
      outboundId,
      version: version.value,
      quantity: c.quantity.value,
      unitPrice: c.unitPrice.value,
      customer: c.customer.value,
      memo: c.memo.value,
      shippedAt: c.shippedAt.value,
      reason: reason.value,
    },
  };
}
