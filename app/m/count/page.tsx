import Link from "next/link";
import { connection } from "next/server";
import Forbidden from "@/components/Forbidden";
import { COUNT_STATUS_LABELS } from "@/modules/cyclecount/codes";
import { listCycleCounts } from "@/modules/cyclecount/service";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";

export default async function MobileCountListPage() {
  await connection();
  const user = await requirePageUser();
  if (!can(user.role, "count.manage")) return <Forbidden title="재고 실사" />;
  const open = (await listCycleCounts()).filter((c) => c.status === "COUNTING");
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xl font-semibold">재고 실사</h2>
      {open.length === 0 && (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
          진행 중인 실사표가 없습니다. PC 화면의 [재고실사]에서 실사표를 먼저 만드세요.
        </p>
      )}
      {open.map((c) => (
        <Link key={c.id} href={`/m/count/${c.id}`} className="rounded-xl border bg-card p-4 active:bg-muted">
          <div className="flex items-center justify-between">
            <span className="text-base font-semibold">{c.countNo}</span>
            <span className="text-xs text-muted-foreground">{COUNT_STATUS_LABELS[c.status]}</span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">{c.scope}</div>
          <div className="mt-2 text-sm tabular-nums">
            센 줄 {c.countedLines.toLocaleString()} / {c._count.lines.toLocaleString()}
          </div>
        </Link>
      ))}
    </div>
  );
}
