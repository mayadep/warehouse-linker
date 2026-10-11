"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { XIcon } from "lucide-react";
import DevBadge from "./DevBadge";
import { isActive, menuGroupsFor } from "./nav-menus";
import type { UserRoleCode } from "@/modules/user/codes";

/** 헤더의 메뉴 버튼(모바일)이 보내는 사이드바 열기/닫기 이벤트 */
export const SIDEBAR_TOGGLE_EVENT = "sidebar:toggle";

/**
 * 사용자·로그아웃은 헤더(Header)에 있다
 * - PC: 왼쪽 고정 사이드바 (창 크기와 무관)
 * - 폰·태블릿(mobile 변형: 터치 기기 + 폭 1024px 미만): 숨겨 두고 헤더의 메뉴 버튼으로 여는 서랍(drawer)
 */
export default function Sidebar({ role }: { role: UserRoleCode }) {
  const pathname = usePathname();
  const groups = menuGroupsFor(role);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    window.addEventListener(SIDEBAR_TOGGLE_EVENT, toggle);
    return () => window.removeEventListener(SIDEBAR_TOGGLE_EVENT, toggle);
  }, []);

  return (
    <>
      {open && <div className="fixed inset-0 z-30 hidden bg-black/40 mobile:block" onClick={() => setOpen(false)} aria-hidden="true" />}
      <aside
        className={`sticky top-0 flex h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground mobile:fixed mobile:inset-y-0 mobile:left-0 mobile:z-40 mobile:h-dvh mobile:transition-transform mobile:duration-200 mobile:ease-out ${
          open ? "" : "mobile:-translate-x-full"
        }`}
      >
        <h1 className="-mx-4 -mt-4 mb-4 flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border px-5 text-lg font-bold text-white">
          <span className="size-2.5 rounded-[3px] bg-primary" />
          재고관리
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="메뉴 닫기"
            className="ml-auto hidden size-8 items-center justify-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent mobile:flex"
          >
            <XIcon className="size-5" />
          </button>
        </h1>
        <nav className="flex flex-col gap-4">
          {groups.map((g, i) => (
            <div key={i} className="flex flex-col gap-1">
              {g.title && <p className="px-3 text-[11px] font-medium text-sidebar-foreground/60">{g.title}</p>}
              {g.menus.map((m) => {
                const active = isActive(pathname, m.href);
                return (
                  <Link
                    key={m.label}
                    href={m.href}
                    onClick={() => setOpen(false)} // 메뉴로 화면을 옮기면 서랍을 닫는다
                    className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors duration-150 ease-out ${
                      active
                        ? "bg-sidebar-primary font-medium text-sidebar-primary-foreground"
                        : `hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ${m.dev ? "text-sidebar-foreground/60" : ""}`
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
      </aside>
    </>
  );
}
