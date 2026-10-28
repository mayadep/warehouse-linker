// 바코드 값 정규화·검증 (서버/클라이언트 공용)
import type { BarcodeUnit } from "@prisma/client";

export const BARCODE_UNITS: BarcodeUnit[] = ["BASE", "BOX"];

export const BARCODE_UNIT_LABELS: Record<BarcodeUnit, string> = {
  BASE: "낱개",
  BOX: "박스",
};

const BARCODE_RE = /^[A-Za-z0-9._-]{4,40}$/;
const MAX_BARCODES_PER_PRODUCT = 10;
export { MAX_BARCODES_PER_PRODUCT };

export function isBarcodeUnit(v: unknown): v is BarcodeUnit {
  return v === "BASE" || v === "BOX";
}

/** 스캐너가 붙이는 공백·개행을 제거 */
export function normalizeBarcode(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/\s+/g, "").slice(0, 40) : "";
}

/** GS1 체크디지트 검증 (EAN-8/UPC-A/EAN-13/GTIN-14) */
function gs1CheckDigitOk(digits: string): boolean {
  let sum = 0;
  for (let i = digits.length - 2, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
    sum += Number(digits[i]) * w;
  }
  return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
}

/** 오류 메시지 (정상이면 null) */
export function validateBarcode(code: string): string | null {
  if (!code) return "바코드를 입력하세요.";
  if (!BARCODE_RE.test(code)) return "바코드는 영문·숫자·-._ 로 4~40자여야 합니다.";
  if (/^\d+$/.test(code) && [8, 12, 13, 14].includes(code.length) && !gs1CheckDigitOk(code)) {
    return `바코드 체크디지트가 올바르지 않습니다. 스캔 값을 다시 확인하세요. (${code})`;
  }
  return null;
}
