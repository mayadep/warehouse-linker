// 감사 로그 라벨·상수 (서버/클라이언트 공용)

export type AuditCategoryCode =
  | "PRODUCT"
  | "INBOUND"
  | "OUTBOUND"
  | "STOCK"
  | "WAREHOUSE"
  | "ORDER"
  | "DISPATCH"
  | "VEHICLE"
  | "USER"
  | "PARTNER"
  | "NOTICE";

export const AUDIT_CATEGORIES: AuditCategoryCode[] = [
  "PRODUCT",
  "INBOUND",
  "OUTBOUND",
  "STOCK",
  "WAREHOUSE",
  "ORDER",
  "DISPATCH",
  "VEHICLE",
  "USER",
  "PARTNER",
  "NOTICE",
];

export const AUDIT_CATEGORY_LABELS: Record<AuditCategoryCode, string> = {
  PRODUCT: "상품",
  INBOUND: "입고",
  OUTBOUND: "출고",
  STOCK: "재고",
  WAREHOUSE: "창고",
  ORDER: "발주·수주",
  DISPATCH: "배차",
  VEHICLE: "차량",
  USER: "사용자",
  PARTNER: "거래처",
  NOTICE: "공지사항",
};

export const AUDIT_CATEGORY_TONE: Record<AuditCategoryCode, "gray" | "slate" | "indigo" | "sky" | "amber" | "green" | "red"> = {
  PRODUCT: "slate",
  INBOUND: "green",
  OUTBOUND: "amber",
  STOCK: "gray",
  WAREHOUSE: "sky",
  ORDER: "indigo",
  DISPATCH: "red",
  VEHICLE: "gray",
  USER: "slate",
  PARTNER: "sky",
  NOTICE: "indigo",
};

/** 작업 코드 → 표시명 */
export const AUDIT_ACTION_LABELS = {
  PRODUCT_CREATE: "상품 등록",
  PRODUCT_CONFIRM: "상품 등록 확정",
  PRODUCT_REJECT: "상품 등록 반려",
  PRODUCT_UPDATE: "상품 수정",
  PRODUCT_INACTIVE: "상품 비활성화",
  PRODUCT_ACTIVE: "상품 다시 사용",
  INBOUND_CREATE: "입고 등록",
  INBOUND_CONFIRM: "입고 확정",
  INBOUND_UPDATE: "입고 수정",
  INBOUND_CANCEL: "입고 취소",
  INBOUND_DELETE: "대기 입고 삭제",
  OUTBOUND_CREATE: "출고 등록",
  OUTBOUND_UPDATE: "출고 수정",
  OUTBOUND_CONFIRM: "출고 확정",
  OUTBOUND_CANCEL: "출고 취소",
  OUTBOUND_DELETE: "대기 출고 삭제",
  SAFETY_STOCK_UPDATE: "안전재고 변경",
  STOCK_EXPIRY_CHANGE: "유통기한 변경",
  STOCK_MOVE: "재고 위치 이동",
  STOCK_ADJUST: "재고조정",
  WAREHOUSE_CREATE: "창고 추가",
  RACK_ADD: "랙 추가",
  WAREHOUSE_ACTIVE: "창고 다시 사용",
  WAREHOUSE_INACTIVE: "창고 비활성화",
  RACK_ACTIVE: "랙 다시 사용",
  RACK_INACTIVE: "랙 비활성화",
  LOCATION_AUTO_ASSIGN: "위치 자동 배정",
  LOCATION_CHANGE: "보관위치 변경",
  ORDER_CREATE: "주문 등록",
  ORDER_PROCESS: "입고/출고 처리",
  ORDER_CLOSE: "잔량 종결",
  ORDER_CANCEL: "주문 취소",
  VEHICLE_CREATE: "차량 등록",
  VEHICLE_ACTIVE: "운행 재개",
  VEHICLE_INACTIVE: "운행 중지",
  DISPATCH_CREATE: "배차 등록",
  DISPATCH_ITEM_ADD: "배차 품목 추가",
  DISPATCH_ITEM_REMOVE: "배차 품목 빼기",
  DISPATCH_STATUS: "배차 상태 변경",
  LOGIN: "로그인",
  LOGIN_FAIL: "로그인 실패",
  LOGIN_LOCKED: "로그인 잠금",
  LOGOUT: "로그아웃",
  USER_CREATE: "사용자 등록",
  USER_UPDATE: "사용자 수정",
  USER_PASSWORD_RESET: "비밀번호 재설정",
  USER_PASSWORD_CHANGE: "비밀번호 변경",
  PARTNER_CREATE: "거래처 등록",
  PARTNER_UPDATE: "거래처 수정",
  NOTICE_CREATE: "공지 등록",
  NOTICE_UPDATE: "공지 수정",
} as const satisfies Record<string, string>;

export type AuditActionCode = keyof typeof AUDIT_ACTION_LABELS;

export function auditActionLabel(action: string): string {
  return (AUDIT_ACTION_LABELS as Record<string, string>)[action] ?? action;
}

export const AUDIT_PAGE_SIZE = 50;

/** 상세(detail) 항목명 표시 */
export const AUDIT_FIELD_LABELS: Record<string, string> = {
  sku: "품목코드",
  name: "이름",
  category: "분류",
  price: "판매가",
  safetyStock: "안전재고",
  baseUnit: "기본단위",
  boxQty: "박스 입수",
  product: "상품",
  quantity: "수량",
  unitCost: "단가",
  unitPrice: "단가",
  supplier: "공급처",
  customer: "출고처",
  memo: "비고",
  receivedAt: "입고일시",
  shippedAt: "출고일시",
  reason: "사유",
  afterStock: "처리 후 재고",
  stockDelta: "재고 증감",
  code: "코드",
  storageType: "보관유형",
  racks: "랙",
  locations: "구획 수",
  levels: "단 수",
  binsPerLevel: "단별 구획",
  from: "변경 전",
  to: "변경 후",
  swappedWith: "교환 상품",
  assigned: "배정",
  unassigned: "미배정",
  orderNo: "주문번호",
  partner: "거래처",
  dueDate: "납기·예정일",
  lines: "품목",
  status: "상태",
  plateNo: "차량번호",
  driverName: "기사",
  driverPhone: "연락처",
  deliveryDate: "배송일",
  vehicle: "차량",
  outbounds: "출고",
  released: "배차 해제",
  createdBy: "등록자",
  loginId: "아이디",
  role: "역할",
  isActive: "사용 여부",
  title: "제목",
  body: "내용",
  isPinned: "상단 고정",
  isPublished: "게시 여부",
};
