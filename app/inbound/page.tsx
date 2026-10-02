import { connection } from "next/server";
import {
  listProductsForInbound,
  listRecentInbounds,
} from "@/modules/inbound/service";
import { toKstDateTimeLocal } from "@/lib/datetime";
import InboundForm from "./InboundForm";
import InboundTable, { type InboundRow } from "./InboundTable";
import Forbidden from "@/components/Forbidden";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";

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
  unitCost: "단가",
  supplier: "공급처",
  memo: "비고",
  receivedAt: "입고일시",
};

function formatValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "-";
  if (field === "receivedAt" && typeof v === "string") return dateFmt.format(new Date(v));
  if (typeof v === "number") return v.toLocaleString();
  return String(v);
}

/** 수정 기록 JSON → "수량 10 → 12, 공급처 - → A" */
function describeChanges(before: unknown, after: unknown, showPrice: boolean): string {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  return Object.keys(a)
    .filter((k) => showPrice || k !== "unitCost")
    .map((k) => `${FIELD_LABELS[k] ?? k} ${formatValue(k, b[k])} → ${formatValue(k, a[k])}`)
    .join(", ");
}

export default async function InboundPage() {
  await connection(); // 항상 요청 시점의 DB 데이터를 조회
  const user = await requirePageUser();
  if (!can(user.role, "inbound.create")) return <Forbidden title="입고" />;
  const showPrice = can(user.role, "price.view");
  const canManage = can(user.role, "inbound.manage");

  const [products, recent] = await Promise.all([
    listProductsForInbound(),
    listRecentInbounds(20),
  ]);

  const rows: InboundRow[] = recent.map((r) => ({
    id: r.id,
    version: r.version,
    sku: r.product.sku,
    productName: r.product.name,
    baseUnit: r.product.baseUnit,
    productStock: r.product.stock,
    quantity: r.quantity,
    unitCost: showPrice ? r.unitCost : null, // 직원에게는 단가를 내려주지 않음
    status: r.status,
    createdByName: r.createdBy?.name ?? null,
    cancelReason: r.cancelReason,
    supplier: r.supplier,
    memo: r.memo,
    receivedAtText: dateFmt.format(r.receivedAt),
    receivedAtInput: toKstDateTimeLocal(r.receivedAt),
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
      <h2 className="mb-4 text-2xl font-semibold tracking-tight">입고</h2>

      {products.length === 0 ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 p-4 text-sm">
          DB에 등록된 상품이 없습니다. 터미널에서 <code>npx prisma db seed</code>를
          실행해 샘플 상품을 넣어주세요.
        </p>
      ) : (
        <InboundForm products={products} showPrice={showPrice} />
      )}
      {!canManage && (
        <p className="mt-2 text-xs text-muted-foreground">
          등록한 입고는 관리자가 확정하면 재고에 반영됩니다.
        </p>
      )}

      <InboundTable rows={rows} canManage={canManage} showPrice={showPrice} />
    </div>
  );
}
