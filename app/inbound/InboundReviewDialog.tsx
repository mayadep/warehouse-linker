"use client";

import { startTransition, useActionState, useEffect } from "react";
import {
  cancelInboundAction,
  confirmInboundAction,
  deleteInboundAction,
  type InboundReviewState,
} from "@/modules/inbound/actions";
import type { InboundRow } from "./InboundTable";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type InboundReviewKind = "confirm" | "cancel" | "delete";

const initial: InboundReviewState = { status: "idle", message: "" };

const TITLE: Record<InboundReviewKind, string> = {
  confirm: "입고 확정",
  cancel: "입고 취소",
  delete: "대기 입고 삭제",
};

const ACTION = {
  confirm: confirmInboundAction,
  cancel: cancelInboundAction,
  delete: deleteInboundAction,
};

/** 관리자: 대기 입고 확정 / 확정 입고 취소 / 대기 입고 삭제 */
export default function InboundReviewDialog({
  kind,
  row,
  onClose,
  onDone,
}: {
  kind: InboundReviewKind;
  row: InboundRow;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [state, action, pending] = useActionState(ACTION[kind], initial);
  useEffect(() => {
    if (state.status === "success") onDone(state.message);
  }, [state, onDone]);

  const nextStock =
    kind === "confirm" ? row.productStock + row.quantity : kind === "cancel" ? row.productStock - row.quantity : null;

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
        <input type="hidden" name="inboundId" value={row.id} />
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
          <dt className="text-muted-foreground">공급처</dt>
          <dd>{row.supplier ?? "-"}</dd>
          <dt className="text-muted-foreground">입고일시</dt>
          <dd className="tabular-nums">{row.receivedAtText}</dd>
          {row.createdByName && (
            <>
              <dt className="text-muted-foreground">등록자</dt>
              <dd>{row.createdByName}</dd>
            </>
          )}
        </dl>

        {kind === "confirm" ? (
          <label className="text-sm">
            입고 단가 (원, 선택)
            <Input
              name="unitCost"
              type="number"
              min={0}
              step={1}
              className="w-full text-right tabular-nums"
              defaultValue={row.unitCost ?? ""}
              autoFocus
            />
          </label>
        ) : (
          <label className="text-sm">
            {kind === "cancel" ? "취소 사유" : "삭제 사유"} <span className="text-red-600">*</span>
            <Input
              name="reason"
              maxLength={200}
              className="w-full"
              placeholder={kind === "cancel" ? "예: 반품 처리 (불량 입고)" : "예: 중복 등록"}
              autoFocus
            />
          </label>
        )}

        {nextStock !== null && (
          <p className={`-mt-2 text-xs ${nextStock < 0 ? "text-red-600" : "text-muted-foreground"}`}>
            재고 {kind === "confirm" ? "+" : "-"}
            {row.quantity.toLocaleString()} : 현재고 {row.productStock.toLocaleString()} → {nextStock.toLocaleString()}
            {nextStock < 0 && " (재고가 부족해 취소할 수 없습니다)"}
          </p>
        )}
        {kind === "cancel" && (
          <p className="-mt-2 text-xs text-muted-foreground">
            입고 기록은 지워지지 않고 &apos;취소&apos;로 남으며, 재고 이력에 입고취소가 기록됩니다.
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
