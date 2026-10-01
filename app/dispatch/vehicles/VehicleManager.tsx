"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { createVehicleAction, setVehicleActiveAction, type DispatchActionState } from "@/modules/dispatch/actions";
import { STORAGE_TYPES, STORAGE_TYPE_LABELS, type StorageTypeCode } from "@/modules/warehouse/codes";
import StorageBadge from "../../warehouses/StorageBadge";

export type VehicleRow = {
  id: string;
  plateNo: string;
  storageType: StorageTypeCode;
  driverName: string;
  driverPhone: string | null;
  memo: string | null;
  isActive: boolean;
  dispatchCount: number;
};

const initial: DispatchActionState = { status: "idle", message: "" };
const input = "rounded border border-gray-300 px-2 py-1.5 text-sm";

export default function VehicleManager({ vehicles }: { vehicles: VehicleRow[] }) {
  const [cState, cAction, cPending] = useActionState(createVehicleAction, initial);
  const [tState, tAction, tPending] = useActionState(setVehicleActiveAction, initial);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (cState.status === "success") formRef.current?.reset();
  }, [cState]);
  const last = [cState, tState].filter((s) => s.status !== "idle").sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))[0];

  return (
    <div className="flex flex-col gap-4">
      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault();
          if (cPending) return;
          const fd = new FormData(e.currentTarget);
          startTransition(() => cAction(fd));
        }}
        noValidate
        className="flex flex-wrap items-end gap-2 rounded border border-gray-200 p-3 text-sm"
      >
        <label className="flex flex-col">
          차량번호
          <input name="plateNo" placeholder="12가3456" maxLength={20} className={`${input} w-32`} />
        </label>
        <label className="flex flex-col">
          적재 온도
          <select name="storageType" defaultValue="REFRIGERATED" className={input}>
            {STORAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {STORAGE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col">
          기사
          <input name="driverName" maxLength={30} className={`${input} w-28`} />
        </label>
        <label className="flex flex-col">
          연락처 (선택)
          <input name="driverPhone" placeholder="010-0000-0000" maxLength={20} className={`${input} w-36`} />
        </label>
        <label className="flex flex-1 flex-col">
          비고 (선택)
          <input name="memo" maxLength={200} className={input} />
        </label>
        <button disabled={cPending} className="rounded bg-blue-600 px-4 py-1.5 text-white hover:bg-blue-700 disabled:bg-gray-400">
          {cPending ? "등록 중..." : "차량 등록"}
        </button>
      </form>

      {last && <p aria-live="polite" className={`text-sm ${last.status === "success" ? "text-green-700" : "text-red-600"}`}>{last.message}</p>}

      <table className="w-full text-center text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">차량번호</th>
            <th>적재 온도</th>
            <th>실을 수 있는 상품</th>
            <th>기사</th>
            <th>연락처</th>
            <th>배차 횟수</th>
            <th>비고</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.length === 0 && (
            <tr>
              <td colSpan={8} className="py-8 text-gray-400">등록된 차량이 없습니다.</td>
            </tr>
          )}
          {vehicles.map((v) => (
            <tr key={v.id} className={`border-b ${v.isActive ? "" : "text-gray-400"}`}>
              <td className="py-2 font-medium">{v.plateNo}</td>
              <td><StorageBadge type={v.storageType} /></td>
              <td className="text-xs text-gray-500">
                {v.storageType === "FROZEN" ? "냉동·냉장·실온" : v.storageType === "REFRIGERATED" ? "냉장·실온" : "실온"}
              </td>
              <td>{v.driverName}</td>
              <td>{v.driverPhone ?? "-"}</td>
              <td>{v.dispatchCount.toLocaleString()}</td>
              <td className="max-w-40 truncate">{v.memo ?? ""}</td>
              <td>
                <form action={(fd) => startTransition(() => tAction(fd))} className="flex items-center justify-center gap-2">
                  <input type="hidden" name="vehicleId" value={v.id} />
                  <input type="hidden" name="active" value={v.isActive ? "0" : "1"} />
                  <span className={v.isActive ? "text-green-700" : "text-gray-400"}>{v.isActive ? "운행" : "중지"}</span>
                  <button disabled={tPending} className="rounded border px-2 py-0.5 text-xs hover:bg-gray-100">
                    {v.isActive ? "운행 중지" : "운행 재개"}
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
