import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "cn";

/** 디자인 시스템 Card: 흰 배경 · 1px 테두리 · radius 12(Large 14) · padding 20(Large 24) · 기본 그림자 */
const PADDING = {
  standard: "rounded-xl p-5",
  large: "rounded-2xl p-6",
  compact: "rounded-xl p-4",
} as const;

export function Card({
  as: Tag = "section",
  size = "standard",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { as?: "section" | "div" | "article"; size?: keyof typeof PADDING }) {
  return <Tag className={cn("border bg-card shadow-card", PADDING[size], className)} {...props} />;
}

/** 카드 제목 줄: 제목 + 우측 액션(더보기 링크 등) */
export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-[15px] font-semibold">{title}</h3>
      {action}
    </div>
  );
}
