"use client";

import { useState, useTransition } from "react";
import { assignLocationsAction, type AssignActionState } from "@/modules/warehouse/actions";
import { Button } from "@/components/ui/button";
/** 위치 없는 상품에 빈 칸 랜덤 배정 (확인 후 실행) */
export default function AssignLocationsButton({ unassignedCount }: { unassignedCount: number }) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<AssignActionState | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (pending) return;
    startTransition(async () => {
      const r = await assignLocationsAction();
      setResult(r);
      setConfirming(false);
    });
  }

  return (
    <div className="mb-4 rounded border border-gray-200 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span>
          보관위치 미배정 상품 <b className={unassignedCount ? "text-amber-700" : ""}>{unassignedCount.toLocaleString()}개</b>
        </span>
        {!confirming ? (
          <Button variant="outline" size="sm"
            type="button"
            disabled={unassignedCount === 0 || pending}
            onClick={() => {
              setResult(null);
              setConfirming(true);
            }}>
            위치 자동 배정
          </Button>
        ) : (
          <span className="flex flex-wrap items-center gap-2 rounded bg-amber-50 px-2 py-1">
            위치 없는 상품 {unassignedCount.toLocaleString()}개에 빈 칸을 랜덤 배정합니다 (냉동식품→냉동, 유제품→냉장, 그 외→실온).
            <Button size="sm"
              type="button"
              onClick={run}
              disabled={pending}>
              {pending ? "배정 중..." : "실행"}
            </Button>
            <Button variant="outline" size="sm" type="button" onClick={() => setConfirming(false)} disabled={pending}>
              취소
            </Button>
          </span>
        )}
      </div>
      {result && (
        <p aria-live="polite" className={`mt-2 ${result.status === "success" ? "text-green-700" : "text-amber-700"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
