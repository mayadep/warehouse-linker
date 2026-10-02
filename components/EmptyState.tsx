import type { LucideIcon } from "lucide-react";
import { PackageIcon } from "lucide-react";

/** 데이터가 없을 때: 빈 화면 대신 이유와 다음 행동을 알려 준다. 표 안에서는 <td colSpan> 안에 넣는다 */
export default function EmptyState({
  icon: Icon = PackageIcon,
  title,
  description,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1 py-10 text-center">
      <div className="mb-2 flex size-12 items-center justify-center rounded-xl bg-secondary text-primary">
        <Icon className="size-6" strokeWidth={1.8} aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted-foreground">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
