// 수발주 표시용 상수 (서버/클라이언트 공용)

export type OrderTypeCode = "PURCHASE" | "SALES";
export type OrderStatusCode = "OPEN" | "PARTIAL" | "DONE" | "CLOSED" | "CANCELLED";

export const ORDER_TYPE_LABELS: Record<OrderTypeCode, string> = { PURCHASE: "발주", SALES: "수주" };
export const ORDER_PARTNER_LABELS: Record<OrderTypeCode, string> = { PURCHASE: "공급처", SALES: "거래처" };
export const ORDER_PROCESS_LABELS: Record<OrderTypeCode, string> = { PURCHASE: "입고", SALES: "출고" };
export const ORDER_DUE_LABELS: Record<OrderTypeCode, string> = { PURCHASE: "입고 예정일", SALES: "납기일" };
export const ORDER_PREFIX: Record<OrderTypeCode, string> = { PURCHASE: "PO", SALES: "SO" };

export const ORDER_STATUS_LABELS: Record<OrderStatusCode, string> = {
  OPEN: "진행 전",
  PARTIAL: "일부 처리",
  DONE: "완료",
  CLOSED: "잔량 종결",
  CANCELLED: "취소",
};

export const ORDER_STATUS_STYLE: Record<OrderStatusCode, string> = {
  OPEN: "bg-gray-100 text-gray-700",
  PARTIAL: "bg-amber-100 text-amber-800",
  DONE: "bg-green-100 text-green-800",
  CLOSED: "bg-slate-200 text-slate-700",
  CANCELLED: "bg-red-100 text-red-700",
};

export const ORDER_LIMITS = {
  maxLines: 50,
  maxQuantity: 1_000_000,
  maxUnitPrice: 100_000_000,
  maxPartnerLength: 100,
  maxMemoLength: 500,
} as const;
