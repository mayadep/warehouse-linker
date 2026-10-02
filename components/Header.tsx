"use client";

import { usePathname } from "next/navigation";
import { ChevronRightIcon } from "lucide-react";
import { findMenu } from "./nav-menus";

/** 상단 헤더(64px): 현재 화면 위치 표시 */
export default function Header() {
  const pathname = usePathname();
  const current = findMenu(pathname);

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center border-b bg-background px-6">
      {current && (
        <nav aria-label="현재 위치" className="flex items-center gap-1.5 text-sm">
          {current.group && (
            <>
              <span className="text-muted-foreground">{current.group}</span>
              <ChevronRightIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </>
          )}
          <span className="font-medium">{current.menu.label}</span>
        </nav>
      )}
    </header>
  );
}
