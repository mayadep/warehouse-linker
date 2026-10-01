"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { addRacksAction, type AddRacksActionState } from "@/modules/warehouse/actions";
import { WAREHOUSE_LIMITS as L, locationCode, rackCode } from "@/modules/warehouse/codes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
const initialState: AddRacksActionState = { status: "idle", message: "" };
const input = "w-full";
const errText = "mt-1 block text-xs text-red-600";

function AddForm({
  warehouseId,
  warehouseCode,
  rackCount,
  lastRackNumber,
  onDone,
  onClose,
}: {
  warehouseId: string;
  warehouseCode: string;
  rackCount: number;
  lastRackNumber: number;
  onDone: (msg: string) => void;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(addRacksAction, initialState);
  const [count, setCount] = useState("1");
  const [levels, setLevels] = useState(String(L.defaultLevels));
  const [bins, setBins] = useState(String(L.defaultBinsPerLevel));

  useEffect(() => {
    if (state.status === "success") onDone(state.message);
  }, [state, onDone]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  const n = (s: string) => (/^\d+$/.test(s) ? Number(s) : 0);
  const start = lastRackNumber + 1;
  const end = start + n(count) - 1;
  const total = n(count) * n(levels) * n(bins);
  const err = state.status === "error" ? state.errors ?? {} : {};

  return (
    <Modal title={`랙 추가 · ${warehouseCode}`} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="warehouseId" value={warehouseId} />
        <input type="hidden" name="expectedRackCount" value={rackCount} />
        <div className="flex gap-4">
          <label className="flex-1 text-sm">
            추가할 랙 수
            <Input name="count" type="number" min={1} max={L.maxRackNumber} className={input} value={count} onChange={(e) => setCount(e.target.value)} />
            {err.count && <span className={errText}>{err.count}</span>}
          </label>
          <label className="flex-1 text-sm">
            단 수
            <Input name="levels" type="number" min={1} max={L.maxLevels} className={input} value={levels} onChange={(e) => setLevels(e.target.value)} />
            {err.levels && <span className={errText}>{err.levels}</span>}
          </label>
          <label className="flex-1 text-sm">
            단별 구획 수
            <Input name="binsPerLevel" type="number" min={1} max={L.maxBinsPerLevel} className={input} value={bins} onChange={(e) => setBins(e.target.value)} />
            {err.binsPerLevel && <span className={errText}>{err.binsPerLevel}</span>}
          </label>
        </div>

        <p className="rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
          {n(count) > 0
            ? `${rackCode(start)}${n(count) > 1 ? `~${rackCode(end)}` : ""} 생성 · ${total.toLocaleString()}칸 · 위치코드 ${locationCode(warehouseCode, start, 1, 1)} ~ ${locationCode(warehouseCode, end, n(levels), n(bins))}`
            : "추가할 랙 수를 입력하세요."}
          {end > L.maxRackNumber && <span className="block text-red-600">랙 번호는 {L.maxRackNumber}번까지입니다.</span>}
          {total > L.maxLocationsPerRequest && (
            <span className="block text-red-600">한 번에 {L.maxLocationsPerRequest.toLocaleString()}칸까지 만들 수 있습니다.</span>
          )}
        </p>

        {state.status === "error" && (
          <p aria-live="polite" className="text-sm text-red-600">
            {state.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "생성 중..." : "랙 추가"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function RackAddButton(props: {
  warehouseId: string;
  warehouseCode: string;
  rackCount: number;
  lastRackNumber: number;
}) {
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState("");
  return (
    <>
      <div className="flex items-center gap-3">
        {flash && <span aria-live="polite" className="text-sm text-green-700">{flash}</span>}
        <Button 
          type="button"
          onClick={() => {
            setFlash("");
            setOpen(true);
          }}>
          + 랙 추가
        </Button>
      </div>
      {open && (
        <AddForm
          {...props}
          onClose={() => setOpen(false)}
          onDone={(msg) => {
            setFlash(msg);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
