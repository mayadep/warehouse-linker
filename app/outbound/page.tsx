import { connection } from "next/server";
import {
  listProductsForOutbound,
  listRecentCustomers,
  listRecentOutbounds,
} from "@/modules/outbound/service";
import { toKstDateTimeLocal } from "@/lib/datetime";
import OutboundForm from "./OutboundForm";
import OutboundTable, { type OutboundRow } from "./OutboundTable";

const dateFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "2-digit",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const FIELD_LABELS: Record<string, string> = {
  quantity: "수량",
  unitPrice: "출고단가",
  customer: "출고처",
  memo: "비고",
  shippedAt: "출고일시",
};

function formatValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (field === "shippedAt" && typeof v === "string") return dateFmt.format(new Date(v));
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
}

/** 수정 기록 JSON → "수량 10 → 12, 출고처 - → A" */
function describeChanges(before: unknown, after: unknown): string {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  return Object.keys(a)
    .map((k) => `${FIELD_LABELS[k] ?? k} ${formatValue(k, b[k])} → ${formatValue(k, a[k])}`)
    .join(", ");
}

export default async function OutboundPage() {
  await connection(); // 항상 요청 시점의 DB 데이터를 조회

  const [products, customers, recent] = await Promise.all([
    listProductsForOutbound(),
    listRecentCustomers(),
    listRecentOutbounds(20),
  ]);

  const rows: OutboundRow[] = recent.map((r) => ({
    id: r.id,
    version: r.version,
    sku: r.product.sku,
    productName: r.product.name,
    baseUnit: r.product.baseUnit,
    productStock: r.product.stock,
    quantity: r.quantity,
    unitPrice: r.unitPrice,
    customer: r.customer,
    memo: r.memo,
    shippedAtText: dateFmt.format(r.shippedAt),
    shippedAtInput: toKstDateTimeLocal(r.shippedAt),
    originalMovement: r.stockMovements[0] ?? null,
    revisionCount: r._count.revisions,
    revisions: r.revisions.map((rv) => ({
      createdAtText: dateFmt.format(rv.createdAt),
      reason: rv.reason,
      changesText: describeChanges(rv.before, rv.after),
    })),
  }));

  return (
    <div className="max-w-4xl">
      <h2 className="mb-6 text-xl font-bold">출고</h2>

      {products.length === 0 ? (
        <p className="rounded border border-yellow-300 bg-yellow-50 p-4 text-sm">
          DB에 등록된 상품이 없습니다. 상품등록 화면에서 상품을 먼저 등록하세요.
        </p>
      ) : (
        <OutboundForm products={products} customers={customers} />
      )}

      <OutboundTable rows={rows} />
    </div>
  );
}
