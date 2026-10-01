"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import DevBadge from "./DevBadge";

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
      { label: "수발주", href: "/orders" },
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
    <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-gray-50 p-4">
      <h1 className="mb-6 text-lg font-bold">재고관리</h1>
      <nav className="flex flex-col gap-4">
        {groups.map((g, i) => (
          <div key={i} className="flex flex-col gap-1">
            {g.title && <p className="px-3 text-[11px] font-medium text-gray-400">{g.title}</p>}
            {g.menus.map((m) => {
              const active = isActive(pathname, m.href);
              return (
                <Link
                  key={m.label}
                  href={m.href}
                  className={`flex items-center justify-between rounded px-3 py-2 text-sm ${
                    active ? "bg-blue-600 text-white" : m.dev ? "text-gray-500 hover:bg-gray-200" : "hover:bg-gray-200"
                  }`}
                >
                  {m.label}
                  {m.dev && <DevBadge className={active ? "bg-blue-500 text-white" : ""} />}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      <div className="mt-auto pt-6">
        <button
          type="button"
          disabled
          title="로그인 기능은 개발 중입니다"
          className="flex w-full cursor-not-allowed items-center justify-between rounded border border-gray-200 px-3 py-2 text-sm text-gray-400"
        >
          로그인
          <DevBadge />
        </button>
      </div>
    </aside>
  );
}
