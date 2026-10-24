"use client";

import { startTransition, useActionState, useEffect, type ReactNode } from "react";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MovementReviewKind } from "@/components/MovementTable";

/** 입고·출고 확정/취소/삭제 Server Action이 공통으로 돌려주는 상태 */
type MovementReviewState = {
  status: "idle" | "success" | "error";
  message: string;
};

/** 검토 다이얼로그가 읽는 행 (도메인 전용 필드는 래퍼에서 따로 넘김) */
export type MovementReviewRow = {
  id: string;
  version: number;
  sku: string;
  productName: string;
  baseUnit: string;
  quantity: number;
  productStock: number;
  createdByName: string | null;
};

const initialState: MovementReviewState = { status: "idle", message: "" };

/** 구체 액션 상태 타입도 받을 수 있도록 매개변수 이변성을 허용 */
type ReviewAction = { bivarianceHack(prev: MovementReviewState, formData: FormData): Promise<MovementReviewState> }["bivarianceHack"];

export default function MovementReviewDialog<R extends MovementReviewRow>({
  kind,
  row,
  actions,
  noun,
  idFieldName,
  stockDirection,
  partnerLabel,
  partnerName,
  dateText,
  unitPrice,
  cancelPlaceholder,
  cancelNote,
  confirmExtra,
  cancelExtra,
  onClose,
  onDone,
}: {
  kind: MovementReviewKind;
  row: R;
  actions: Record<MovementReviewKind, ReviewAction>;
  /** 화면 문구에 쓰는 업무 이름 ("입고" / "출고") */
  noun: string;
  /** 서버 액션이 읽는 행 id 필드 이름 ("inboundId" / "outboundId") */
  idFieldName: string;
  /** 확정 시 재고가 늘면 1(입고), 줄면 -1(출고) */
  stockDirection: 1 | -1;
  partnerLabel: string;
  partnerName: string | null;
  dateText: string;
  /** 확정 시 입력하는 단가 */
  unitPrice: { label: string; name: string; defaultValue: number | null; hint?: string };
  cancelPlaceholder: string;
  /** 취소 안내 문구 */
  cancelNote: ReactNode;
  /** 확정 시 단가 입력 앞에 끼워 넣을 입력 (출고 위치 선택 등) */
  confirmExtra?: ReactNode;
  /** 취소 시 안내 문구 앞에 끼워 넣을 경고 (배차 안내 등) */
  cancelExtra?: ReactNode;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const title: Record<MovementReviewKind, string> = {
    confirm: `${noun} 확정`,
    cancel: `${noun} 취소`,
    delete: `대기 ${noun} 삭제`,
  };

  const [state, action, pending] = useActionState(actions[kind], initialState);
  useEffect(() => {
    if (state.status === "success") onDone(state.message);
  }, [state, onDone]);

  // 확정은 재고를 stockDirection 쪽으로, 취소는 그 반대로 움직임 (삭제는 재고 무관)
  const signed = kind === "confirm" ? stockDirection : kind === "cancel" ? -stockDirection : 0;
  const nextStock = signed === 0 ? null : row.productStock + signed * row.quantity;

  return (
    <Modal title={title[kind]} onClose={onClose} closeDisabled={pending}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          const fd = new FormData(e.currentTarget);
          startTransition(() => action(fd));
        }}
      >
        <input type="hidden" name={idFieldName} value={row.id} />
        <input type="hidden" name="version" value={row.version} />

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-muted px-3 py-2 text-sm">
          <dt className="text-muted-foreground">상품</dt>
          <dd>
            [{row.sku}] <span className="font-medium">{row.productName}</span>
          </dd>
          <dt className="text-muted-foreground">수량</dt>
          <dd className="tabular-nums">
            {row.quantity.toLocaleString()} {row.baseUnit}
          </dd>
          <dt className="text-muted-foreground">{partnerLabel}</dt>
          <dd>{partnerName ?? "-"}</dd>
          <dt className="text-muted-foreground">{noun}일시</dt>
          <dd className="tabular-nums">{dateText}</dd>
          {row.createdByName && (
            <>
              <dt className="text-muted-foreground">등록자</dt>
              <dd>{row.createdByName}</dd>
            </>
          )}
        </dl>

        {kind === "confirm" && confirmExtra}
        {kind === "confirm" ? (
          <label className="text-sm">
            {unitPrice.label}
            <Input
              name={unitPrice.name}
              type="number"
              min={0}
              step={1}
              className="w-full text-right tabular-nums"
              defaultValue={unitPrice.defaultValue ?? ""}
              autoFocus
            />
            {unitPrice.hint && <span className="mt-1 block text-xs text-muted-foreground">{unitPrice.hint}</span>}
          </label>
        ) : (
          <label className="text-sm">
            {kind === "cancel" ? "취소 사유" : "삭제 사유"} <span className="text-red-600">*</span>
            <Input
              name="reason"
              maxLength={200}
              className="w-full"
              placeholder={kind === "cancel" ? cancelPlaceholder : "예: 중복 등록"}
              autoFocus
            />
          </label>
        )}

        {nextStock !== null && (
          <p className={`-mt-2 text-xs ${nextStock < 0 ? "text-red-600" : "text-muted-foreground"}`}>
            재고 {signed > 0 ? "+" : "-"}
            {row.quantity.toLocaleString()} : 현재고 {row.productStock.toLocaleString()} → {nextStock.toLocaleString()}
            {nextStock < 0 && ` (재고가 부족해 ${kind === "confirm" ? "확정" : "취소"}할 수 없습니다)`}
          </p>
        )}
        {kind === "cancel" && cancelExtra}
        {kind === "cancel" && <p className="-mt-2 text-xs text-muted-foreground">{cancelNote}</p>}
        {kind === "delete" && (
          <p className="-mt-2 text-xs text-muted-foreground">재고에 반영되지 않은 대기 건이라 삭제해도 재고는 그대로입니다.</p>
        )}

        {state.status === "error" && (
          <p aria-live="polite" className="text-sm text-red-600">
            {state.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose} disabled={pending}>
            닫기
          </Button>
          <Button type="submit" variant={kind === "confirm" ? "default" : "destructive"} disabled={pending}>
            {pending ? "처리 중..." : title[kind]}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
