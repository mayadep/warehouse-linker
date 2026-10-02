"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import DevBadge from "./DevBadge";
import { isActive, menuGroupsFor } from "./nav-menus";
import type { UserRoleCode } from "@/modules/user/codes";

/** 사용자·로그아웃은 헤더(Header)에 있다 */
export default function Sidebar({ role }: { role: UserRoleCode }) {
  const pathname = usePathname();
  const groups = menuGroupsFor(role);

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
      <h1 className="-mx-4 -mt-4 mb-4 flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border px-5 text-lg font-bold text-white">
        <span className="size-2.5 rounded-[3px] bg-primary" />
        재고관리
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
  );
}
