"use client";

import { updateOutboundAction } from "@/modules/outbound/actions";
import type { OutboundRow } from "./OutboundTable";
import MovementEditDialog from "@/components/MovementEditDialog";
import type { PartnerOption } from "@/components/PartnerSelect";

export default function OutboundEditDialog({
  row,
  customers,
  onClose,
  onSaved,
}: {
  row: OutboundRow;
  customers: PartnerOption[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  return (
    <MovementEditDialog
      row={row}
      action={updateOutboundAction}
      noun="출고"
      idPrefix="outbound"
      idFieldName="outboundId"
      unitPriceLabel="출고단가 (원)"
      unitPriceName="unitPrice"
      unitPriceDefault={row.unitPrice}
      partnerLabel="출고처"
      partners={customers}
      partnerName={row.customer}
      dateName="shippedAt"
      dateDefault={row.shippedAtInput}
      stockDirection={-1}
      reasonPlaceholder="예: 수량 오입력 (출고전표 기준 12개)"
      onClose={onClose}
      onSaved={onSaved}
    />
  );
}
