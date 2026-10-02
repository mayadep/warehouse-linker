import { connection } from "next/server";
import Forbidden from "@/components/Forbidden";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
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
function describeChanges(before: unknown, after: unknown, showPrice: boolean): string {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  return Object.keys(a)
    .filter((k) => showPrice || k !== "unitPrice")
    .map((k) => `${FIELD_LABELS[k] ?? k} ${formatValue(k, b[k])} → ${formatValue(k, a[k])}`)
    .join(", ");
}

export default async function OutboundPage() {
  await connection(); // 항상 요청 시점의 DB 데이터를 조회
  const user = await requirePageUser();
  if (!can(user.role, "outbound.create")) return <Forbidden title="출고" />;
  const showPrice = can(user.role, "price.view");
  const canManage = can(user.role, "outbound.manage");

  const [productRows, customers, recent] = await Promise.all([
    listProductsForOutbound(),
    listRecentCustomers(),
    listRecentOutbounds(20),
  ]);
  // 직원에게는 판매가(출고단가 기본값)를 내려주지 않음
  const products = productRows.map((p) => ({ ...p, price: showPrice ? p.price : null }));

  const rows: OutboundRow[] = recent.map((r) => ({
    id: r.id,
    version: r.version,
    sku: r.product.sku,
    productName: r.product.name,
    baseUnit: r.product.baseUnit,
    productStock: r.product.stock,
    quantity: r.quantity,
    unitPrice: showPrice ? r.unitPrice : null, // 직원에게는 단가를 내려주지 않음
    productPrice: showPrice ? r.product.price : null,
    status: r.status,
    createdByName: r.createdBy?.name ?? null,
    cancelReason: r.cancelReason,
    dispatchNo: r.dispatchItem?.dispatch.dispatchNo ?? null,
    customer: r.customer,
    memo: r.memo,
    shippedAtText: dateFmt.format(r.shippedAt),
    shippedAtInput: toKstDateTimeLocal(r.shippedAt),
    originalMovement: r.stockMovements[0] ?? null,
    revisionCount: r._count.revisions,
    revisions: r.revisions.map((rv) => ({
      createdAtText: dateFmt.format(rv.createdAt),
      reason: rv.reason,
      changesText: describeChanges(rv.before, rv.after, showPrice),
    })),
  }));

  return (
    <div>
      <h2 className="mb-6 text-2xl font-semibold tracking-tight">출고</h2>

      {products.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-4 text-sm">
          DB에 등록된 상품이 없습니다. 상품등록 화면에서 상품을 먼저 등록하세요.
        </p>
      ) : (
        <OutboundForm products={products} customers={customers} showPrice={showPrice} />
      )}
      {!canManage && (
        <p className="mt-2 text-xs text-muted-foreground">
          등록한 출고는 관리자가 확정하면 재고에서 차감됩니다.
        </p>
      )}

      <OutboundTable rows={rows} canManage={canManage} showPrice={showPrice} />
    </div>
  );
}
