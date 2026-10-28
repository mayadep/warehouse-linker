"use client";

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

  return (
    <form
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
      {state.status === "error" && (
        <p aria-live="polite" className="col-span-4 mobile:col-span-2 text-sm text-red-600">
          {state.message}
        </p>
      )}
    </form>
  );
}
