"use client";

import { cancelOutboundAction, confirmOutboundAction, deleteOutboundAction } from "@/modules/outbound/actions";
import type { OutboundRow } from "./OutboundTable";
import PickSelect from "./PickSelect";
import MovementReviewDialog from "@/components/MovementReviewDialog";
import type { MovementReviewKind } from "@/components/MovementTable";

const ACTIONS = {
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
  kind: MovementReviewKind;
  row: OutboundRow;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <MovementReviewDialog
      kind={kind}
      row={row}
      actions={ACTIONS}
      noun="출고"
      idFieldName="outboundId"
      stockDirection={-1}
      partnerLabel="출고처"
      partnerName={row.customer}
      dateText={row.shippedAtText}
      unitPrice={{
        label: "출고단가 (원, 선택)",
        name: "unitPrice",
        defaultValue: row.unitPrice ?? row.productPrice,
        hint: "기본값은 상품 판매가입니다.",
      }}
      cancelPlaceholder="예: 거래처 주문 취소"
      cancelNote="출고 기록은 지워지지 않고 '취소'로 남으며, 재고 이력에 출고취소(재고 복원)가 기록됩니다."
      confirmExtra={
        <label className="text-sm">
          출고 위치
          <PickSelect
            productId={row.productId}
            quantity={row.quantity}
            baseUnit={row.baseUnit}
            defaultValue={row.pickValue}
            defaultLabel={row.pickLabel ?? undefined}
          />
        </label>
      }
      cancelExtra={
        row.dispatchNo && (
          <p className="-mt-2 text-xs text-red-600">
            배차 {row.dispatchNo}에 실린 출고입니다. 배차관리에서 먼저 빼거나 배차를 취소하세요.
          </p>
        )
      }
      onClose={onClose}
      onDone={onDone}
    />
  );
}
