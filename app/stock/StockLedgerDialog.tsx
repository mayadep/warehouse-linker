"use client";

import { startTransition, useActionState, useCallback, useEffect, useRef, useState } from "react";
import {
  getStockLedgerAction,
  updateSafetyStockAction,
  type LedgerResult,
  type SafetyStockActionState,
} from "@/modules/stock/actions";
import type { StockRow } from "./StockTable";
import LocationEditor, { type WarehouseOption } from "./LocationEditor";

const initialState: SafetyStockActionState = { status: "idle", message: "" };

const TYPE_STYLE: Record<string, string> = {
  INBOUND: "text-blue-700",
  OUTBOUND: "text-red-700",
  INBOUND_CORRECTION: "text-blue-500",
  OUTBOUND_CORRECTION: "text-red-500",
  ADJUST: "text-gray-700",
};

export default function StockLedgerDialog({
  row,
  warehouses,
  onClose,
}: {
  row: StockRow;
  warehouses: WarehouseOption[];
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [ledger, setLedger] = useState<LedgerResult | null>(null);
  const [reload, setReload] = useState(0);
  const onLocationChanged = useCallback(() => setReload((n) => n + 1), []);
  const [state, formAction, pending] = useActionState(updateSafetyStockAction, initialState);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  // 원장 조회 (재고 수량이 바뀌면 다시 조회)
  useEffect(() => {
    let alive = true;
    getStockLedgerAction(row.id).then((r) => {
      if (alive) setLedger(r);
    });
    return () => {
      alive = false;
    };
  }, [row.id, row.stock, reload]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="m-auto w-full max-w-4xl rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      aria-labelledby="ledger-title"
    >
      <div className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 id="ledger-title" className="text-lg font-bold">
              재고 원장
            </h3>
            <p className="text-sm text-gray-600">
              [{row.sku}] {row.name} · 현재고{" "}
              <span className="font-semibold">
                {row.stock.toLocaleString()} {row.baseUnit}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="text-gray-400 hover:text-gray-700"
            aria-label="닫기"
          >
            ✕
          </button>
        </div>

        <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-center gap-2 rounded bg-gray-50 p-3 text-sm">
          <input type="hidden" name="productId" value={row.id} />
          <label className="flex items-center gap-2">
            안전재고
            <input
              name="safetyStock"
              type="number"
              min={0}
              step={1}
              defaultValue={row.safetyStock}
              className="w-28 rounded border border-gray-300 px-2 py-1 text-sm"
            />
            {row.baseUnit}
          </label>
          <button
            disabled={pending}
            className="rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-700 disabled:bg-gray-400"
          >
            {pending ? "저장 중..." : "저장"}
          </button>
          <span className="text-xs text-gray-500">현재고가 이 값 이하이면 &apos;부족&apos;으로 표시됩니다. (0 = 사용 안 함)</span>
          {state.message && (
            <span
              aria-live="polite"
              className={`w-full text-xs ${state.status === "success" ? "text-green-700" : "text-red-600"}`}
            >
              {state.message}
            </span>
          )}
        </form>

        <LocationEditor
          productId={row.id}
          locationId={row.locationId}
          locationCode={row.locationCode}
          warehouses={warehouses}
          onChanged={onLocationChanged}
        />

        {ledger?.ok && ledger.locationHistory.length > 0 && (
          <div className="text-xs text-gray-600">
            <p className="mb-1 font-medium text-gray-500">최근 위치 변경</p>
            <ul className="flex flex-col gap-0.5">
              {ledger.locationHistory.map((h) => (
                <li key={h.id}>
                  <span className="text-gray-400">{h.createdAtText}</span>{" "}
                  <span className="font-mono">
                    {h.fromCode ?? "없음"} → {h.toCode ?? "없음"}
                  </span>
                  {h.swappedWithSku && <span className="text-amber-700"> (교환: {h.swappedWithSku})</span>}
                  {h.reason && <span className="text-gray-400"> — {h.reason}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="max-h-[50vh] overflow-y-auto">
          {ledger === null ? (
            <p className="py-6 text-center text-sm text-gray-400">불러오는 중...</p>
          ) : !ledger.ok ? (
            <p className="py-6 text-center text-sm text-red-600">{ledger.message}</p>
          ) : (
            <>
              <p className="mb-1 text-xs text-gray-500">
                재고 이력 {ledger.total.toLocaleString()}건
                {ledger.total > ledger.entries.length && ` 중 최근 ${ledger.entries.length}건`}
              </p>
              <table className="w-full text-center text-sm">
                <thead className="sticky top-0 bg-white">
                  <tr className="border-b">
                    <th className="py-2">처리일시</th>
                    <th>구분</th>
                    <th>수량</th>
                    <th>재고 (전 → 후)</th>
                    <th>입출고일시</th>
                    <th>거래처</th>
                    <th>비고 / 수정사유</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.entries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-gray-400">
                        재고 이력이 없습니다.
                      </td>
                    </tr>
                  )}
                  {ledger.entries.map((e) => (
                    <tr key={e.id} className="border-b">
                      <td className="whitespace-nowrap py-1.5">{e.createdAtText}</td>
                      <td className={TYPE_STYLE[e.type] ?? ""}>{e.typeLabel}</td>
                      <td className={e.quantity > 0 ? "text-blue-700" : "text-red-700"}>
                        {e.quantity > 0 ? "+" : ""}
                        {e.quantity.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap text-gray-600">
                        {e.beforeStock.toLocaleString()} → {e.afterStock.toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap text-gray-500">{e.tradeAtText ?? "-"}</td>
                      <td>{e.partner ?? "-"}</td>
                      <td className="max-w-48 truncate text-gray-600" title={e.note ?? undefined}>
                        {e.note ?? ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </dialog>
  );
}
