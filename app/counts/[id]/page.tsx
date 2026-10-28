import Link from "next/link";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import Forbidden from "@/components/Forbidden";
import { buttonVariants } from "@/components/ui/button";
import { UUID_RE } from "@/lib/form";
import { getCycleCount } from "@/modules/cyclecount/service";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import CountSheet from "./CountSheet";

export default async function CountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const user = await requirePageUser();
  if (!can(user.role, "count.manage")) return <Forbidden title="재고실사" />;
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const data = await getCycleCount(id);
  if (!data) notFound();
  const { count, lines } = data;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">재고실사 {count.countNo}</h2>
        <Link href="/counts" className={buttonVariants({ variant: "outline", size: "sm" })}>
          목록
        </Link>
      </div>
      <CountSheet
        count={{
          id: count.id,
          countNo: count.countNo,
          status: count.status,
          scope: count.scope,
          memo: count.memo,
          version: count.version,
          createdByName: count.createdBy?.name ?? null,
          confirmedByName: count.confirmedBy?.name ?? null,
        }}
        lines={lines}
        canConfirm={can(user.role, "count.confirm")}
      />
    </div>
  );
}
