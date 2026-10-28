import Link from "next/link";
import { connection } from "next/server";
import Forbidden from "@/components/Forbidden";
import EmptyState from "@/components/EmptyState";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dbToDateOnly } from "@/lib/datetime";
import { LOT_TRACE_LIMIT, traceLot } from "@/modules/stock/queries";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";

const MOVEMENT_LABELS: Record<string, string> = {
  INBOUND: "입고",
  OUTBOUND: "출고",
  INBOUND_CORRECTION: "입고정정",
  OUTBOUND_CORRECTION: "출고정정",
  INBOUND_CANCEL: "입고취소",
  OUTBOUND_CANCEL: "출고취소",
  ADJUST: "재고조정",
};

const dateTimeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export default async function LotTracePage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await connection();
  const user = await requirePageUser();
  if (!can(user.role, "stock.view")) return <Forbidden title="로트 추적" />;

  const { q } = await searchParams;
  const lotNo = (Array.isArray(q) ? q[0] : q)?.trim().slice(0, 30) ?? "";
  const result = lotNo ? await traceLot(lotNo) : null;
  const remain = result?.balances.reduce((a, b) => a + b.quantity, 0) ?? 0;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-2xl font-semibold tracking-tight">로트 추적</h2>
        <Link href="/stock" className={buttonVariants({ variant: "outline", size: "sm" })}>
          재고현황
        </Link>
      </div>
      <form className="mb-4 flex items-center gap-2">
        <Input name="q" defaultValue={lotNo} maxLength={30} placeholder="로트번호 (정확히 입력)" className="w-64 text-sm" autoFocus />
        <Button variant="outline" size="sm" type="submit">
          조회
        </Button>
      </form>

      {!result ? (
        <EmptyState title="로트번호를 입력하세요" description="입고 때 입력한 로트번호로 입고처, 출고처, 현재 남은 재고를 조회합니다." />
      ) : result.movements.length === 0 && result.balances.length === 0 ? (
        <EmptyState title="일치하는 로트가 없습니다" description={`"${lotNo}" 로트번호의 입고·출고 이력이 없습니다. 번호를 다시 확인하세요.`} />
      ) : (
        <>
          <h3 className="mb-2 text-sm font-medium">
            현재 남은 재고 <span className="tabular-nums">{remain.toLocaleString()}</span>
          </h3>
          <div className="mb-6 overflow-auto rounded-lg border">
            <table className="data-table">
              <thead>
                <tr>
                  <th className="left">상품</th>
                  <th>위치</th>
                  <th>유통기한</th>
                  <th className="num">수량</th>
                </tr>
              </thead>
              <tbody>
                {result.balances.length === 0 && (
                  <tr>
                    <td colSpan={4}>남은 재고가 없습니다.</td>
                  </tr>
                )}
                {result.balances.map((b) => (
                  <tr key={b.id}>
                    <td className="left">
                      [{b.product.sku}] {b.product.name}
                    </td>
                    <td>{b.location?.code ?? "미지정"}</td>
                    <td>{b.expiryDate ? dbToDateOnly(b.expiryDate) : "미상"}</td>
                    <td className="num tabular-nums">{b.quantity.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mb-2 text-sm font-medium">
            입고·출고 이력 {result.movements.length >= LOT_TRACE_LIMIT && <span className="text-gray-500">(최근 {LOT_TRACE_LIMIT}건)</span>}
          </h3>
          <div className="max-h-[60vh] overflow-auto rounded-lg border">
            <table className="data-table">
              <thead>
                <tr>
                  <th>일시</th>
                  <th>구분</th>
                  <th className="left">상품</th>
                  <th className="left">거래처</th>
                  <th>위치</th>
                  <th className="num">수량</th>
                </tr>
              </thead>
              <tbody>
                {result.movements.map((m) => (
                  <tr key={m.id}>
                    <td>{dateTimeFmt.format(m.createdAt)}</td>
                    <td>{MOVEMENT_LABELS[m.type] ?? m.type}</td>
                    <td className="left">
                      [{m.product.sku}] {m.product.name}
                    </td>
                    <td className="left">{m.inbound?.partner?.name ?? m.outbound?.partner?.name ?? "-"}</td>
                    <td>{m.location?.code ?? "미지정"}</td>
                    <td className="num tabular-nums">{m.quantity > 0 ? `+${m.quantity.toLocaleString()}` : m.quantity.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
