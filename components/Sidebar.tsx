"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import DevBadge from "./DevBadge";
import ThemeToggle from "./ThemeToggle";

type Menu = { label: string; href: string; dev?: boolean };

const groups: { title?: string; menus: Menu[] }[] = [
  { menus: [{ label: "대시보드", href: "/", dev: true }] },
  {
    title: "재고",
    menus: [
      { label: "상품등록", href: "/products/new" },
      { label: "입고", href: "/inbound" },
      { label: "출고", href: "/outbound" },
      { label: "재고현황", href: "/stock" },
      { label: "창고관리", href: "/warehouses" },
    ],
  },
  {
    title: "업무",
    menus: [
      { label: "발주", href: "/orders/purchase" },
      { label: "수주", href: "/orders/sales" },
      { label: "배차관리", href: "/dispatch" },
    ],
  },
  {
    title: "관리",
    menus: [{ label: "사용자·권한", href: "/users", dev: true }],
  },
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
      <h1 className="mb-6 flex items-center gap-2 px-1 text-lg font-bold">
        <span className="size-2.5 rounded-full bg-sidebar-primary" />
        재고관리
      </h1>
      <nav className="flex flex-col gap-4">
        {groups.map((g, i) => (
          <div key={i} className="flex flex-col gap-1">
            {g.title && <p className="px-3 text-[11px] font-medium text-muted-foreground">{g.title}</p>}
            {g.menus.map((m) => {
              const active = isActive(pathname, m.href);
              return (
                <Link
                  key={m.label}
                  href={m.href}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground shadow-sm"
                      : `hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${m.dev ? "text-muted-foreground" : ""}`
                  }`}
                >
                  {m.label}
                  {m.dev && <DevBadge className={active ? "bg-indigo-500 text-white" : ""} />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-2 pt-6">
        <ThemeToggle />
        <button
          type="button"
          disabled
          title="로그인 기능은 개발 중입니다"
          className="flex w-full cursor-not-allowed items-center justify-between rounded border border-sidebar-border px-3 py-2 text-sm text-muted-foreground"
        >
          로그인
          <DevBadge />
        </button>
      </div>
    </aside>
  );
}
