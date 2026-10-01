import Link from "next/link";
import { connection } from "next/server";
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
import { listOrders, listProductsForOrder, listRecentPartners, ORDER_PAGE_SIZE } from "@/modules/order/service";
import OrderCreateButton from "./OrderCreateButton";

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
const STATUSES = ["active", "all", "OPEN", "PARTIAL", "DONE", "CLOSED", "CANCELLED"];

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SP> }) {
  await connection();
  const sp = await searchParams;
  const type: OrderTypeCode = first(sp.type) === "sales" ? "SALES" : "PURCHASE";
  const status = STATUSES.includes(first(sp.status)) ? first(sp.status) : "active";
  const q = first(sp.q).slice(0, 50);
  const pageNo = Number(first(sp.page));
  const page = Number.isInteger(pageNo) && pageNo >= 1 ? pageNo : 1;

  const [{ total, rows }, products, partners] = await Promise.all([
    listOrders({ type, status, q, page }),
    listProductsForOrder(),
    listRecentPartners(type),
  ]);
  const pages = Math.max(1, Math.ceil(total / ORDER_PAGE_SIZE));
  const typeParam = type === "SALES" ? "sales" : "purchase";
  const href = (p: number) => `/orders?type=${typeParam}&status=${status}${q ? `&q=${encodeURIComponent(q)}` : ""}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <div className="max-w-6xl">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold">수발주</h2>
        <OrderCreateButton type={type} products={products} partners={partners} />
      </div>

      <div className="mb-4 flex gap-1 border-b">
        {(["PURCHASE", "SALES"] as const).map((t) => (
          <Link
            key={t}
            href={`/orders?type=${t === "SALES" ? "sales" : "purchase"}`}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${type === t ? "border-blue-600 font-semibold text-blue-700" : "border-transparent text-gray-500 hover:text-gray-800"}`}
          >
            {ORDER_TYPE_LABELS[t]} <span className="text-xs text-gray-400">({ORDER_PARTNER_LABELS[t]} → {ORDER_PROCESS_LABELS[t]})</span>
          </Link>
        ))}
      </div>

      <form className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <input type="hidden" name="type" value={typeParam} />
        <select name="status" defaultValue={status} className="rounded border border-gray-300 px-2 py-1.5">
          <option value="active">진행 중 (진행 전 + 일부 처리)</option>
          <option value="all">전체</option>
          {(Object.keys(ORDER_STATUS_LABELS) as OrderStatusCode[]).map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <input name="q" defaultValue={q} placeholder={`번호·${ORDER_PARTNER_LABELS[type]}·품명 검색`} className="w-56 rounded border border-gray-300 px-3 py-1.5" />
        <button className="rounded border border-gray-300 px-3 py-1.5 hover:bg-gray-100">조회</button>
        <span className="ml-auto text-gray-500">{total.toLocaleString()}건</span>
      </form>

      <table className="w-full text-center text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">번호</th>
            <th>등록일</th>
            <th>{ORDER_PARTNER_LABELS[type]}</th>
            <th>품목</th>
            <th>주문 수량</th>
            <th>{ORDER_PROCESS_LABELS[type]} 진행</th>
            <th>금액</th>
            <th>{ORDER_DUE_LABELS[type]}</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="py-8 text-gray-400">
                {ORDER_TYPE_LABELS[type]} 내역이 없습니다.
              </td>
            </tr>
          )}
          {rows.map((o) => {
            const qty = o.lines.reduce((s, l) => s + l.quantity, 0);
            const done = o.lines.reduce((s, l) => s + l.processedQty, 0);
            const amount = o.lines.reduce((s, l) => s + l.quantity * (l.unitPrice ?? 0), 0);
            const st = o.status as OrderStatusCode;
            return (
              <tr key={o.id} className="border-b hover:bg-blue-50">
                <td className="py-2">
                  <Link href={`/orders/${o.id}`} className="font-mono text-blue-700 hover:underline">
                    {o.orderNo}
                  </Link>
                </td>
                <td className="text-gray-500">{toKstDate(o.createdAt)}</td>
                <td>{o.partner}</td>
                <td className="max-w-56 truncate" title={o.lines.map((l) => l.product.name).join(", ")}>
                  {o.lines[0]?.product.name}
                  {o.lines.length > 1 && <span className="text-gray-400"> 외 {o.lines.length - 1}</span>}
                </td>
                <td>{qty.toLocaleString()}</td>
                <td>
                  {done.toLocaleString()} / {qty.toLocaleString()}
                  <span className="ml-1 text-xs text-gray-400">({qty ? Math.round((done / qty) * 100) : 0}%)</span>
                </td>
                <td>{amount ? `${amount.toLocaleString()}원` : "-"}</td>
                <td className="text-gray-500">{o.dueDate ? toKstDate(o.dueDate) : "-"}</td>
                <td>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${ORDER_STATUS_STYLE[st]}`}>{ORDER_STATUS_LABELS[st]}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {pages > 1 && (
        <nav className="mt-4 flex justify-center gap-2 text-sm">
          {page > 1 && <Link href={href(page - 1)} className="rounded border px-2 py-1 hover:bg-gray-100">‹ 이전</Link>}
          <span className="px-2 py-1 text-gray-500">{page} / {pages}</span>
          {page < pages && <Link href={href(page + 1)} className="rounded border px-2 py-1 hover:bg-gray-100">다음 ›</Link>}
        </nav>
      )}
    </div>
  );
}
