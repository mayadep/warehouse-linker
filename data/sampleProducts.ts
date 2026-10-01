export type Product = {
  itemCode: string;
  name: string;
  category: string;
  baseUnit: string;
  boxQty: number;
  trackExpiry: boolean;
};

// [코드, 품명, 분류, 기본단위, 박스당 입수, 유통기한관리]
const rows: [string, string, string, string, number, boolean][] = [
  // 식용유
  ["OIL-001", "식용유 18L", "식용유", "CAN", 2, true],
  ["OIL-002", "대두유 900ml", "식용유", "EA", 15, true],
  ["OIL-003", "카놀라유 1.8L", "식용유", "EA", 9, true],
  ["OIL-004", "올리브유 1L", "식용유", "EA", 12, true],
  ["OIL-005", "참기름 500ml", "식용유", "EA", 12, true],
  ["OIL-006", "들기름 350ml", "식용유", "EA", 12, true],
  ["OIL-007", "옥수수유 1.8L", "식용유", "EA", 9, true],
  // 소스류
  ["SAU-001", "케찹 3.2kg", "소스류", "EA", 6, true],
  ["SAU-002", "마요네즈 3.2kg", "소스류", "EA", 4, true],
  ["SAU-003", "머스타드 2.1kg", "소스류", "EA", 6, true],
  ["SAU-004", "돈까스소스 2kg", "소스류", "EA", 6, true],
  ["SAU-005", "굴소스 2.3kg", "소스류", "EA", 6, true],
  ["SAU-006", "데리야끼소스 2kg", "소스류", "EA", 6, true],
  ["SAU-007", "칠리소스 2kg", "소스류", "EA", 6, true],
  ["SAU-008", "바비큐소스 2kg", "소스류", "EA", 6, true],
  // 장류/양념
  ["SEA-001", "양조간장 1.8L", "장류/양념", "EA", 6, true],
  ["SEA-002", "진간장 15L", "장류/양념", "CAN", 1, true],
  ["SEA-003", "고추장 3kg", "장류/양념", "EA", 4, true],
  ["SEA-004", "된장 3kg", "장류/양념", "EA", 4, true],
  ["SEA-005", "쌈장 3kg", "장류/양념", "EA", 4, true],
  ["SEA-006", "고춧가루 1kg", "장류/양념", "EA", 10, true],
  ["SEA-007", "다진마늘 1kg", "장류/양념", "EA", 10, true],
  ["SEA-008", "천일염 5kg", "장류/양념", "EA", 4, false],
  ["SEA-009", "설탕 15kg", "장류/양념", "EA", 1, false],
  ["SEA-010", "후추 500g", "장류/양념", "EA", 20, true],
  ["SEA-011", "맛술 1.8L", "장류/양념", "EA", 6, true],
  ["SEA-012", "식초 1.8L", "장류/양념", "EA", 8, true],
  ["SEA-013", "물엿 8kg", "장류/양념", "EA", 2, true],
  ["SEA-014", "감칠맛조미료 1kg", "장류/양념", "EA", 15, true],
  // 곡물/가루
  ["GRN-001", "쌀 20kg", "곡물/가루", "EA", 1, true],
  ["GRN-002", "밀가루 중력분 20kg", "곡물/가루", "EA", 1, true],
  ["GRN-003", "부침가루 1kg", "곡물/가루", "EA", 10, true],
  ["GRN-004", "튀김가루 1kg", "곡물/가루", "EA", 10, true],
  ["GRN-005", "감자전분 1kg", "곡물/가루", "EA", 15, true],
  ["GRN-006", "빵가루 1kg", "곡물/가루", "EA", 10, true],
  // 면류
  ["NOD-001", "소면 1.5kg", "면류", "EA", 8, true],
  ["NOD-002", "당면 1kg", "면류", "EA", 10, true],
  ["NOD-003", "라면사리 110g", "면류", "EA", 40, true],
  ["NOD-004", "스파게티면 500g", "면류", "EA", 20, true],
  // 통조림
  ["CAN-001", "옥수수 통조림 3kg", "통조림", "CAN", 6, true],
  ["CAN-002", "참치 통조림 1.88kg", "통조림", "CAN", 6, true],
  ["CAN-003", "토마토홀 2.5kg", "통조림", "CAN", 6, true],
  ["CAN-004", "후르츠칵테일 3kg", "통조림", "CAN", 6, true],
  // 냉동
  ["FRZ-001", "냉동감자튀김 2.26kg", "냉동식품", "EA", 6, true],
  ["FRZ-002", "냉동만두 1.4kg", "냉동식품", "EA", 8, true],
  ["FRZ-003", "냉동 닭날개 10kg", "냉동식품", "EA", 1, true],
  ["FRZ-004", "냉동새우 1kg", "냉동식품", "EA", 10, true],
  ["FRZ-005", "냉동 믹스야채 1kg", "냉동식품", "EA", 10, true],
  // 유제품
  ["DRY-001", "모짜렐라치즈 2.5kg", "유제품", "EA", 4, true],
  ["DRY-002", "슬라이스치즈 1.8kg", "유제품", "EA", 6, true],
];

export const sampleProducts: Product[] = rows.map(
  ([itemCode, name, category, baseUnit, boxQty, trackExpiry]) => ({
    itemCode,
    name,
    category,
    baseUnit,
    boxQty,
    trackExpiry,
  })
);