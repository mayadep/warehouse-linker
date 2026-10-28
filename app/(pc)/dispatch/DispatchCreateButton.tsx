"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { newRequestId } from "@/lib/request-id";
import { createDispatchAction, type DispatchActionState } from "@/modules/dispatch/actions";
import { STORAGE_TYPE_LABELS, type StorageTypeCode } from "@/modules/warehouse/codes";
import OutboundPicker, { type OutboundOption } from "./OutboundPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
export type VehicleOption = { id: string; plateNo: string; storageType: StorageTypeCode; driverName: string };

const initial: DispatchActionState = { status: "idle", message: "" };

function CreateForm({
  date,
  vehicles,
  outbounds,
  onClose,
  onDone,
}: {
  date: string;
  vehicles: VehicleOption[];
  outbounds: OutboundOption[];
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const [state, action, pending] = useActionState(createDispatchAction, initial);
  const requestIdRef = useRef<string | null>(null);
  const [vehicleId, setVehicleId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const vehicle = vehicles.find((v) => v.id === vehicleId) ?? null;

  useEffect(() => {
    if (state.status === "success") onDone(state.message);
  }, [state, onDone]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    fd.set("outboundIds", JSON.stringify(selected));
    requestIdRef.current ??= newRequestId();
    fd.set("requestId", requestIdRef.current);
    startTransition(() => action(fd));
  }

  return (
    <Modal title="배차 등록" onClose={onClose} maxWidth="max-w-3xl" closeDisabled={pending}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 text-sm">
        <div className="flex gap-3">
          <label className="w-44">
            배송일
            <Input className="w-full" name="deliveryDate" type="date" defaultValue={date} />
          </label>
          <label className="flex-1">
            차량
            <NativeSelect className="w-full"
              name="vehicleId"
              value={vehicleId}
              onChange={(e) => {
                setVehicleId(e.target.value);
                setSelected([]);
              }}>
              <option value="">-- 차량 선택 --</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plateNo} · {STORAGE_TYPE_LABELS[v.storageType]} · {v.driverName}
                </option>
              ))}
            </NativeSelect>
          </label>
        </div>
        {vehicles.length === 0 && <p className="text-amber-700">운행 중인 차량이 없습니다. 차량 관리에서 먼저 등록하세요.</p>}
        <div>
          <p className="mb-1">
            출고 건 선택 <span className="text-xs text-gray-500">({selected.length}건 선택 · 냉동 차량은 냉동·냉장·실온, 냉장 차량은 냉장·실온, 실온 차량은 실온만)</span>
          </p>
          <OutboundPicker options={outbounds} vehicleType={vehicle?.storageType ?? null} selected={selected} onChange={setSelected} />
        </div>
        <label>
          비고 (선택)
          <Input className="w-full" name="memo" maxLength={200} />
        </label>
        {state.status === "error" && <p className="text-red-600">{state.message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button type="submit" disabled={pending || !vehicle || selected.length === 0}>
            {pending ? "등록 중..." : `배차 등록 (${selected.length}건)`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function DispatchCreateButton(props: { date: string; vehicles: VehicleOption[]; outbounds: OutboundOption[] }) {
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState("");
  return (
    <div className="flex items-center gap-3">
      {flash && <span aria-live="polite" className="text-sm text-green-700">{flash}</span>}
      <Button 
        type="button"
        onClick={() => {
          setFlash("");
          setOpen(true);
        }}>
        + 배차 등록
      </Button>
      {open && (
        <CreateForm
          {...props}
          onClose={() => setOpen(false)}
          onDone={(m) => {
            setFlash(m);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}
