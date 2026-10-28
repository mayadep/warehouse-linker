import Link from "next/link";
import { connection } from "next/server";
import Forbidden from "@/components/Forbidden";
import EmptyState from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { COUNT_STATUS_LABELS, COUNT_STATUS_TONE } from "@/modules/cyclecount/codes";
import { listCycleCounts } from "@/modules/cyclecount/service";
import { listWarehouseOptions } from "@/modules/warehouse/location";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import CountCreateForm from "./CountCreateForm";

const dateFmt = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "2-digit", month: "2-digit", day: "2-digit" });

export default async function CountsPage() {
  await connection();
  const user = await requirePageUser();
  if (!can(user.role, "count.manage")) return <Forbidden title="재고실사" />;
  const [counts, warehouses] = await Promise.all([listCycleCounts(), listWarehouseOptions()]);

  return (
    <div>
      <h2 className="mb-6 text-2xl font-semibold tracking-tight">재고실사</h2>
      <CountCreateForm warehouses={warehouses.filter((w) => w.isActive).map((w) => ({ id: w.id, name: w.name }))} />

      <p className="mt-10 mb-2 text-sm text-gray-500">최근 실사표 {counts.length.toLocaleString()}장</p>
      {counts.length === 0 ? (
        <EmptyState title="실사표가 없습니다" description="창고나 랙 범위를 정해 실사표를 만들면 칸별 장부 수량이 실사표에 담깁니다." />
      ) : (
        <div className="overflow-auto rounded-lg border">
          <table className="data-table">
            <thead>
              <tr>
                <th>실사번호</th>
                <th className="left">범위</th>
                <th>상태</th>
                <th className="num">진행 (센 줄 / 전체)</th>
                <th>작성일</th>
                <th>작성자</th>
              </tr>
            </thead>
            <tbody>
              {counts.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/counts/${c.id}`} className="text-primary underline-offset-2 hover:underline">
                      {c.countNo}
                    </Link>
                  </td>
                  <td className="left">{c.scope}</td>
                  <td>
                    <Badge variant={COUNT_STATUS_TONE[c.status]}>{COUNT_STATUS_LABELS[c.status]}</Badge>
                  </td>
                  <td className="num tabular-nums">
                    {c.countedLines.toLocaleString()} / {c._count.lines.toLocaleString()}
                  </td>
                  <td>{dateFmt.format(c.createdAt)}</td>
                  <td>{c.createdBy?.name ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
