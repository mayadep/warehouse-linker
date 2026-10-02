"use client";

import { startTransition, useActionState, useEffect } from "react";
import {
  cancelOutboundAction,
  confirmOutboundAction,
  deleteOutboundAction,
  type OutboundReviewState,
} from "@/modules/outbound/actions";
import type { OutboundRow } from "./OutboundTable";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type OutboundReviewKind = "confirm" | "cancel" | "delete";

const initial: OutboundReviewState = { status: "idle", message: "" };

const TITLE: Record<OutboundReviewKind, string> = {
  confirm: "출고 확정",
  cancel: "출고 취소",
  delete: "대기 출고 삭제",
};

const ACTION = {
  confirm: confirmOutboundAction,
  cancel: cancelOutboundAction,
  delete: deleteOutboundAction,
};

/** 관리자: 대기 출고 확정 / 확정 출고 취소 / 대기 출고 삭제 */
export default function OutboundReviewDialog({
  kind,
  row,
  onClose,
  onDone,
}: {
  kind: OutboundReviewKind;
  row: OutboundRow;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(ACTION[kind], initial);
  useEffect(() => {
    if (state.status === "success") onDone(state.message);
  }, [state, onDone]);

  const nextStock =
    kind === "confirm" ? row.productStock - row.quantity : kind === "cancel" ? row.productStock + row.quantity : null;

  return (
    <Modal title={TITLE[kind]} onClose={onClose} closeDisabled={pending}>
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
        <input type="hidden" name="outboundId" value={row.id} />
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
          <dt className="text-muted-foreground">출고처</dt>
          <dd>{row.customer ?? "-"}</dd>
          <dt className="text-muted-foreground">출고일시</dt>
          <dd className="tabular-nums">{row.shippedAtText}</dd>
          {row.createdByName && (
            <>
              <dt className="text-muted-foreground">등록자</dt>
              <dd>{row.createdByName}</dd>
            </>
          )}
        </dl>

        {kind === "confirm" ? (
          <label className="text-sm">
            출고단가 (원, 선택)
            <Input
              name="unitPrice"
              type="number"
              min={0}
              step={1}
              className="w-full text-right tabular-nums"
              defaultValue={row.unitPrice ?? row.productPrice ?? ""}
              autoFocus
            />
            <span className="mt-1 block text-xs text-muted-foreground">기본값은 상품 판매가입니다.</span>
          </label>
        ) : (
          <label className="text-sm">
            {kind === "cancel" ? "취소 사유" : "삭제 사유"} <span className="text-red-600">*</span>
            <Input
              name="reason"
              maxLength={200}
              className="w-full"
              placeholder={kind === "cancel" ? "예: 거래처 주문 취소" : "예: 중복 등록"}
              autoFocus
            />
          </label>
        )}

        {nextStock !== null && (
          <p className={`-mt-2 text-xs ${nextStock < 0 ? "text-red-600" : "text-muted-foreground"}`}>
            재고 {kind === "confirm" ? "-" : "+"}
            {row.quantity.toLocaleString()} : 현재고 {row.productStock.toLocaleString()} → {nextStock.toLocaleString()}
            {nextStock < 0 && " (재고가 부족해 확정할 수 없습니다)"}
          </p>
        )}
        {kind === "cancel" && row.dispatchNo && (
          <p className="-mt-2 text-xs text-red-600">
            배차 {row.dispatchNo}에 실린 출고입니다. 배차관리에서 먼저 빼거나 배차를 취소하세요.
          </p>
        )}
        {kind === "cancel" && (
          <p className="-mt-2 text-xs text-muted-foreground">
            출고 기록은 지워지지 않고 &apos;취소&apos;로 남으며, 재고 이력에 출고취소(재고 복원)가 기록됩니다.
          </p>
        )}
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
            {pending ? "처리 중..." : TITLE[kind]}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
