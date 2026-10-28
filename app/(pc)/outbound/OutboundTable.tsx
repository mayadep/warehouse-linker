"use client";

import OutboundEditDialog from "./OutboundEditDialog";
import OutboundReviewDialog from "./OutboundReviewDialog";
import MovementTable, { type MovementRevisionView, type MovementStatusCode } from "@/components/MovementTable";
import type { PartnerOption } from "@/components/PartnerSelect";
import { TruckIcon } from "lucide-react";

/** 서버에서 직렬화해 넘기는 출고내역 1행 */
export type OutboundRow = {
  id: string;
  version: number;
  productId: string;
  /** 출고 위치 지정 ("위치id|유통기한", "" = 자동) · 표시용 이름 */
  pickValue: string;
  pickLabel: string | null;
  sku: string;
  productName: string;
  baseUnit: string;
  productStock: number;
  productPrice: number | null; // 확정 시 출고단가 기본값 (금액 권한이 없으면 null)
  quantity: number;
  unitPrice: number | null; // 금액 권한이 없으면 항상 null
  status: MovementStatusCode;
  createdByName: string | null;
  cancelReason: string | null;
  dispatchNo: string | null; // 배차된 경우 배차번호
  partnerId: string | null;
  customer: string | null; // 출고처 이름
  memo: string | null;
  shippedAtText: string; // 표시용
  shippedAtInput: string; // datetime-local 값 (KST)
  originalMovement: { beforeStock: number; afterStock: number } | null;
  revisionCount: number;
  revisions: MovementRevisionView[];
};

export default function OutboundTable({
  rows,
  customers,
  canManage,
  showPrice,
}: {
  rows: OutboundRow[];
  customers: PartnerOption[];
  canManage: boolean;
  showPrice: boolean;
}) {
  return (
    <MovementTable
      rows={rows}
      canManage={canManage}
      showPrice={showPrice}
      noun="출고"
      partnerHeader="출고처"
      stockEffectOnCancel="재고 복원"
      icon={TruckIcon}
      className="mt-10"
      getDateText={(r) => r.shippedAtText}
      getUnitPrice={(r) => r.unitPrice}
      getPartner={(r) => r.customer}
      renderStatusExtra={(r) =>
        r.dispatchNo && (
          <span className="ml-1 text-xs text-muted-foreground" title={`배차 ${r.dispatchNo}`}>
            배차
          </span>
        )
      }
      renderEditDialog={({ row, onClose, onSaved }) => (
        <OutboundEditDialog
          // version을 key에 넣으면 저장 직후 목록 갱신 시 다시 마운트되어 성공 상태를 잃음
          key={row.id}
          row={row}
          customers={customers}
          onClose={onClose}
          onSaved={onSaved}
        />
      )}
      renderReviewDialog={({ kind, row, onClose, onDone }) => (
        <OutboundReviewDialog key={`${kind}-${row.id}`} kind={kind} row={row} onClose={onClose} onDone={onDone} />
      )}
    />
  );
}
