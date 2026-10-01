"use client";

import { useLayoutEffect } from "react";
import { MoonIcon, SunIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

/** OS 설정과 무관하게 저장된 값만 따른다(없으면 라이트). layout.tsx 의 THEME_SCRIPT 와 같은 규칙. */
function currentTheme(): Theme {
  try {
    return localStorage.getItem("theme") === "dark" ? "dark" : "light";
  } catch {
    return "light"; // 저장소 사용 불가
  }
}

function apply(theme: Theme) {
  const el = document.documentElement;
  el.classList.toggle("dark", theme === "dark");
  el.dataset.themePref = theme;
}

/** 라이트 ↔ 다크 전환 버튼. 현재 상태 표시는 CSS(data-theme-pref)로 고르므로 SSR/하이드레이션 불일치가 없다. */
export default function ThemeToggle() {
  // 개발 모드(Strict Mode) 재마운트 때 React 가 <html> 속성을 초기화하므로 다시 적용 (운영에서는 영향 없음)
  useLayoutEffect(() => {
    apply(currentTheme());
  }, []);

  function toggle() {
    const next: Theme = currentTheme() === "dark" ? "light" : "dark";
    try {
      localStorage.setItem("theme", next);
    } catch {
      /* 저장 불가(사생활 보호 모드 등)여도 이번 화면에는 적용 */
    }
    apply(next);
  }

  return (
    <Button
      type="button"
      variant="outline"
      onClick={toggle}
      title="라이트 / 다크 전환"
      className="w-full justify-between font-normal"
    >
      <span className="flex items-center gap-2">
        <SunIcon className="size-4 [[data-theme-pref=dark]_&]:hidden" />
        <MoonIcon className="hidden size-4 [[data-theme-pref=dark]_&]:block" />
        <span className="[[data-theme-pref=dark]_&]:hidden">라이트</span>
        <span className="hidden [[data-theme-pref=dark]_&]:inline">다크</span>
      </span>
      <span className="text-xs text-muted-foreground">테마</span>
    </Button>
  );
}
