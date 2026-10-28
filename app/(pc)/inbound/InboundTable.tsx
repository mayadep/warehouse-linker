"use client";

import InboundEditDialog from "./InboundEditDialog";
import InboundReviewDialog from "./InboundReviewDialog";
import MovementTable, { type MovementRevisionView, type MovementStatusCode } from "@/components/MovementTable";
import type { PartnerOption } from "@/components/PartnerSelect";
import { PackageIcon } from "lucide-react";

/** 서버에서 직렬화해 넘기는 입고내역 1행 */
export type InboundRow = {
  id: string;
  version: number;
  sku: string;
  productName: string;
  baseUnit: string;
  productStock: number;
  quantity: number;
  unitCost: number | null; // 금액 권한이 없으면 항상 null
  status: MovementStatusCode;
  createdByName: string | null;
  cancelReason: string | null;
  partnerId: string | null;
  supplier: string | null; // 공급처 이름
  memo: string | null;
  receivedAtText: string; // 표시용
  receivedAtInput: string; // datetime-local 값 (KST)
  originalMovement: { beforeStock: number; afterStock: number } | null;
  revisionCount: number;
  revisions: MovementRevisionView[];
};

export default function InboundTable({
  rows,
  suppliers,
  canManage,
  showPrice,
}: {
  rows: InboundRow[];
  suppliers: PartnerOption[];
  canManage: boolean;
  showPrice: boolean;
}) {
  return (
    <MovementTable
      rows={rows}
      canManage={canManage}
      showPrice={showPrice}
      noun="입고"
      partnerHeader="공급처"
      stockEffectOnCancel="재고 차감"
      icon={PackageIcon}
      className="mt-6"
      getDateText={(r) => r.receivedAtText}
      getUnitPrice={(r) => r.unitCost}
      getPartner={(r) => r.supplier}
      renderEditDialog={({ row, onClose, onSaved }) => (
        <InboundEditDialog
          // version을 key에 넣으면 저장 직후 목록 갱신 시 다시 마운트되어 성공 상태를 잃음
          key={row.id}
          row={row}
          suppliers={suppliers}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
      renderReviewDialog={({ kind, row, onClose, onDone }) => (
        <InboundReviewDialog key={`${kind}-${row.id}`} kind={kind} row={row} onClose={onClose} onDone={onDone} />
      )}
    />
  );
}
