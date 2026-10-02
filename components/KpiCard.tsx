import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";

/** 전일 대비 등 증감 표시. 색뿐 아니라 화살표·문구를 함께 쓴다 */
export type KpiDelta = { text: string; direction: "up" | "down" | "flat" };

const DELTA_STYLE = {
  up: { cls: "text-[#087a5b]", Icon: ArrowUpIcon },
  down: { cls: "text-[#b42323]", Icon: ArrowDownIcon },
  flat: { cls: "text-muted-foreground", Icon: MinusIcon },
} as const;

const TONE: Record<"default" | "warning" | "danger", string> = {
  default: "text-foreground",
  warning: "text-[#996b00]",
  danger: "text-[#b42323]",
};

/** 대시보드 KPI 카드: 라벨 + 아이콘 / 큰 숫자 + 단위 / 증감 */
export default function KpiCard({
  label,
  value,
  unit,
  icon: Icon,
  delta,
  note,
  tone = "default",
  href,
}: {
  label: string;
  value: string;
  unit?: string;
  icon: LucideIcon;
  delta?: KpiDelta;
  note?: string; // 증감 대신 붙이는 보조 설명
  tone?: keyof typeof TONE;
  href?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-primary">
          <Icon className="size-4" strokeWidth={1.8} aria-hidden="true" />
        </span>
      </div>
      <p className={`mt-3 text-[28px] font-bold leading-tight tabular-nums ${TONE[tone]}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-muted-foreground">{unit}</span>}
      </p>
      <div className="mt-2 h-4 text-xs">
        {delta ? (
          <span className={`inline-flex items-center gap-0.5 font-medium ${DELTA_STYLE[delta.direction].cls}`}>
            {(() => {
              const { Icon: D } = DELTA_STYLE[delta.direction];
              return <D className="size-3.5" aria-hidden="true" />;
            })()}
            {delta.text}
          </span>
        ) : (
          note && <span className="text-muted-foreground">{note}</span>
        )}
      </div>
    </>
  );
  const cls = "block rounded-xl border bg-card p-5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]";
  return href ? (
    <Link href={href} className={`${cls} transition-colors duration-150 ease-out hover:border-[#9bb0ff]`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
