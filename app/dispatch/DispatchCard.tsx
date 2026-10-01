"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import {
  addDispatchItemsAction,
  changeDispatchStatusAction,
  removeDispatchItemAction,
  type DispatchActionState,
} from "@/modules/dispatch/actions";
import {
  DISPATCH_CANCELLABLE,
  DISPATCH_NEXT,
  DISPATCH_STATUS_LABELS,
  DISPATCH_STATUS_STYLE,
  type DispatchStatusCode,
} from "@/modules/dispatch/codes";
import { STORAGE_TYPE_LABELS, type StorageTypeCode } from "@/modules/warehouse/codes";
import StorageBadge from "../warehouses/StorageBadge";
import OutboundPicker, { type OutboundOption } from "./OutboundPicker";

export type DispatchView = {
  id: string;
  dispatchNo: string;
  version: number;
  status: DispatchStatusCode;
  memo: string | null;
  deliveredAtText: string | null;
  vehicle: { plateNo: string; storageType: StorageTypeCode; driverName: string; driverPhone: string | null };
  items: { id: string; seq: number; outbound: OutboundOption }[];
};

const initial: DispatchActionState = { status: "idle", message: "" };

function AddItems({ d, options, onClose }: { d: DispatchView; options: OutboundOption[]; onClose: (m?: string) => void }) {
  const [state, action, pending] = useActionState(addDispatchItemsAction, initial);
  const [selected, setSelected] = useState<string[]>([]);
  useEffect(() => {
    if (state.status === "success") onClose(state.message);
  }, [state, onClose]);
  return (
    <Modal title={`${d.dispatchNo} 출고 추가`} onClose={() => onClose()} maxWidth="max-w-3xl" closeDisabled={pending}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          const fd = new FormData(e.currentTarget);
          fd.set("outboundIds", JSON.stringify(selected));
          startTransition(() => action(fd));
        }}
        className="flex flex-col gap-3 text-sm"
      >
        <input type="hidden" name="dispatchId" value={d.id} />
        <input type="hidden" name="version" value={d.version} />
        <OutboundPicker options={options} vehicleType={d.vehicle.storageType} selected={selected} onChange={setSelected} />
        {state.status === "error" && <p className="text-red-600">{state.message}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => onClose()} className="rounded border border-gray-300 px-4 py-2 hover:bg-gray-100">
            닫기
          </button>
          <button disabled={pending || selected.length === 0} className="rounded bg-blue-600 px-4 py-2 text-white disabled:bg-gray-400">
            {pending ? "추가 중..." : `추가 (${selected.length}건)`}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function DispatchCard({ d, unassigned }: { d: DispatchView; unassigned: OutboundOption[] }) {
  const [sState, sAction, sPending] = useActionState(changeDispatchStatusAction, initial);
  const [rState, rAction, rPending] = useActionState(removeDispatchItemAction, initial);
  const [adding, setAdding] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [flash, setFlash] = useState("");
  const next = DISPATCH_NEXT[d.status];
  const planned = d.status === "PLANNED";
  const busy = sPending || rPending;
  const last = [sState, rState].filter((s) => s.status !== "idle").sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))[0];
  const msg = flash || last?.message;
  const isErr = !flash && last?.status === "error";
  const totalQty = d.items.reduce((s, i) => s + i.outbound.quantity, 0);

  return (
    <div className={`rounded-lg border p-4 ${d.status === "CANCELLED" ? "border-gray-200 opacity-60" : "border-gray-300"}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-gray-500">{d.dispatchNo}</span>
            <span className={`rounded px-1.5 py-0.5 text-xs ${DISPATCH_STATUS_STYLE[d.status]}`}>{DISPATCH_STATUS_LABELS[d.status]}</span>
          </div>
          <p className="mt-1 flex items-center gap-2 text-lg font-semibold">
            {d.vehicle.plateNo} <StorageBadge type={d.vehicle.storageType} />
          </p>
          <p className="text-sm text-gray-600">
            {d.vehicle.driverName}
            {d.vehicle.driverPhone && ` · ${d.vehicle.driverPhone}`} · 출고 {d.items.length}건 · {totalQty.toLocaleString()}개
            {d.deliveredAtText && ` · 완료 ${d.deliveredAtText}`}
          </p>
          {d.memo && <p className="text-xs text-gray-500">{d.memo}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          {planned && (
            <button type="button" onClick={() => { setFlash(""); setAdding(true); }} disabled={busy} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100">
              + 출고 추가
            </button>
          )}
          {next && (
            <form action={(fd) => { setFlash(""); startTransition(() => sAction(fd)); }}>
              <input type="hidden" name="dispatchId" value={d.id} />
              <input type="hidden" name="version" value={d.version} />
              <input type="hidden" name="to" value={next.to} />
              <button disabled={busy} className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:bg-gray-400">
                {next.label}
              </button>
            </form>
          )}
          {DISPATCH_CANCELLABLE.includes(d.status) && !confirmCancel && (
            <button type="button" onClick={() => setConfirmCancel(true)} disabled={busy} className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">
              배차 취소
            </button>
          )}
        </div>
      </div>

      {confirmCancel && (
        <form
          action={(fd) => { setFlash(""); setConfirmCancel(false); startTransition(() => sAction(fd)); }}
          className="mt-2 flex items-center gap-2 rounded bg-red-50 px-3 py-2 text-sm"
        >
          <input type="hidden" name="dispatchId" value={d.id} />
          <input type="hidden" name="version" value={d.version} />
          <input type="hidden" name="to" value="CANCELLED" />
          배차를 취소하면 실린 출고 {d.items.length}건이 다시 배차 대기로 돌아갑니다.
          <button className="rounded bg-red-600 px-3 py-1 text-white">취소 확정</button>
          <button type="button" onClick={() => setConfirmCancel(false)} className="rounded border px-3 py-1">아니오</button>
        </form>
      )}

      {msg && <p aria-live="polite" className={`mt-2 text-sm ${isErr ? "text-red-600" : "text-green-700"}`}>{msg}</p>}

      {d.items.length > 0 && (
        <table className="mt-3 w-full text-center text-sm">
          <thead>
            <tr className="border-b text-xs text-gray-500">
              <th className="w-10 py-1">순서</th>
              <th>출고처</th>
              <th>품목</th>
              <th>수량</th>
              <th>보관</th>
              <th>출고일시</th>
              {planned && <th className="w-12" />}
            </tr>
          </thead>
          <tbody>
            {d.items.map((i) => (
              <tr key={i.id} className="border-b">
                <td className="py-1">{i.seq}</td>
                <td>{i.outbound.customer ?? "-"}</td>
                <td className="text-left">
                  <span className="font-mono text-xs text-gray-500">{i.outbound.sku}</span> {i.outbound.name}
                </td>
                <td>
                  {i.outbound.quantity.toLocaleString()} {i.outbound.baseUnit}
                </td>
                <td className="text-xs">{STORAGE_TYPE_LABELS[i.outbound.required]}</td>
                <td className="whitespace-nowrap text-xs text-gray-500">{i.outbound.shippedAtText}</td>
                {planned && (
                  <td>
                    <form action={(fd) => { setFlash(""); startTransition(() => rAction(fd)); }}>
                      <input type="hidden" name="dispatchId" value={d.id} />
                      <input type="hidden" name="version" value={d.version} />
                      <input type="hidden" name="itemId" value={i.id} />
                      <button disabled={busy || d.items.length === 1} title={d.items.length === 1 ? "마지막 품목은 뺄 수 없습니다" : "배차에서 빼기"} className="text-xs text-gray-500 hover:text-red-600 disabled:text-gray-300">
                        빼기
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {adding && (
        <AddItems
          d={d}
          options={unassigned}
          onClose={(m) => {
            if (m) setFlash(m);
            setAdding(false);
          }}
        />
      )}
    </div>
  );
}
