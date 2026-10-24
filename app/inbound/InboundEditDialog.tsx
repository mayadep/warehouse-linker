"use client";

import { updateInboundAction } from "@/modules/inbound/actions";
import type { InboundRow } from "./InboundTable";
import MovementEditDialog from "@/components/MovementEditDialog";
import type { PartnerOption } from "@/components/PartnerSelect";

export default function InboundEditDialog({
  row,
  suppliers,
  onClose,
  onSaved,
}: {
  row: InboundRow;
  suppliers: PartnerOption[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  return (
    <MovementEditDialog
      row={row}
      action={updateInboundAction}
      noun="입고"
      idPrefix="inbound"
      idFieldName="inboundId"
      unitPriceLabel="입고 단가 (원)"
      unitPriceName="unitCost"
      unitPriceDefault={row.unitCost}
      partnerLabel="공급처"
      partners={suppliers}
      partnerName={row.supplier}
      dateName="receivedAt"
      dateDefault={row.receivedAtInput}
      stockDirection={1}
      reasonPlaceholder="예: 수량 오입력 (거래명세서 기준 12개)"
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
