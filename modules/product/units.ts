// 상품 기본단위 (prisma enum ProductUnit 과 동일하게 유지)
export const PRODUCT_UNITS = ["EA", "BOX", "CAN", "L", "KG"] as const;
export type ProductUnitCode = (typeof PRODUCT_UNITS)[number];

export const PRODUCT_UNIT_LABELS: Record<ProductUnitCode, string> = {
  EA: "개",
  BOX: "박스",
  CAN: "캔",
  L: "리터",
  KG: "킬로그램",
};

export function isProductUnit(v: string): v is ProductUnitCode {
  return (PRODUCT_UNITS as readonly string[]).includes(v);
}
