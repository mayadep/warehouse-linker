import { connection } from "next/server";
import { notFound } from "next/navigation";
import Forbidden from "@/components/Forbidden";
import { UUID_RE } from "@/lib/form";
import { getCycleCount } from "@/modules/cyclecount/service";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import MobileCount from "./MobileCount";

export default async function MobileCountPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const user = await requirePageUser();
  if (!can(user.role, "count.manage")) return <Forbidden title="재고 실사" />;
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const data = await getCycleCount(id);
  if (!data) notFound();
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-xl font-semibold">{data.count.countNo}</h2>
        <p className="text-sm text-muted-foreground">{data.count.scope}</p>
      </div>
      {data.count.status !== "COUNTING" ? (
        <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">이미 끝난 실사표입니다. 수정할 수 없습니다.</p>
      ) : (
        <MobileCount lines={data.lines} />
      )}
    </div>
  );
}
