"use client";

import { cancelInboundAction, confirmInboundAction, deleteInboundAction } from "@/modules/inbound/actions";
import type { InboundRow } from "./InboundTable";
import MovementReviewDialog from "@/components/MovementReviewDialog";
import type { MovementReviewKind } from "@/components/MovementTable";

const ACTIONS = {
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
  kind: MovementReviewKind;
  row: InboundRow;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  return (
    <MovementReviewDialog
      kind={kind}
      row={row}
      actions={ACTIONS}
      noun="입고"
      idFieldName="inboundId"
      stockDirection={1}
      partnerLabel="공급처"
      partnerName={row.supplier}
      dateText={row.receivedAtText}
      unitPrice={{ label: "입고 단가 (원, 선택)", name: "unitCost", defaultValue: row.unitCost }}
      cancelPlaceholder="예: 반품 처리 (불량 입고)"
      cancelNote="입고 기록은 지워지지 않고 '취소'로 남으며, 재고 이력에 입고취소가 기록됩니다."
      onClose={onClose}
      onDone={onDone}
    />
  );
}
