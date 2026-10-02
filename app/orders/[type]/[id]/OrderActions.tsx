"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import Modal from "@/components/Modal";
import { newRequestId } from "@/lib/request-id";
import { finishOrderAction, processOrderAction, type OrderActionState } from "@/modules/order/actions";
import { ORDER_PROCESS_LABELS, type OrderStatusCode, type OrderTypeCode } from "@/modules/order/codes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export type ProcessLine = {
  id: string;
  sku: string;
  name: string;
  baseUnit: string;
  remaining: number;
  stock: number;
};

const initial: OrderActionState = { status: "idle", message: "" };

function ProcessForm({
  orderId,
  version,
  type,
  lines,
  onClose,
  onDone,
}: {
  orderId: string;
  version: number;
  type: OrderTypeCode;
  lines: ProcessLine[];
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [state, action, pending] = useActionState(processOrderAction, initial);
  const requestIdRef = useRef<string | null>(null);
  // 기본값: 남은 수량 (출고는 현재고까지만)
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, String(type === "SALES" ? Math.max(0, Math.min(l.remaining, l.stock)) : l.remaining)]))
  );
  useEffect(() => {
    if (state.status === "success") onDone(state.message);
  }, [state, onDone]);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    fd.set("lines", JSON.stringify(lines.map((l) => ({ lineId: l.id, quantity: qty[l.id] || "0" }))));
    requestIdRef.current ??= newRequestId();
    fd.set("requestId", requestIdRef.current);
    startTransition(() => action(fd));
  }

  const label = ORDER_PROCESS_LABELS[type];
  return (
    <Modal title={`${label} 처리`} onClose={onClose} maxWidth="max-w-2xl" closeDisabled={pending}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 text-sm">
        <input type="hidden" name="orderId" value={orderId} />
        <input type="hidden" name="version" value={version} />
        <table className="w-full text-center text-sm tabular-nums">
          <thead>
            <tr className="border-b text-xs text-gray-500">
              <th className="py-1">품목</th>
              <th className="text-right">남은 수량</th>
              {type === "SALES" && <th className="text-right">현재고</th>}
              <th className="w-32">이번 {label}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l) => {
              const n = Number(qty[l.id]) || 0;
              const over = n > l.remaining || (type === "SALES" && n > l.stock);
              return (
                <tr key={l.id} className="border-b">
                  <td className="py-1.5 text-left">
                    <span className="font-mono text-xs text-gray-500">{l.sku}</span> {l.name}
                  </td>
                  <td className="text-right">{l.remaining.toLocaleString()}</td>
                  {type === "SALES" && <td className={`text-right ${l.stock < l.remaining ? "text-amber-700" : ""}`}>{l.stock.toLocaleString()}</td>}
                  <td>
                    <Input
                      type="number"
                      min={0}
                      max={l.remaining}
                      value={qty[l.id]}
                      onChange={(e) => setQty((q) => ({ ...q, [l.id]: e.target.value }))}
                      className={`w-full rounded border px-2 py-1 ${over ? "border-red-400" : "border-gray-300"}`} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-xs text-gray-500">0을 넣은 품목은 처리하지 않습니다. 남은 수량을 넘거나{type === "SALES" ? " 재고가 부족하면" : "면"} 전체가 저장되지 않습니다.</p>
        <div className="flex gap-3">
          <label className="flex-1">
            {label}일시 (비우면 현재)
            <Input className="w-full" name="at" type="datetime-local" />
          </label>
          <label className="flex-1">
            비고 (선택)
            <Input className="w-full" name="memo" maxLength={500} />
          </label>
        </div>
        {state.status === "error" && <p className="text-red-600">{state.message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "처리 중..." : `${label} 처리`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function OrderActions({
  orderId,
  version,
  type,
  status,
  hasProcessed,
  lines,
}: {
  orderId: string;
  version: number;
  type: OrderTypeCode;
  status: OrderStatusCode;
  hasProcessed: boolean;
  lines: ProcessLine[];
}) {
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState("");
  const [confirm, setConfirm] = useState<"close" | "cancel" | null>(null);
  const [fState, fAction, fPending] = useActionState(finishOrderAction, initial);
  const active = status === "OPEN" || status === "PARTIAL";
  const pending = lines.filter((l) => l.remaining > 0);

  const msg = flash || (fState.status !== "idle" ? fState.message : "");
  const isErr = !flash && fState.status === "error";

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        {active && pending.length > 0 && (
          <Button 
            type="button"
            onClick={() => {
              setFlash("");
              setOpen(true);
            }}>
            {ORDER_PROCESS_LABELS[type]} 처리
          </Button>
        )}
        {status === "PARTIAL" && (
          <Button variant="outline" type="button" onClick={() => setConfirm("close")}>
            잔량 종결
          </Button>
        )}
        {status === "OPEN" && !hasProcessed && (
          <Button variant="destructive" type="button" onClick={() => setConfirm("cancel")}>
            주문 취소
          </Button>
        )}
      </div>

      {confirm && (
        <form
          action={(fd) => {
            setFlash("");
            startTransition(() => fAction(fd));
            setConfirm(null);
          }}
          className="flex items-center gap-2 rounded bg-amber-50 px-3 py-2 text-sm"
        >
          <input type="hidden" name="orderId" value={orderId} />
          <input type="hidden" name="version" value={version} />
          <input type="hidden" name="action" value={confirm} />
          {confirm === "close" ? "남은 수량을 더 처리하지 않고 종결합니다." : "이 주문을 취소합니다."}
          <button disabled={fPending} className="rounded-[6px] bg-amber-600 px-3 py-1 text-white hover:bg-amber-700">
            확인
          </button>
          <Button variant="outline" size="sm" type="button" onClick={() => setConfirm(null)}>
            아니오
          </Button>
        </form>
      )}

      {msg && <p aria-live="polite" className={`text-sm ${isErr ? "text-red-600" : "text-green-700"}`}>{msg}</p>}

      {open && (
        <ProcessForm
          orderId={orderId}
          version={version}
          type={type}
          lines={pending}
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
