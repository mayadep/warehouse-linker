"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createCountAction, type CountActionState } from "@/modules/cyclecount/actions";
import { newRequestId } from "@/lib/request-id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

const initialState: CountActionState = { status: "idle", message: "" };

/** 실사표 만들기: 창고와 위치코드 앞부분(랙 단위 등) 중 하나 이상 */
export default function CountCreateForm({ warehouses }: { warehouses: { id: string; name: string }[] }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(async (prev: CountActionState, fd: FormData) => {
    const r = await createCountAction(prev, fd);
    if (r.status === "success" && r.countId) router.push(`/counts/${r.countId}`);
    return r;
  }, initialState);
  // 성공 전까지 같은 요청키를 재사용 → 재전송돼도 1장만 생성
  const requestIdRef = useRef<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  /** 겹침 경고를 확인하고 그래도 만들기 (같은 요청키로 다시 전송) */
  function submitAnyway() {
    if (pending || !formRef.current) return;
    const fd = new FormData(formRef.current);
    requestIdRef.current ??= newRequestId();
    fd.set("requestId", requestIdRef.current);
    fd.set("confirmOverlap", "1");
    startTransition(() => action(fd));
  }

  return (
    <form
      ref={formRef}
      noValidate
      className="grid grid-cols-4 gap-x-4 gap-y-3 mobile:grid-cols-2 rounded-lg border bg-card p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        const fd = new FormData(e.currentTarget);
        requestIdRef.current ??= newRequestId();
        fd.set("requestId", requestIdRef.current);
        startTransition(() => action(fd));
      }}
    >
      <label className="text-sm">
        창고
        <NativeSelect name="warehouseId" defaultValue="" className="w-full">
          <option value="">-- 전체 --</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </NativeSelect>
      </label>
      <label className="text-sm">
        위치코드 앞부분
        <Input name="locationPrefix" maxLength={30} className="w-full uppercase" placeholder="예: RF1-R01" />
      </label>
      <label className="col-span-2 text-sm">
        메모 (선택)
        <Input name="memo" maxLength={200} className="w-full" placeholder="예: 10월 정기 실사" />
      </label>
      <div className="col-span-4 mobile:col-span-2 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">창고 또는 위치코드 앞부분 중 하나는 꼭 지정하세요. 만드는 시점의 장부 수량이 실사표에 담깁니다.</p>
        <Button type="submit" disabled={pending}>
          {pending ? "만드는 중..." : "실사표 만들기"}
        </Button>
      </div>
      {state.status === "confirm" && state.overlaps && (
        <div aria-live="polite" className="col-span-4 mobile:col-span-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-medium">{state.message}</p>
          <ul className="mt-2 list-disc pl-5">
            {state.overlaps.map((o) => (
              <li key={o.id}>
                <Link href={`/counts/${o.id}`} className="underline">
                  {o.countNo}
                </Link>{" "}
                (담당 {o.createdByName ?? "-"}) · 겹치는 줄 {o.lines.toLocaleString()}개
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">같은 칸을 따로 세면 나중에 확정한 쪽이 결과를 좌우합니다. 한쪽을 취소하거나 범위를 나눈 뒤 진행하는 것을 권장합니다.</p>
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="outline" size="sm" onClick={submitAnyway} disabled={pending}>
              그래도 만들기
            </Button>
          </div>
        </div>
      )}
      {state.status === "error" && (
        <p aria-live="polite" className="col-span-4 mobile:col-span-2 text-sm text-red-600">
          {state.message}
        </p>
      )}
    </form>
  );
}
