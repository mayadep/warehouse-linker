"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import {
  updateOutboundAction,
  type OutboundUpdateActionState,
} from "@/modules/outbound/actions";
import type { OutboundRow } from "./OutboundTable";

const initialState: OutboundUpdateActionState = { status: "idle", message: "" };
const input = "w-full rounded border border-gray-300 px-3 py-2 text-sm";
const errText = "mt-1 block text-xs text-red-600";

export default function OutboundEditDialog({
  row,
  onClose,
  onSaved,
}: {
  row: OutboundRow;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(updateOutboundAction, initialState);
  const [quantityText, setQuantityText] = useState(String(row.quantity));

  // 마운트 시 모달로 열기 (ESC/배경 포커스 차단은 브라우저 기본 동작)
  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  // 저장 성공 → 부모에 알리고 닫기
  useEffect(() => {
    if (state.status === "success") onSaved(state.message);
  }, [state, onSaved]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  const err = state.status === "error" ? state.errors ?? {} : {};
  const newQty = /^\d+$/.test(quantityText) ? Number(quantityText) : null;
  const qtyDelta = newQty === null ? 0 : newQty - row.quantity;
  const delta = -qtyDelta; // 출고 수량이 늘면 재고 감소
  const nextStock = row.productStock + delta;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => {
        if (pending) e.preventDefault(); // 저장 중에는 ESC로 닫지 않음
      }}
      className="m-auto w-full max-w-lg rounded-lg p-0 shadow-xl backdrop:bg-black/40"
      aria-labelledby="outbound-edit-title"
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between">
          <h3 id="outbound-edit-title" className="text-lg font-bold">
            출고 수정
          </h3>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            className="text-gray-400 hover:text-gray-700"
            aria-label="닫기"
            disabled={pending}
          >
            ✕
          </button>
        </div>

        <input type="hidden" name="outboundId" value={row.id} />
        <input type="hidden" name="version" value={row.version} />

        <div className="rounded bg-gray-50 px-3 py-2 text-sm">
          <span className="text-gray-500">상품</span>{" "}
          <span className="font-medium">
            [{row.sku}] {row.productName}
          </span>
          <span className="ml-2 text-xs text-gray-400">(상품은 변경할 수 없습니다)</span>
        </div>

        <div className="flex gap-4">
          <label className="flex-1 text-sm">
            출고 수량 ({row.baseUnit})
            <input
              name="quantity"
              type="number"
              min={1}
              step={1}
              className={input}
              value={quantityText}
              onChange={(e) => setQuantityText(e.target.value)}
            />
            {err.quantity && <span className={errText}>{err.quantity}</span>}
          </label>
          <label className="flex-1 text-sm">
            출고단가 (원)
            <input
              name="unitPrice"
              type="number"
              min={0}
              step={1}
              className={input}
              defaultValue={row.unitPrice ?? ""}
            />
            {err.unitPrice && <span className={errText}>{err.unitPrice}</span>}
          </label>
        </div>

        {delta !== 0 && (
          <p className={`-mt-2 text-xs ${nextStock < 0 ? "text-red-600" : "text-gray-600"}`}>
            재고 {delta > 0 ? "+" : ""}
            {delta.toLocaleString()} : 현재고 {row.productStock.toLocaleString()} →{" "}
            {nextStock.toLocaleString()}
            {nextStock < 0 && " (재고 부족으로 저장할 수 없습니다)"}
          </p>
        )}

        <div className="flex gap-4">
          <label className="flex-1 text-sm">
            출고처
            <input name="customer" maxLength={100} className={input} defaultValue={row.customer ?? ""} />
            {err.customer && <span className={errText}>{err.customer}</span>}
          </label>
          <label className="flex-1 text-sm">
            출고일시
            <input
              name="shippedAt"
              type="datetime-local"
              className={input}
              defaultValue={row.shippedAtInput}
            />
            {err.shippedAt && <span className={errText}>{err.shippedAt}</span>}
          </label>
        </div>

        <label className="text-sm">
          비고
          <input name="memo" maxLength={500} className={input} defaultValue={row.memo ?? ""} />
          {err.memo && <span className={errText}>{err.memo}</span>}
        </label>

        <label className="text-sm">
          수정 사유 <span className="text-red-600">*</span>
          <input
            name="reason"
            maxLength={200}
            className={input}
            placeholder="예: 수량 오입력 (출고전표 기준 12개)"
          />
          {err.reason && <span className={errText}>{err.reason}</span>}
        </label>

        {state.status === "error" && (
          <p aria-live="polite" className="text-sm text-red-600">
            {state.message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            disabled={pending}
            className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100"
          >
            취소
          </button>
          <button
            disabled={pending}
            className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-gray-400"
          >
            {pending ? "저장 중..." : "저장"}
          </button>
        </div>

        {row.revisions.length > 0 && (
          <div className="border-t pt-3">
            <p className="mb-1 text-xs font-medium text-gray-500">
              수정 기록 ({row.revisionCount}건{row.revisionCount > row.revisions.length ? `, 최근 ${row.revisions.length}건 표시` : ""})
            </p>
            <ul className="flex flex-col gap-1 text-xs text-gray-600">
              {row.revisions.map((rv, i) => (
                <li key={i}>
                  <span className="text-gray-400">{rv.createdAtText}</span> {rv.changesText}
                  <span className="text-gray-400"> — {rv.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </dialog>
  );
}
