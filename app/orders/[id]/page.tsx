import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { UUID_RE } from "@/lib/form";
import { toKstDate } from "@/lib/datetime";
import {
  ORDER_DUE_LABELS,
  ORDER_PARTNER_LABELS,
  ORDER_PROCESS_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_STYLE,
  ORDER_TYPE_LABELS,
  type OrderStatusCode,
  type OrderTypeCode,
} from "@/modules/order/codes";
import { getOrderDetail } from "@/modules/order/service";
import OrderActions, { type ProcessLine } from "./OrderActions";

const dtFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const o = await getOrderDetail(id);
  if (!o) notFound();

  const type = o.type as OrderTypeCode;
  const status = o.status as OrderStatusCode;
  const label = ORDER_PROCESS_LABELS[type];
  const qty = o.lines.reduce((s, l) => s + l.quantity, 0);
  const done = o.lines.reduce((s, l) => s + l.processedQty, 0);
  const amount = o.lines.reduce((s, l) => s + l.quantity * (l.unitPrice ?? 0), 0);
  const processLines: ProcessLine[] = o.lines.map((l) => ({
    id: l.id,
    sku: l.product.sku,
    name: l.product.name,
    baseUnit: l.product.baseUnit,
    remaining: l.quantity - l.processedQty,
    stock: l.product.stock,
  }));

  return (
    <div className="max-w-5xl">
      <Link href={`/orders?type=${type === "SALES" ? "sales" : "purchase"}`} className="text-sm text-gray-500 hover:underline">
        ‹ {ORDER_TYPE_LABELS[type]} 목록
      </Link>
      <div className="mt-2 mb-6 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">
              {ORDER_TYPE_LABELS[type]} <span className="font-mono">{o.orderNo}</span>
            </h2>
            <span className={`rounded px-1.5 py-0.5 text-xs ${ORDER_STATUS_STYLE[status]}`}>{ORDER_STATUS_LABELS[status]}</span>
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-gray-500">{ORDER_PARTNER_LABELS[type]}</dt>
            <dd className="font-medium">{o.partner}</dd>
            <dt className="text-gray-500">{ORDER_DUE_LABELS[type]}</dt>
            <dd>{o.dueDate ? toKstDate(o.dueDate) : "-"}</dd>
            <dt className="text-gray-500">등록일</dt>
            <dd>{toKstDate(o.createdAt)}</dd>
            <dt className="text-gray-500">{label} 진행</dt>
            <dd>
              {done.toLocaleString()} / {qty.toLocaleString()} ({qty ? Math.round((done / qty) * 100) : 0}%)
              {amount > 0 && <span className="ml-3 text-gray-500">주문 금액 {amount.toLocaleString()}원</span>}
            </dd>
            {o.memo && (
              <>
                <dt className="text-gray-500">비고</dt>
                <dd>{o.memo}</dd>
              </>
            )}
          </dl>
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

      <table className="w-full text-center text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">#</th>
            <th>코드</th>
            <th>품명</th>
            <th>주문</th>
            <th>{label}</th>
            <th>남은 수량</th>
            <th>단가</th>
            <th>금액</th>
            {type === "SALES" && <th>현재고</th>}
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
              <tr key={l.id} className="border-b align-top">
                <td className="py-2 text-gray-400">{l.seq}</td>
                <td className="font-mono text-xs">{l.product.sku}</td>
                <td>{l.product.name}</td>
                <td>{l.quantity.toLocaleString()}</td>
                <td className={l.processedQty >= l.quantity ? "text-green-700" : ""}>{l.processedQty.toLocaleString()}</td>
                <td className={remaining > 0 ? "font-medium text-amber-700" : "text-gray-400"}>{remaining.toLocaleString()}</td>
                <td>{l.unitPrice == null ? "-" : l.unitPrice.toLocaleString()}</td>
                <td>{l.unitPrice == null ? "-" : (l.unitPrice * l.quantity).toLocaleString()}</td>
                {type === "SALES" && <td className={l.product.stock < remaining ? "text-red-600" : ""}>{l.product.stock.toLocaleString()}</td>}
                <td className="text-xs text-gray-500">
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
      <p className="mt-3 text-xs text-gray-400">
        {label} 처리한 건은 {type === "PURCHASE" ? "입고" : "출고"} 화면 내역에도 나타나며, 거기서 수량을 고치면 이 주문의 {label} 수량도 함께 바뀝니다.
      </p>
    </div>
  );
}
