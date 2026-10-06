import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/Card";
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "lucide-react";

/** 전일 대비 등 증감 표시. 색뿐 아니라 화살표·문구를 함께 쓴다 */
export type KpiDelta = { text: string; direction: "up" | "down" | "flat" };

const DELTA_STYLE = {
  up: { cls: "text-success-foreground", Icon: ArrowUpIcon },
  down: { cls: "text-danger-foreground", Icon: ArrowDownIcon },
  flat: { cls: "text-muted-foreground", Icon: MinusIcon },
} as const;

const TONE: Record<"default" | "warning" | "danger", string> = {
  default: "text-foreground",
  warning: "text-warning-foreground",
  danger: "text-danger-foreground",
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
  return href ? (
    <Card as="div" className="p-0">
      <Link href={href} className="block rounded-xl border border-transparent p-5 transition-colors duration-150 ease-out hover:border-primary-border">
        {body}
      </Link>
    </Card>
  ) : (
    <Card as="div">{body}</Card>
  );
}
