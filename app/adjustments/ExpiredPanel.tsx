"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2Icon } from "lucide-react";
import { adjustStockAction } from "@/modules/stock/actions";
import type { ExpiredBucket } from "@/modules/stock/adjust-queries";
import { newRequestId } from "@/lib/request-id";
import { Button } from "@/components/ui/button";
import EmptyState from "@/components/EmptyState";

/** 유통기한이 지난 칸 재고 목록. [폐기] → 확인 → 그 칸 전량을 '유통기한 경과 폐기'로 차감 */
export default function ExpiredPanel({ rows, total }: { rows: ExpiredBucket[]; total: number }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-base font-semibold">폐기 대상 (유통기한 경과)</h3>
        <span className="text-sm text-muted-foreground tabular-nums">
          <b className="font-semibold text-foreground">{total.toLocaleString()}</b>칸
        </span>
      </div>
      <div className="max-h-80 overflow-auto rounded-lg border">
        <table className="data-table">
          <thead>
            <tr>
              <th className="left">상품</th>
              <th className="left">위치</th>
              <th>유통기한</th>
              <th>경과</th>
              <th className="num">수량</th>
              <th>처리</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="p-0">
                  <EmptyState icon={CheckCircle2Icon} title="유통기한이 지난 재고가 없습니다." />
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <ExpiredRow key={`${r.productId}|${r.locationId ?? ""}|${r.expiryDate}`} r={r} />
            ))}
          </tbody>
        </table>
      </div>
      {total > rows.length && (
        <p className="mt-1 text-xs text-muted-foreground">오래된 순 {rows.length}칸만 표시했습니다. 처리 후 새로고침하면 다음 칸이 나옵니다.</p>
      )}
    </section>
  );
}

function ExpiredRow({ r }: { r: ExpiredBucket }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  // 같은 행의 재시도는 같은 requestId → 서버가 한 번만 반영
  const requestIdRef = useRef<string | null>(null);

  function discard() {
    if (pending) return;
    setError("");
    requestIdRef.current ??= newRequestId();
    const fd = new FormData();
    fd.set("requestId", requestIdRef.current);
    fd.set("productId", r.productId);
    fd.set("locationId", r.locationId ?? "");
    fd.set("expiryDate", r.expiryDate);
    fd.set("reason", "EXPIRED");
    fd.set("quantity", String(r.quantity));
    startTransition(async () => {
      const res = await adjustStockAction({ status: "idle", message: "" }, fd);
      if (res.status === "success") router.refresh();
      else {
        setError(res.message);
        setConfirming(false);
      }
    });
  }

  return (
    <>
      <tr>
        <td className="left">
          <span className="font-mono text-xs text-muted-foreground">{r.sku}</span> {r.name}
        </td>
        <td className="left font-mono">{r.locationCode ?? <span className="text-gray-400">미지정</span>}</td>
        <td className="tabular-nums">{r.expiryDate}</td>
        <td className="text-red-700 tabular-nums">{r.overdueDays.toLocaleString()}일</td>
        <td className="num">
          {r.quantity.toLocaleString()} {r.baseUnit}
        </td>
        <td>
          {confirming ? (
            <div className="flex justify-center gap-1">
              <Button size="sm" variant="destructive" type="button" onClick={discard} disabled={pending}>
                {pending ? "처리 중..." : `${r.quantity.toLocaleString()}${r.baseUnit} 폐기 확인`}
              </Button>
              <Button size="sm" variant="outline" type="button" onClick={() => setConfirming(false)} disabled={pending}>
                취소
              </Button>
            </div>
          ) : (
            <Button size="sm" variant="outline" type="button" onClick={() => setConfirming(true)}>
              폐기
            </Button>
          )}
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={6} className="left text-xs text-red-600">
            {error}
          </td>
        </tr>
      )}
    </>
  );
}
