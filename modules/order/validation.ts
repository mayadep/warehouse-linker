// 수발주 입력값 검증 (서버에서 반드시 실행)
import { INT_RE, UUID_RE, parseDateTime, parseOptionalText, parseRequestId, parseVersion, text } from "@/lib/form";
import { parseKstDate } from "@/lib/datetime";
import { ORDER_LIMITS as L, type OrderTypeCode } from "./codes";

export type OrderLineInput = { productId: string; quantity: number; unitPrice: number | null };
export type OrderCreateInput = {
  type: OrderTypeCode;
  partner: string;
  dueDate: Date | null;
  memo: string | null;
  requestId: string;
  lines: OrderLineInput[];
};
export type OrderCreateErrors = Partial<Record<"partner" | "dueDate" | "memo" | "lines" | "requestId" | "type", string>>;

/** 품목 줄은 화면에서 JSON 으로 보낸다: [{productId, quantity, unitPrice}] */
function parseJsonArray(raw: string): unknown[] | null {
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

function toInt(v: unknown): number | null {
  if (typeof v === "number" && Number.isInteger(v)) return v;
  if (typeof v === "string" && INT_RE.test(v.trim().replaceAll(",", ""))) return Number(v.trim().replaceAll(",", ""));
  return null;
}

export function parseOrderCreateForm(
  fd: FormData
): { ok: true; data: OrderCreateInput } | { ok: false; errors: OrderCreateErrors } {
  const errors: OrderCreateErrors = {};
  const typeRaw = text(fd, "type");
  const type: OrderTypeCode = typeRaw === "SALES" ? "SALES" : "PURCHASE";
  if (typeRaw !== "SALES" && typeRaw !== "PURCHASE") errors.type = "잘못된 요청입니다.";
  const partnerLabel = type === "PURCHASE" ? "공급처" : "거래처";

  const partner = text(fd, "partner");
  if (!partner) errors.partner = `${partnerLabel}를 입력하세요.`;
  else if (partner.length > L.maxPartnerLength) errors.partner = `${partnerLabel}는 ${L.maxPartnerLength}자 이내로 입력하세요.`;

  const dueRaw = text(fd, "dueDate");
  let dueDate: Date | null = null;
  if (dueRaw) {
    dueDate = parseKstDate(dueRaw);
    if (!dueDate) errors.dueDate = "날짜 형식이 올바르지 않습니다.";
  }

  const memo = parseOptionalText(fd, "memo", "비고", L.maxMemoLength);
  if (memo.error) errors.memo = memo.error;
  const requestId = parseRequestId(fd);
  if (requestId.error) errors.requestId = requestId.error;

  const arr = parseJsonArray(text(fd, "lines"));
  const lines: OrderLineInput[] = [];
  if (!arr || arr.length === 0) errors.lines = "품목을 1개 이상 추가하세요.";
  else if (arr.length > L.maxLines) errors.lines = `품목은 ${L.maxLines}개까지 넣을 수 있습니다.`;
  else {
    const seen = new Set<string>();
    for (let i = 0; i < arr.length; i++) {
      const row = arr[i] as Record<string, unknown>;
      const no = `${i + 1}번째 품목`;
      const productId = typeof row?.productId === "string" ? row.productId : "";
      const quantity = toInt(row?.quantity);
      const priceRaw = row?.unitPrice;
      const unitPrice = priceRaw === null || priceRaw === undefined || priceRaw === "" ? null : toInt(priceRaw);
      if (!UUID_RE.test(productId)) { errors.lines = `${no}: 상품을 선택하세요.`; break; }
      if (seen.has(productId)) { errors.lines = `${no}: 같은 상품이 두 번 들어 있습니다. 수량을 합쳐 주세요.`; break; }
      if (quantity === null || quantity < 1 || quantity > L.maxQuantity) { errors.lines = `${no}: 수량은 1~${L.maxQuantity.toLocaleString()} 사이 정수여야 합니다.`; break; }
      if (priceRaw !== null && priceRaw !== undefined && priceRaw !== "" && (unitPrice === null || unitPrice < 0 || unitPrice > L.maxUnitPrice)) { errors.lines = `${no}: 단가는 0 이상의 정수여야 합니다.`; break; }
      seen.add(productId);
      lines.push({ productId, quantity, unitPrice });
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { type, partner, dueDate, memo: memo.value, requestId: requestId.value, lines } };
}

export type OrderProcessInput = {
  orderId: string;
  version: number;
  requestId: string;
  at: Date;
  memo: string | null;
  lines: { lineId: string; quantity: number }[];
};

/** 발주 입고 / 수주 출고 처리 */
export function parseOrderProcessForm(
  fd: FormData,
  now = new Date()
): { ok: true; data: OrderProcessInput } | { ok: false; message: string } {
  const orderId = text(fd, "orderId");
  if (!UUID_RE.test(orderId)) return { ok: false, message: "잘못된 주문입니다." };
  const version = parseVersion(fd);
  if (version.error) return { ok: false, message: version.error };
  const requestId = parseRequestId(fd);
  if (requestId.error) return { ok: false, message: requestId.error };
  const at = parseDateTime(fd, "at", "처리일시", "처리", now, false);
  if (at.error) return { ok: false, message: at.error };
  const memo = parseOptionalText(fd, "memo", "비고", L.maxMemoLength);
  if (memo.error) return { ok: false, message: memo.error };

  const arr = parseJsonArray(text(fd, "lines"));
  if (!arr) return { ok: false, message: "잘못된 요청입니다." };
  const lines: { lineId: string; quantity: number }[] = [];
  const seen = new Set<string>();
  for (const r of arr) {
    const row = r as Record<string, unknown>;
    const lineId = typeof row?.lineId === "string" ? row.lineId : "";
    const q = toInt(row?.quantity);
    if (!UUID_RE.test(lineId) || seen.has(lineId)) return { ok: false, message: "잘못된 요청입니다." };
    if (q === null || q < 0 || q > L.maxQuantity) return { ok: false, message: "처리 수량은 0 이상의 정수여야 합니다." };
    seen.add(lineId);
    if (q > 0) lines.push({ lineId, quantity: q });
  }
  if (lines.length === 0) return { ok: false, message: "처리할 수량을 1개 이상 입력하세요." };

  return {
    ok: true,
    data: { orderId, version: version.value, requestId: requestId.value, at: at.value, memo: memo.value, lines },
  };
}

export function parseOrderRefForm(fd: FormData): { ok: true; orderId: string; version: number } | { ok: false; message: string } {
  const orderId = text(fd, "orderId");
  if (!UUID_RE.test(orderId)) return { ok: false, message: "잘못된 주문입니다." };
  const version = parseVersion(fd);
  if (version.error) return { ok: false, message: version.error };
  return { ok: true, orderId, version: version.value };
}
