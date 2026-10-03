"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BellIcon, CalendarIcon, ChevronDownIcon, ChevronRightIcon, KeyRoundIcon, LogOutIcon, SearchIcon, UserIcon } from "lucide-react";
import { findMenu } from "./nav-menus";
import PasswordChangeModal from "./PasswordChangeModal";
import { formatKstNow } from "@/lib/datetime";
import { logoutAction } from "@/modules/user/actions";
import { USER_ROLE_LABELS, type UserRoleCode } from "@/modules/user/codes";
import { Badge } from "@/components/ui/badge";

/**
 * 상단 헤더(64px): 현재 위치 · 상품 검색 · 날짜/시각(KST) · 재고 알림 · 사용자 메뉴
 * - 검색·알림은 재고 조회 권한(canViewStock)이 있을 때만 보인다 (이동할 재고현황 화면이 권한 필요)
 * - 창고 선택은 재고가 아직 상품 단위(창고별 재고 없음)라 넣지 않았다
 */
export default function Header({
  user,
  nowText,
  canViewStock,
  alertCount,
}: {
  user: { name: string; role: UserRoleCode };
  nowText: string;
  canViewStock: boolean;
  alertCount: number;
}) {
  const pathname = usePathname();
  const current = findMenu(pathname);
  const [now, setNow] = useState(nowText);
  const [pwOpen, setPwOpen] = useState(false);

  // 서버가 준 시각으로 시작해 1분마다 갱신 (하이드레이션 불일치 방지)
  useEffect(() => {
    const id = setInterval(() => setNow(formatKstNow()), 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-4 border-b bg-card px-6">
      {current && (
        <nav aria-label="현재 위치" className="flex shrink-0 items-center gap-1.5 text-sm">
          {current.group && (
            <>
              <span className="text-muted-foreground">{current.group}</span>
              <ChevronRightIcon className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </>
          )}
          <span className="font-medium">{current.menu.label}</span>
        </nav>
      )}

      <div className="flex min-w-0 flex-1 justify-center">
        {canViewStock && (
          <form action="/stock" method="get" role="search" className="relative w-full max-w-xl">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <input
              type="search"
              name="q"
              maxLength={50}
              placeholder="상품 코드·품명을 검색하세요"
              aria-label="상품 검색"
              className="h-10 w-full rounded-lg border border-input bg-card pr-3 pl-9 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-primary/15"
            />
          </form>
        )}
      </div>

      <p className="flex shrink-0 items-center gap-1.5 rounded-lg border border-input px-3 py-2 text-sm text-foreground tabular-nums">
        <CalendarIcon className="size-4 text-muted-foreground" aria-hidden="true" />
        <span suppressHydrationWarning>{now}</span>
      </p>

      {canViewStock && (
        <Link
          href="/stock?status=short"
          title={alertCount > 0 ? `재고 없음·부족 ${alertCount}개` : "재고 알림 없음"}
          aria-label={alertCount > 0 ? `재고 알림 ${alertCount}개` : "재고 알림 없음"}
          className="relative flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted hover:text-foreground"
        >
          <BellIcon className="size-5" strokeWidth={1.8} />
          {alertCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-md bg-destructive px-1 text-[10px] font-semibold text-white tabular-nums">
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          )}
        </Link>
      )}

      <details className="group relative shrink-0">
        <summary className="flex h-9 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-sm transition-colors duration-150 ease-out hover:bg-muted [&::-webkit-details-marker]:hidden">
          <span className="flex size-7 items-center justify-center rounded-lg bg-secondary text-primary">
            <UserIcon className="size-4" strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="max-w-28 truncate font-medium">{user.name}</span>
          <Badge variant={user.role === "ADMIN" ? "indigo" : "gray"}>{USER_ROLE_LABELS[user.role]}</Badge>
          <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <div className="absolute right-0 mt-2 w-44 rounded-xl border bg-popover p-1 shadow-[0_4px_12px_rgba(15,23,42,0.08)]">
          <button
            type="button"
            onClick={(e) => {
              e.currentTarget.closest("details")?.removeAttribute("open");
              setPwOpen(true);
            }}
            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors duration-150 ease-out hover:bg-muted"
          >
            비밀번호 변경
            <KeyRoundIcon className="size-4 text-muted-foreground" aria-hidden="true" />
          </button>
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors duration-150 ease-out hover:bg-muted"
            >
              로그아웃
              <LogOutIcon className="size-4 text-muted-foreground" aria-hidden="true" />
            </button>
          </form>
        </div>
      </details>
      {pwOpen && <PasswordChangeModal onClose={() => setPwOpen(false)} />}
    </header>
  );
}
