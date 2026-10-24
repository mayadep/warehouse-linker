"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PartnerSelect, { type PartnerOption } from "@/components/PartnerSelect";
import type { MovementBaseRow } from "@/components/MovementTable";

/** 입고·출고 수정 Server Action이 공통으로 돌려주는 상태 */
type MovementUpdateState = {
  status: "idle" | "success" | "error";
  message: string;
  errors?: Partial<Record<string, string>>;
  ts?: number;
};

/** 수정 다이얼로그가 읽는 행 (도메인 전용 필드는 래퍼에서 따로 넘김) */
export type MovementEditRow = MovementBaseRow & {
  version: number;
  baseUnit: string;
  productStock: number;
  partnerId: string | null;
};

const initialState: MovementUpdateState = { status: "idle", message: "" };
const input = "w-full";
const errText = "mt-1 block text-xs text-red-600";

/** 구체 액션 상태 타입(좁은 errors 키)도 받을 수 있도록 매개변수 이변성을 허용 */
type UpdateAction = { bivarianceHack(prev: MovementUpdateState, formData: FormData): Promise<MovementUpdateState> }["bivarianceHack"];

export default function MovementEditDialog<R extends MovementEditRow>({
  row,
  action,
  noun,
  idPrefix,
  idFieldName,
  unitPriceLabel,
  unitPriceName,
  unitPriceDefault,
  partnerLabel,
  partners,
  partnerName,
  dateName,
  dateDefault,
  /** 수량이 늘 때 재고가 늘면 1(입고), 줄면 -1(출고) */
  stockDirection,
  reasonPlaceholder,
  onClose,
  onSaved,
}: {
  row: R;
  action: UpdateAction;
  /** 화면 문구에 쓰는 업무 이름 ("입고" / "출고") */
  noun: string;
  /** DOM id 접두어 ("inbound" / "outbound") */
  idPrefix: string;
  /** 서버 액션이 읽는 행 id 필드 이름 ("inboundId" / "outboundId") */
  idFieldName: string;
  unitPriceLabel: string;
  unitPriceName: string;
  unitPriceDefault: number | null;
  /** 거래처 라벨 ("공급처" / "출고처") */
  partnerLabel: string;
  partners: PartnerOption[];
  partnerName: string | null;
  dateName: string;
  dateDefault: string;
  stockDirection: 1 | -1;
  reasonPlaceholder: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [state, formAction, pending] = useActionState(action, initialState);
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

  const err = state.status === "error" ? (state.errors ?? {}) : {};
  const newQty = /^\d+$/.test(quantityText) ? Number(quantityText) : null;
  const delta = newQty === null ? 0 : stockDirection * (newQty - row.quantity);
  const nextStock = row.productStock + delta;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => {
        if (pending) e.preventDefault(); // 저장 중에는 ESC로 닫지 않음
      }}
      className="m-auto w-full max-w-lg rounded-xl border bg-card p-0 text-card-foreground shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-[2px]"
      aria-labelledby={`${idPrefix}-edit-title`}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4 p-6">
        <div className="flex items-start justify-between">
          <h3 id={`${idPrefix}-edit-title`} className="text-lg font-bold">
            {row.status === "PENDING" ? `대기 ${noun} 수정 (재고 미반영)` : `${noun} 수정`}
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

        <input type="hidden" name={idFieldName} value={row.id} />
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
            {noun} 수량 ({row.baseUnit})
            <Input
              name="quantity"
              type="number"
              min={1}
              step={1}
              className={input}
              value={quantityText}
              onChange={(e) => setQuantityText(e.target.value)} />
            {err.quantity && <span className={errText}>{err.quantity}</span>}
          </label>
          <label className="flex-1 text-sm">
            {unitPriceLabel}
            <Input
              name={unitPriceName}
              type="number"
              min={0}
              step={1}
              className={input}
              defaultValue={unitPriceDefault ?? ""} />
            {err[unitPriceName] && <span className={errText}>{err[unitPriceName]}</span>}
          </label>
        </div>

        {delta !== 0 && row.status === "CONFIRMED" && (
          <p className={`-mt-2 text-xs ${nextStock < 0 ? "text-red-600" : "text-gray-600"}`}>
            재고 {delta > 0 ? "+" : ""}
            {delta.toLocaleString()} : 현재고 {row.productStock.toLocaleString()} →{" "}
            {nextStock.toLocaleString()}
            {nextStock < 0 && " (재고 부족으로 저장할 수 없습니다)"}
          </p>
        )}

        <div className="flex gap-4">
          <label className="flex-1 text-sm">
            {partnerLabel}
            <PartnerSelect
              options={partners}
              label={partnerLabel}
              defaultValue={row.partnerId ?? ""}
              current={row.partnerId ? { id: row.partnerId, name: partnerName ?? "" } : null}
            />
            {err.partnerId && <span className={errText}>{err.partnerId}</span>}
          </label>
          <label className="flex-1 text-sm">
            {noun}일시
            <Input
              name={dateName}
              type="datetime-local"
              className={input}
              defaultValue={dateDefault} />
            {err[dateName] && <span className={errText}>{err[dateName]}</span>}
          </label>
        </div>

        <label className="text-sm">
          비고
          <Input name="memo" maxLength={500} className={input} defaultValue={row.memo ?? ""} />
          {err.memo && <span className={errText}>{err.memo}</span>}
        </label>

        <label className="text-sm">
          수정 사유 <span className="text-red-600">*</span>
          <Input
            name="reason"
            maxLength={200}
            className={input}
            placeholder={reasonPlaceholder} />
          {err.reason && <span className={errText}>{err.reason}</span>}
        </label>

        {state.status === "error" && (
          <p aria-live="polite" className="text-sm text-red-600">
            {state.message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline"
            type="button"
            onClick={() => dialogRef.current?.close()}
            disabled={pending}>
            취소
          </Button>
          <Button type="submit"
            disabled={pending}>
            {pending ? "저장 중..." : "저장"}
          </Button>
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
