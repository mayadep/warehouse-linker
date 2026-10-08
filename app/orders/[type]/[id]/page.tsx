import Link from "next/link";
import Forbidden from "@/components/Forbidden";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { UUID_RE } from "@/lib/form";
import { toKstDate } from "@/lib/datetime";
import {
  ORDER_DUE_LABELS,
  ORDER_PARTNER_LABELS,
  ORDER_PROCESS_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_TONE,
  ORDER_TYPE_LABELS,
  type OrderStatusCode,
  type OrderTypeCode,
} from "@/modules/order/codes";
import { getOrderDetail } from "@/modules/order/service";
import OrderActions, { type ProcessLine } from "./OrderActions";
import { ChevronLeftIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";

const dtFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export default async function OrderDetailPage({ params }: { params: Promise<{ type: string; id: string }> }) {
  await connection();
  const user = await requirePageUser();
  if (!can(user.role, "admin")) return <Forbidden title="발주·수주" />;
  const { type: slug, id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const o = await getOrderDetail(id);
  if (!o) notFound();

  const type = o.type as OrderTypeCode;
  if (slug !== (type === "SALES" ? "sales" : "purchase")) notFound(); // 주소의 종류와 실제 주문 종류가 다르면 거부
  const status = o.status as OrderStatusCode;
  const label = ORDER_PROCESS_LABELS[type];
  const qty = o.lines.reduce((s, l) => s + l.quantity, 0);
  const done = o.lines.reduce((s, l) => s + l.processedQty, 0);
  const percent = qty ? Math.min(100, Math.round((done / qty) * 100)) : 0;
  const amount = o.lines.reduce((s, l) => s + l.quantity * (l.unitPrice ?? 0), 0);
  const processLines: ProcessLine[] = o.lines.map((l) => ({
    id: l.id,
    sku: l.product.sku,
    name: l.product.name,
    baseUnit: l.product.baseUnit,
    remaining: l.quantity - l.processedQty,
    stock: l.product.stock,
    locationCode: l.product.location?.code ?? null,
  }));

  return (
    <div>
      <Link href={`/orders/${slug}`} className="inline-flex items-center gap-0.5 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" />
        {ORDER_TYPE_LABELS[type]} 목록
      </Link>
      <div className="mt-2 mb-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-semibold tracking-tight">
            {ORDER_TYPE_LABELS[type]} <span className="font-mono">{o.orderNo}</span>
          </h2>
          <Badge variant={ORDER_STATUS_TONE[status]}>{ORDER_STATUS_LABELS[status]}</Badge>
        </div>
        <OrderActions
          orderId={o.id}
          version={o.version}
          type={type}
          status={status}
          hasProcessed={done > 0}
          lines={processLines}
        />
      </div>

      <div className="mb-5 rounded-xl border bg-card p-4 shadow-card">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm md:grid-cols-4">
          <div>
            <dt className="text-xs font-medium text-muted-foreground">{ORDER_PARTNER_LABELS[type]}</dt>
            <dd className="mt-1 font-medium">{o.partner.name}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">{ORDER_DUE_LABELS[type]}</dt>
            <dd className="mt-1">{o.dueDate ? toKstDate(o.dueDate) : "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">등록일</dt>
            <dd className="mt-1">{toKstDate(o.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-muted-foreground">주문 금액</dt>
            <dd className="mt-1 tabular-nums">{amount > 0 ? `${amount.toLocaleString()}원` : "-"}</dd>
          </div>
          {o.memo && (
            <div className="col-span-2 md:col-span-4">
              <dt className="text-xs font-medium text-muted-foreground">비고</dt>
              <dd className="mt-1">{o.memo}</dd>
            </div>
          )}
        </dl>
        <div className="mt-4 border-t pt-4">
          <div className="mb-1.5 flex items-baseline justify-between text-sm">
            <span className="text-xs font-medium text-muted-foreground">{label} 진행</span>
            <span className="tabular-nums">
              <b className="font-semibold">{done.toLocaleString()}</b> / {qty.toLocaleString()}
              <span className="ml-1.5 text-muted-foreground">({percent}%)</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
            <div className={`h-full rounded-full ${percent >= 100 ? "bg-emerald-500" : "bg-primary"}`} style={{ width: `${percent}%` }} />
          </div>
        </div>
      </div>
      <div className="max-h-[70vh] overflow-auto rounded-lg border">
<table className="data-table">
        <thead>
          <tr>
            <th>#</th>
            <th className="left">코드</th>
            <th className="left">품명</th>
            <th className="num">주문</th>
            <th className="num">{label}</th>
            <th className="num">남은 수량</th>
            <th className="num">단가</th>
            <th className="num">금액</th>
            {type === "SALES" && <th className="num">현재고</th>}
            <th>{label} 이력</th>
          </tr>
        </thead>
        <tbody>
          {o.lines.map((l) => {
            const remaining = l.quantity - l.processedQty;
            const history = type === "PURCHASE"
              ? l.inbounds.map((h) => ({ id: h.id, q: h.quantity, at: h.receivedAt }))
              : l.outbounds.map((h) => ({ id: h.id, q: h.quantity, at: h.shippedAt }));
            return (
              <tr key={l.id}>
                <td className="text-muted-foreground">{l.seq}</td>
                <td className="left font-mono text-xs text-muted-foreground">{l.product.sku}</td>
                <td className="left">{l.product.name}</td>
                <td className="num">{l.quantity.toLocaleString()}</td>
                <td className={`num ${l.processedQty >= l.quantity ? "text-emerald-700" : ""}`}>{l.processedQty.toLocaleString()}</td>
                <td className={`num ${remaining > 0 ? "font-medium text-amber-700" : "text-gray-400"}`}>{remaining.toLocaleString()}</td>
                <td className="num">{l.unitPrice == null ? "-" : l.unitPrice.toLocaleString()}</td>
                <td className="num">{l.unitPrice == null ? "-" : (l.unitPrice * l.quantity).toLocaleString()}</td>
                {type === "SALES" && <td className={`num ${l.product.stock < remaining ? "text-red-600" : ""}`}>{l.product.stock.toLocaleString()}</td>}
                <td className="text-xs text-muted-foreground">
                  {history.length === 0
                    ? "-"
                    : history.map((h) => (
                        <div key={h.id}>
                          {dtFmt.format(h.at)} · {h.q.toLocaleString()}
                        </div>
                      ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
</div>
      <p className="mt-3 text-xs text-muted-foreground">
        {label} 처리한 건은 {type === "PURCHASE" ? "입고" : "출고"} 화면 내역에도 나타나며, 거기서 수량을 고치면 이 주문의 {label} 수량도 함께 바뀝니다.
      </p>
    </div>
  );
}
