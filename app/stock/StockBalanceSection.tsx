"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import {
  changeStockExpiryAction,
  moveStockAction,
  type BalanceEntry,
  type SafetyStockActionState,
} from "@/modules/stock/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: SafetyStockActionState = { status: "idle", message: "" };
const keyOf = (b: BalanceEntry) => `${b.locationId ?? ""}|${b.expiryDate ?? ""}`;

type Mode = "expiry" | "move";

/**
 * 위치·유통기한별 재고 (재고 원장 팝업)
 * - 위에서부터 자동 출고 순서 (유통기한 미상 → 빠른 순)
 * - 관리자는 칸마다 유통기한 입력·변경, 위치 이동 (일부 수량만도 가능)
 */
export default function StockBalanceSection({
  productId,
  balances,
  baseUnit,
  canEdit,
  onChanged,
}: {
  productId: string;
  balances: BalanceEntry[];
  baseUnit: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<{ key: string; mode: Mode } | null>(null);
  const [flash, setFlash] = useState("");

  return (
    <div>
      <p className="mb-1 text-xs text-gray-500">
        위치·유통기한별 재고 {balances.length}칸 · 위에서부터 자동 출고 (유통기한 미상 → 빠른 순)
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th className="left">위치</th>
            <th>유통기한</th>
            <th className="num">수량</th>
            {canEdit && <th>관리</th>}
          </tr>
        </thead>
        <tbody>
          {balances.length === 0 && (
            <tr>
              <td colSpan={canEdit ? 4 : 3} className="text-gray-400">
                재고가 없습니다.
              </td>
            </tr>
          )}
          {balances.map((b) => {
            const k = keyOf(b);
            const mode: Mode | null = editing?.key === k ? editing.mode : null;
            const close = () => setEditing(null);
            const done = (message: string) => {
              setEditing(null);
              setFlash(message);
              onChanged();
            };
            return (
              <BalanceRow
                key={k}
                b={b}
                baseUnit={baseUnit}
                canEdit={canEdit}
                mode={mode}
                onToggle={(m) => {
                  setFlash("");
                  setEditing(mode === m ? null : { key: k, mode: m });
                }}
              >
                {/* 칸·작업마다 새 폼(자체 상태) → 다른 칸의 오류 문구가 남지 않음 */}
                {mode === "expiry" && (
                  <ExpiryForm productId={productId} b={b} baseUnit={baseUnit} onCancel={close} onDone={done} />
                )}
                {mode === "move" && (
                  <MoveForm productId={productId} b={b} baseUnit={baseUnit} onCancel={close} onDone={done} />
                )}
              </BalanceRow>
            );
          })}
        </tbody>
      </table>
      {flash && (
        <p aria-live="polite" className="mt-1 text-xs text-green-700">
          {flash}
        </p>
      )}
    </div>
  );
}

function ExpiryForm({
  productId,
  b,
  baseUnit,
  onCancel,
  onDone,
}: {
  productId: string;
  b: BalanceEntry;
  baseUnit: string;
  onCancel: () => void;
  onDone: (message: string) => void;
}) {
  const [state, formAction, pending] = useActionState(changeStockExpiryAction, initialState);

  useEffect(() => {
    if (state.status === "success") onDone(state.message);
  }, [state, onDone]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="locationId" value={b.locationId ?? ""} />
      <input type="hidden" name="fromExpiry" value={b.expiryDate ?? ""} />
      <label className="flex items-center gap-2">
        유통기한
        <Input name="toExpiry" type="date" className="h-8 w-40 text-sm" defaultValue={b.expiryDate ?? ""} />
      </label>
      <label className="flex items-center gap-2">
        수량
        <Input
          name="quantity"
          type="number"
          min={1}
          max={b.quantity}
          step={1}
          defaultValue={b.quantity}
          className="h-8 w-28 text-right text-sm tabular-nums"
        />
        <span className="text-xs text-gray-500">
          / {b.quantity.toLocaleString()} {baseUnit}
        </span>
      </label>
      <Button size="sm" type="submit" disabled={pending}>
        {pending ? "저장 중..." : "저장"}
      </Button>
      <Button size="sm" variant="outline" type="button" onClick={onCancel} disabled={pending}>
        취소
      </Button>
      {state.status === "error" && (
        <span aria-live="polite" className="w-full text-xs text-red-600">
          {state.message}
        </span>
      )}
    </form>
  );
}

function MoveForm({
  productId,
  b,
  baseUnit,
  onCancel,
  onDone,
}: {
  productId: string;
  b: BalanceEntry;
  baseUnit: string;
  onCancel: () => void;
  onDone: (message: string) => void;
}) {
  const [state, formAction, pending] = useActionState(moveStockAction, initialState);

  useEffect(() => {
    if (state.status === "success") onDone(state.message);
  }, [state, onDone]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="locationId" value={b.locationId ?? ""} />
      <input type="hidden" name="expiryDate" value={b.expiryDate ?? ""} />
      <span className="font-mono text-gray-600">{b.locationCode ?? "미지정"}</span>
      <span className="text-gray-400">→</span>
      <label className="flex items-center gap-2">
        옮길 위치
        <Input name="toLocationCode" maxLength={30} placeholder="예: RF1-R01-2-3" className="h-8 w-40 font-mono text-sm uppercase" />
      </label>
      <label className="flex items-center gap-2">
        수량
        <Input
          name="quantity"
          type="number"
          min={1}
          max={b.quantity}
          step={1}
          defaultValue={b.quantity}
          className="h-8 w-28 text-right text-sm tabular-nums"
        />
        <span className="text-xs text-gray-500">
          / {b.quantity.toLocaleString()} {baseUnit}
        </span>
      </label>
      <Button size="sm" type="submit" disabled={pending}>
        {pending ? "처리 중..." : "이동"}
      </Button>
      <Button size="sm" variant="outline" type="button" onClick={onCancel} disabled={pending}>
        취소
      </Button>
      {state.status === "error" && (
        <span aria-live="polite" className="w-full text-xs text-red-600">
          {state.message}
        </span>
      )}
    </form>
  );
}

function BalanceRow({
  b,
  baseUnit,
  canEdit,
  mode,
  onToggle,
  children,
}: {
  b: BalanceEntry;
  baseUnit: string;
  canEdit: boolean;
  mode: Mode | null;
  onToggle: (m: Mode) => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <tr>
        <td className="left font-mono">{b.locationCode ?? <span className="text-gray-400">미지정</span>}</td>
        <td>{b.expiryDate ?? <span className="text-gray-400">미상</span>}</td>
        <td className="num">
          {b.quantity.toLocaleString()} {baseUnit}
        </td>
        {canEdit && (
          <td>
            <div className="flex justify-center gap-1">
              <Button size="sm" variant="outline" type="button" onClick={() => onToggle("expiry")}>
                {b.expiryDate ? "유통기한 변경" : "유통기한 입력"}
              </Button>
              <Button size="sm" variant="outline" type="button" onClick={() => onToggle("move")}>
                위치 이동
              </Button>
            </div>
          </td>
        )}
      </tr>
      {mode && (
        <tr>
          <td colSpan={4} className="left bg-gray-50">
            {children}
          </td>
        </tr>
      )}
    </>
  );
}
