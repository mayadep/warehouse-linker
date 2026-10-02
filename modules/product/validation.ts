// 상품 등록 입력값 검증 (서버에서 반드시 실행)
import { DEFAULT_SAFETY_STOCK } from "./defaults";
import { isProductUnit, type ProductUnitCode } from "./units";

export const PRODUCT_LIMITS = {
  maxSkuLength: 30,
  maxNameLength: 100,
  maxCategoryLength: 50,
  maxPrice: 100_000_000,
  maxBoxQty: 10_000,
  maxSafetyStock: 1_000_000,
} as const;

export type ProductInput = {
  sku: string;
  name: string;
  category: string;
  price: number;
  baseUnit: ProductUnitCode;
  boxQty: number;
  safetyStock: number;
  trackExpiry: boolean;
};

export type ProductField = keyof ProductInput;
export type ProductFieldErrors = Partial<Record<ProductField, string>>;

export type ProductParseResult =
  | { ok: true; data: ProductInput }
  | { ok: false; errors: ProductFieldErrors };

// 영문 대문자/숫자로 시작, 이후 대문자·숫자·하이픈
const SKU_RE = /^[A-Z0-9][A-Z0-9-]*$/;
const INT_RE = /^\d+$/;

function text(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 상품 등록 확정: 판매가 필수 */
export function parseProductConfirmForm(
  fd: FormData
): { ok: true; data: { productId: string; price: number } } | { ok: false; message: string } {
  const productId = text(fd, "productId");
  if (!UUID_RE.test(productId)) return { ok: false, message: "잘못된 상품입니다." };
  const raw = text(fd, "price").replaceAll(",", "");
  if (!raw) return { ok: false, message: "판매가를 입력하세요." };
  if (!INT_RE.test(raw)) return { ok: false, message: "판매가는 0 이상의 정수여야 합니다." };
  const price = Number(raw);
  if (price > PRODUCT_LIMITS.maxPrice) return { ok: false, message: "판매가가 너무 큽니다." };
  return { ok: true, data: { productId, price } };
}

/** 상품 등록 반려: 사유 필수 */
export function parseProductRejectForm(
  fd: FormData
): { ok: true; data: { productId: string; reason: string } } | { ok: false; message: string } {
  const productId = text(fd, "productId");
  if (!UUID_RE.test(productId)) return { ok: false, message: "잘못된 상품입니다." };
  const reason = text(fd, "reason");
  if (!reason) return { ok: false, message: "반려 사유를 입력하세요." };
  if (reason.length > 200) return { ok: false, message: "반려 사유는 200자 이내로 입력하세요." };
  return { ok: true, data: { productId, reason } };
}

export function parseProductForm(fd: FormData): ProductParseResult {
  const errors: ProductFieldErrors = {};

  const sku = text(fd, "sku").toUpperCase();
  if (!sku) errors.sku = "품목코드를 입력하세요.";
  else if (sku.length > PRODUCT_LIMITS.maxSkuLength)
    errors.sku = `품목코드는 ${PRODUCT_LIMITS.maxSkuLength}자 이내로 입력하세요.`;
  else if (!SKU_RE.test(sku))
    errors.sku = "품목코드는 영문·숫자·하이픈(-)만 사용할 수 있습니다.";

  const name = text(fd, "name");
  if (!name) errors.name = "품명을 입력하세요.";
  else if (name.length > PRODUCT_LIMITS.maxNameLength)
    errors.name = `품명은 ${PRODUCT_LIMITS.maxNameLength}자 이내로 입력하세요.`;

  const category = text(fd, "category");
  if (!category) errors.category = "분류를 입력하세요.";
  else if (category.length > PRODUCT_LIMITS.maxCategoryLength)
    errors.category = `분류는 ${PRODUCT_LIMITS.maxCategoryLength}자 이내로 입력하세요.`;

  const priceRaw = text(fd, "price").replaceAll(",", "");
  let price = 0;
  if (priceRaw) {
    if (!INT_RE.test(priceRaw)) errors.price = "판매가는 0 이상의 정수여야 합니다.";
    else {
      price = Number(priceRaw);
      if (price > PRODUCT_LIMITS.maxPrice) errors.price = "판매가가 너무 큽니다.";
    }
  }

  const unitRaw = text(fd, "baseUnit");
  let baseUnit: ProductUnitCode = "EA";
  if (!isProductUnit(unitRaw)) errors.baseUnit = "기본단위를 선택하세요.";
  else baseUnit = unitRaw;

  // BOX 단위 상품은 입수 1 고정 (화면의 비활성 입력값은 전송되지 않으므로 서버에서 강제)
  let boxQty = 1;
  if (baseUnit !== "BOX") {
    const qtyRaw = text(fd, "boxQty").replaceAll(",", "");
    if (!qtyRaw) errors.boxQty = "박스당 입수를 입력하세요.";
    else if (!INT_RE.test(qtyRaw) || Number(qtyRaw) < 1)
      errors.boxQty = "박스당 입수는 1 이상의 정수여야 합니다.";
    else if (Number(qtyRaw) > PRODUCT_LIMITS.maxBoxQty)
      errors.boxQty = `박스당 입수는 ${PRODUCT_LIMITS.maxBoxQty.toLocaleString()} 이하여야 합니다.`;
    else boxQty = Number(qtyRaw);
  }

  // 안전재고: 비우면 기본값
  const safetyRaw = text(fd, "safetyStock").replaceAll(",", "");
  let safetyStock = DEFAULT_SAFETY_STOCK;
  if (safetyRaw) {
    if (!INT_RE.test(safetyRaw)) errors.safetyStock = "안전재고는 0 이상의 정수여야 합니다.";
    else if (Number(safetyRaw) > PRODUCT_LIMITS.maxSafetyStock)
      errors.safetyStock = `안전재고는 ${PRODUCT_LIMITS.maxSafetyStock.toLocaleString()} 이하여야 합니다.`;
    else safetyStock = Number(safetyRaw);
  }

  // 체크박스: 체크 시 "on", 미체크 시 전송되지 않음
  const trackExpiry = fd.get("trackExpiry") === "on";

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: { sku, name, category, price, baseUnit, boxQty, safetyStock, trackExpiry },
  };
}
