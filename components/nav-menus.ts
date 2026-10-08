// 사이드바·헤더 공용 메뉴 정의
import { can, type Permission, type UserRoleCode } from "@/modules/user/codes";

/** perm: 이 메뉴를 볼 수 있는 권한 (없으면 로그인 사용자 모두). 페이지에서도 같은 권한을 다시 확인한다 */
export type Menu = { label: string; href: string; dev?: boolean; perm?: Permission };
export type MenuGroup = { title?: string; menus: Menu[] };

export const menuGroups: MenuGroup[] = [
  { menus: [{ label: "대시보드", href: "/" }] },
  {
    title: "재고",
    menus: [
      { label: "상품등록", href: "/products/new", perm: "product.create" },
      { label: "입고", href: "/inbound", perm: "inbound.view" },
      { label: "출고", href: "/outbound", perm: "outbound.view" },
      { label: "재고현황", href: "/stock", perm: "stock.view" },
      { label: "창고관리", href: "/warehouses", perm: "admin" },
    ],
  },
  {
    title: "업무",
    menus: [
      { label: "발주", href: "/orders/purchase", perm: "admin" },
      { label: "수주", href: "/orders/sales", perm: "admin" },
      { label: "배차관리", href: "/dispatch", perm: "admin" },
      { label: "리포트", href: "/reports", perm: "admin" },
    ],
  },
  {
    title: "관리",
    menus: [
      { label: "공지사항", href: "/notices", perm: "admin" },
      { label: "거래처", href: "/partners", perm: "admin" },
      { label: "로그", href: "/logs", perm: "admin" },
      { label: "사용자·권한", href: "/users", perm: "admin" },
    ],
  },
];

/** 역할에 보이는 메뉴만 (빈 그룹 제외) */
export function menuGroupsFor(role: UserRoleCode): MenuGroup[] {
  return menuGroups
    .map((g) => ({ ...g, menus: g.menus.filter((m) => !m.perm || can(role, m.perm)) }))
    .filter((g) => g.menus.length > 0);
}

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** 현재 경로에 해당하는 메뉴와 그룹 */
export function findMenu(pathname: string): { group?: string; menu: Menu } | null {
  for (const g of menuGroups) {
    const menu = g.menus.find((m) => isActive(pathname, m.href));
    if (menu) return { group: g.title, menu };
  }
  return null;
}
