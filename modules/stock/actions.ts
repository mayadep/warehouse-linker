"use server";

import { revalidatePath } from "next/cache";
import { INT_RE, UUID_RE, text } from "@/lib/form";
import { prisma } from "@/lib/prisma";
import { getStockLedger } from "./queries";
import { getLocationHistory } from "@/modules/warehouse/location";

const MAX_SAFETY_STOCK = 1_000_000;

export type SafetyStockActionState = {
  status: "idle" | "success" | "error";
  message: string;
  ts?: number;
};

/** 안전재고 변경 (재고 수량 자체는 변경하지 않음) */
export async function updateSafetyStockAction(
  _prev: SafetyStockActionState,
  fd: FormData
): Promise<SafetyStockActionState> {
  // TODO: 인증/권한 체계 도입 시 여기서 권한 확인 (UI에만 의존하지 않음)
  const productId = text(fd, "productId");
  const raw = text(fd, "safetyStock").replaceAll(",", "");
  if (!UUID_RE.test(productId)) return { status: "error", message: "잘못된 상품입니다.", ts: Date.now() };
  if (!INT_RE.test(raw)) return { status: "error", message: "안전재고는 0 이상의 정수여야 합니다.", ts: Date.now() };
  const safetyStock = Number(raw);
  if (safetyStock > MAX_SAFETY_STOCK)
    return { status: "error", message: `안전재고는 ${MAX_SAFETY_STOCK.toLocaleString()} 이하여야 합니다.`, ts: Date.now() };

  const r = await prisma.product.updateMany({ where: { id: productId }, data: { safetyStock } });
  if (r.count === 0) return { status: "error", message: "존재하지 않는 상품입니다.", ts: Date.now() };

  revalidatePath("/stock");
  return { status: "success", message: `안전재고를 ${safetyStock.toLocaleString()}(으)로 저장했습니다.`, ts: Date.now() };
}

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const TYPE_LABELS: Record<string, string> = {
  INBOUND: "입고",
  OUTBOUND: "출고",
  ADJUST: "재고조정",
  INBOUND_CORRECTION: "입고정정",
  OUTBOUND_CORRECTION: "출고정정",
};

export type LedgerEntry = {
  id: string;
  createdAtText: string; // 처리일시
  tradeAtText: string | null; // 입고/출고일시
  type: string;
  typeLabel: string;
  quantity: number;
  beforeStock: number;
  afterStock: number;
  partner: string | null; // 공급처/출고처
  note: string | null; // 수정 사유 또는 비고
};

export type LocationHistoryEntry = {
  id: string;
  createdAtText: string;
  fromCode: string | null;
  toCode: string | null;
  swappedWithSku: string | null;
  reason: string | null;
};

export type LedgerResult =
  | { ok: true; total: number; entries: LedgerEntry[]; locationHistory: LocationHistoryEntry[] }
  | { ok: false; message: string };

/** 재고원장 조회 (팝업에서 호출) */
export async function getStockLedgerAction(productId: string): Promise<LedgerResult> {
  if (typeof productId !== "string" || !UUID_RE.test(productId)) {
    return { ok: false, message: "잘못된 상품입니다." };
  }
  const [data, locHist] = await Promise.all([getStockLedger(productId, 50), getLocationHistory(productId, 5)]);
  if (!data) return { ok: false, message: "존재하지 않는 상품입니다." };

  return {
    ok: true,
    total: data.total,
    locationHistory: locHist.map((h) => ({
      id: h.id,
      createdAtText: dateFmt.format(h.createdAt),
      fromCode: h.fromCode,
      toCode: h.toCode,
      swappedWithSku: h.swappedWithSku,
      reason: h.reason,
    })),
    entries: data.movements.map((m) => {
      const tradeAt = m.inbound?.receivedAt ?? m.outbound?.shippedAt ?? null;
      const isCorrection = m.type === "INBOUND_CORRECTION" || m.type === "OUTBOUND_CORRECTION";
      const reason = m.inboundRevision?.reason ?? m.outboundRevision?.reason ?? null;
      return {
        id: m.id,
        createdAtText: dateFmt.format(m.createdAt),
        tradeAtText: tradeAt ? dateFmt.format(tradeAt) : null,
        type: m.type,
        typeLabel: TYPE_LABELS[m.type] ?? m.type,
        quantity: m.quantity,
        beforeStock: m.beforeStock,
        afterStock: m.afterStock,
        partner: m.inbound?.supplier ?? m.outbound?.customer ?? null,
        note: isCorrection ? reason : (m.inbound?.memo ?? m.outbound?.memo ?? null),
      };
    }),
  };
}
