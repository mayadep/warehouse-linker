"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { createVehicleAction, setVehicleActiveAction, type DispatchActionState } from "@/modules/dispatch/actions";
import { STORAGE_TYPES, STORAGE_TYPE_LABELS, type StorageTypeCode } from "@/modules/warehouse/codes";
import StorageBadge from "../../warehouses/StorageBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import EmptyState from "@/components/EmptyState";
import { TruckIcon } from "lucide-react";
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
const input = "";

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
          <Input name="plateNo" placeholder="12가3456" maxLength={20} className={`${input} w-32`} />
        </label>
        <label className="flex flex-col">
          적재 온도
          <NativeSelect name="storageType" defaultValue="REFRIGERATED" className={input}>
            {STORAGE_TYPES.map((t) => (
              <option key={t} value={t}>
                {STORAGE_TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="flex flex-col">
          기사
          <Input name="driverName" maxLength={30} className={`${input} w-28`} />
        </label>
        <label className="flex flex-col">
          연락처 (선택)
          <Input name="driverPhone" placeholder="010-0000-0000" maxLength={20} className={`${input} w-36`} />
        </label>
        <label className="flex flex-1 flex-col">
          비고 (선택)
          <Input name="memo" maxLength={200} className={input} />
        </label>
        <Button size="sm" type="submit" disabled={cPending}>
          {cPending ? "등록 중..." : "차량 등록"}
        </Button>
      </form>

      {last && <p aria-live="polite" className={`text-sm ${last.status === "success" ? "text-green-700" : "text-red-600"}`}>{last.message}</p>}

      <div className="max-h-[70vh] overflow-auto rounded-lg border">
<table className="data-table">
        <thead>
          <tr>
            <th className="left">차량번호</th>
            <th>적재 온도</th>
            <th className="left">실을 수 있는 상품</th>
            <th className="left">기사</th>
            <th>연락처</th>
            <th className="num">배차 횟수</th>
            <th className="left">비고</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.length === 0 && (
            <tr>
              <td colSpan={8} className="p-0">
                <EmptyState icon={TruckIcon} title="등록된 차량이 없습니다." description="차량을 등록하면 배차를 편성할 수 있습니다." />
              </td>
            </tr>
          )}
          {vehicles.map((v) => (
            <tr key={v.id} className={`${v.isActive ? "" : "text-gray-400"}`}>
              <td className="left font-medium">{v.plateNo}</td>
              <td><StorageBadge type={v.storageType} /></td>
              <td className="left text-xs text-gray-500">
                {v.storageType === "FROZEN" ? "냉동·냉장·실온" : v.storageType === "REFRIGERATED" ? "냉장·실온" : "실온"}
              </td>
              <td className="left">{v.driverName}</td>
              <td>{v.driverPhone ?? "-"}</td>
              <td className="num">{v.dispatchCount.toLocaleString()}</td>
              <td className="left max-w-40 truncate">{v.memo ?? ""}</td>
              <td>
                <form action={(fd) => startTransition(() => tAction(fd))} className="flex items-center justify-center gap-2">
                  <input type="hidden" name="vehicleId" value={v.id} />
                  <input type="hidden" name="active" value={v.isActive ? "0" : "1"} />
                  <span className={v.isActive ? "text-green-700" : "text-gray-400"}>{v.isActive ? "운행" : "중지"}</span>
                  <Button variant="outline" size="xs" type="submit" disabled={tPending}>
                    {v.isActive ? "운행 중지" : "운행 재개"}
                  </Button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
</div>
    </div>
  );
}
