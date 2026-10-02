"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import DevBadge from "./DevBadge";
import ThemeToggle from "./ThemeToggle";
import { isActive, menuGroupsFor } from "./nav-menus";
import { logoutAction } from "@/modules/user/actions";
import { USER_ROLE_LABELS, type UserRoleCode } from "@/modules/user/codes";
import { Badge } from "@/components/ui/badge";

export default function Sidebar({ user }: { user: { name: string; loginId: string; role: UserRoleCode } }) {
  const pathname = usePathname();
  const groups = menuGroupsFor(user.role);

  return (
    <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar p-4 text-sidebar-foreground">
      <h1 className="-mx-4 -mt-4 mb-4 flex h-16 shrink-0 items-center gap-2 border-b border-sidebar-border px-5 text-lg font-bold">
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
        <div className="flex items-center justify-between gap-2 rounded-[6px] border border-sidebar-border px-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium">{user.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user.loginId}</p>
          </div>
          <Badge variant={user.role === "ADMIN" ? "indigo" : "gray"}>{USER_ROLE_LABELS[user.role]}</Badge>
        </div>
        <form action={logoutAction}>
          <button
            type="submit"
            className="flex w-full items-center justify-between rounded-[6px] border border-sidebar-border px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            로그아웃
            <LogOutIcon className="size-4 text-muted-foreground" />
          </button>
        </form>
      </div>
    </aside>
  );
}
