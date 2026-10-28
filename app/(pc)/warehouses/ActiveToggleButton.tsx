"use client";

import { useState, useTransition } from "react";
import { setLocationGroupActiveAction, type ActiveActionState } from "@/modules/warehouse/actions";
import { Button } from "@/components/ui/button";

/** 창고/랙 비활성화(확인 후 실행) · 다시 사용. onResult 가 있으면 결과 문구는 부모가 표시 */
export default function ActiveToggleButton({
  target,
  id,
  label,
  isActive,
  size = "sm",
  onResult,
}: {
  target: "warehouse" | "rack";
  id: string;
  label: string;
  isActive: boolean;
  size?: "sm" | "xs";
  onResult?: (r: ActiveActionState) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ActiveActionState | null>(null);
  const [pending, startTransition] = useTransition();

  function run(active: boolean) {
    if (pending) return;
    const fd = new FormData();
    fd.set("target", target);
    fd.set("id", id);
    fd.set("active", active ? "1" : "0");
    startTransition(async () => {
      const r = await setLocationGroupActiveAction({ status: "idle", message: "" }, fd);
      setConfirming(false);
      if (onResult) onResult(r);
      else setResult(r);
    });
  }

  const report = (r: ActiveActionState | null) => {
    if (onResult) onResult(r ?? { status: "idle", message: "" });
    else setResult(r);
  };

  return (
    <span className="inline-flex flex-col items-end gap-1" onClick={(e) => e.stopPropagation()}>
      {!isActive ? (
        <Button variant="outline" size={size} type="button" disabled={pending} onClick={() => run(true)}>
          {pending ? "처리 중..." : "다시 사용"}
        </Button>
      ) : !confirming ? (
        <Button
          variant="destructive"
          size={size}
          type="button"
          disabled={pending}
          onClick={() => {
            report(null);
            setConfirming(true);
          }}
        >
          비활성화
        </Button>
      ) : (
        <span className="inline-flex flex-wrap items-center justify-end gap-2 rounded bg-amber-50 px-2 py-1 text-xs">
          {label}을(를) 비활성화하면 새 위치로 지정할 수 없습니다.
          <Button variant="destructive-solid" size="xs" type="button" disabled={pending} onClick={() => run(false)}>
            {pending ? "처리 중..." : "비활성화"}
          </Button>
          <Button variant="outline" size="xs" type="button" disabled={pending} onClick={() => setConfirming(false)}>
            취소
          </Button>
        </span>
      )}
      {result && result.status !== "idle" && (
        <span aria-live="polite" className={`max-w-xl text-right text-sm ${result.status === "success" ? "text-green-700" : "text-red-700"}`}>
          {result.message}
        </span>
      )}
    </span>
  );
}
