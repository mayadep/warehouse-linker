// 역할·권한 (서버/클라이언트 공용)

export type UserRoleCode = "STAFF" | "ADMIN";

export const USER_ROLES: UserRoleCode[] = ["STAFF", "ADMIN"];

export const USER_ROLE_LABELS: Record<UserRoleCode, string> = {
  STAFF: "직원",
  ADMIN: "관리자",
};

export const USER_ROLE_TONE: Record<UserRoleCode, "gray" | "indigo"> = {
  STAFF: "gray",
  ADMIN: "indigo",
};

export function isUserRole(v: string): v is UserRoleCode {
  return (USER_ROLES as string[]).includes(v);
}

/**
 * 권한표. 화면(메뉴·버튼)과 서버(페이지·Server Action)가 같은 표를 쓴다.
 * - 직원: 상품·입고·출고 등록(모두 '대기'), 상품·입고·출고·재고현황 조회(금액 제외)
 * - 관리자: 전부
 */
const PERMISSIONS = {
  "product.create": ["STAFF", "ADMIN"], // 상품 등록 (직원은 대기 상태로)
  "product.confirm": ["ADMIN"], // 상품 등록 확정·반려
  "product.manage": ["ADMIN"], // 상품 수정·비활성화·다시 사용
  "inbound.create": ["STAFF", "ADMIN"], // 입고 등록 (직원은 대기 상태로)
  "inbound.manage": ["ADMIN"], // 입고 확정·수정·취소·대기건 삭제
  "outbound.create": ["STAFF", "ADMIN"], // 출고 등록 (직원은 대기 상태로)
  "outbound.manage": ["ADMIN"], // 출고 확정·수정·취소·대기건 삭제
  "stock.view": ["STAFF", "ADMIN"], // 재고현황·원장 조회
  "price.view": ["ADMIN"], // 판매가·단가·금액 보기
  admin: ["ADMIN"], // 그 외 모든 메뉴·작업 (발주·수주, 배차, 창고, 재고 설정, 로그, 사용자)
} as const satisfies Record<string, readonly UserRoleCode[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: UserRoleCode | null | undefined, perm: Permission): boolean {
  return !!role && (PERMISSIONS[perm] as readonly UserRoleCode[]).includes(role);
}

export const USER_LIMITS = {
  minPassword: 8,
  maxPassword: 100,
  maxName: 50,
} as const;

/** 로그인 시도 제한: 같은 아이디 연속 실패 maxFails 회 → lockMinutes 분 차단 */
export const LOGIN_LIMITS = {
  maxFails: 5,
  lockMinutes: 15,
} as const;

/** 로그인 아이디: 소문자·숫자·._- 3~30자 (DB CHECK 와 동일) */
export const LOGIN_ID_RE = /^[a-z0-9][a-z0-9._-]{2,29}$/;
