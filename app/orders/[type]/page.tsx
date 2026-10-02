import Link from "next/link";
import Forbidden from "@/components/Forbidden";
import { requirePageUser } from "@/modules/user/auth";
import { can } from "@/modules/user/codes";
import { notFound } from "next/navigation";
import { connection } from "next/server";
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
import { listOrders, listProductsForOrder, listRecentPartners, ORDER_PAGE_SIZE } from "@/modules/order/service";
import OrderCreateButton from "../OrderCreateButton";
import { ChevronLeftIcon, ChevronRightIcon, RotateCcwIcon, SearchIcon } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Badge } from "@/components/ui/badge";
type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
const STATUSES = ["active", "all", "OPEN", "PARTIAL", "DONE", "CLOSED", "CANCELLED"];

export default async function OrdersPage({ params, searchParams }: { params: Promise<{ type: string }>; searchParams: Promise<SP> }) {
  await connection();
  const user = await requirePageUser();
  if (!can(user.role, "admin")) return <Forbidden title="발주·수주" />;
  const { type: slug } = await params;
  if (slug !== "purchase" && slug !== "sales") notFound();
  const sp = await searchParams;
  const type: OrderTypeCode = slug === "sales" ? "SALES" : "PURCHASE";
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
  const href = (p: number) => `/orders/${typeParam}?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ""}${p > 1 ? `&page=${p}` : ""}`;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">{ORDER_TYPE_LABELS[type]}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {ORDER_PARTNER_LABELS[type]} → {ORDER_PROCESS_LABELS[type]}
          </p>
        </div>
        <OrderCreateButton type={type} products={products} partners={partners} />
      </div>
      <form className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border bg-muted/40 p-3">
        <NativeSelect name="status" defaultValue={status} className="[&_select]:bg-card">
          <option value="active">진행 중 (진행 전 + 일부 처리)</option>
          <option value="all">전체</option>
          {(Object.keys(ORDER_STATUS_LABELS) as OrderStatusCode[]).map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </NativeSelect>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="w-64 bg-card pl-8" name="q" defaultValue={q} placeholder={`번호·${ORDER_PARTNER_LABELS[type]}·품명 검색`} />
        </div>
        <Button type="submit">
          <SearchIcon data-icon="inline-start" />
          조회
        </Button>
        <Link href={`/orders/${typeParam}`} className={buttonVariants({ variant: "ghost" })}>
          <RotateCcwIcon data-icon="inline-start" />
          초기화
        </Link>
        <span className="ml-auto text-sm text-muted-foreground tabular-nums">
          <b className="font-semibold text-foreground">{total.toLocaleString()}</b>건
        </span>
      </form>
      <div className="max-h-[70vh] overflow-auto rounded-lg border">
<table className="data-table">
        <thead>
          <tr>
            <th className="left">번호</th>
            <th>등록일</th>
            <th className="left">{ORDER_PARTNER_LABELS[type]}</th>
            <th className="left">품목</th>
            <th className="num">주문 수량</th>
            <th className="num">{ORDER_PROCESS_LABELS[type]} 진행</th>
            <th className="num">금액</th>
            <th>{ORDER_DUE_LABELS[type]}</th>
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={9} className="text-muted-foreground">
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
              <tr key={o.id} className="transition-colors hover:bg-indigo-50">
                <td className="left">
                  <Link href={`/orders/${typeParam}/${o.id}`} className="font-mono text-xs font-medium text-indigo-700 hover:underline">
                    {o.orderNo}
                  </Link>
                </td>
                <td className="text-muted-foreground">{toKstDate(o.createdAt)}</td>
                <td className="left">{o.partner}</td>
                <td className="left max-w-56 truncate" title={o.lines.map((l) => l.product.name).join(", ")}>
                  {o.lines[0]?.product.name}
                  {o.lines.length > 1 && <span className="text-muted-foreground"> 외 {o.lines.length - 1}</span>}
                </td>
                <td className="num">{qty.toLocaleString()}</td>
                <td className="num whitespace-nowrap">
                  {done.toLocaleString()} / {qty.toLocaleString()}
                  <span className="ml-1 text-xs text-muted-foreground">({qty ? Math.round((done / qty) * 100) : 0}%)</span>
                </td>
                <td className="num">{amount ? `${amount.toLocaleString()}원` : "-"}</td>
                <td className="text-muted-foreground">{o.dueDate ? toKstDate(o.dueDate) : "-"}</td>
                <td>
                  <Badge variant={ORDER_STATUS_TONE[st]}>{ORDER_STATUS_LABELS[st]}</Badge>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
</div>

      {pages > 1 && (
        <nav className="mt-5 flex items-center justify-center gap-2" aria-label="페이지">
          {page > 1 ? (
            <Link href={href(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <ChevronLeftIcon data-icon="inline-start" />
              이전
            </Link>
          ) : (
            <span className={buttonVariants({ variant: "outline", size: "sm" }) + " pointer-events-none opacity-50"}>
              <ChevronLeftIcon data-icon="inline-start" />
              이전
            </span>
          )}
          <span className="px-2 text-sm text-muted-foreground tabular-nums">
            <b className="font-semibold text-foreground">{page}</b> / {pages}
          </span>
          {page < pages ? (
            <Link href={href(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              다음
              <ChevronRightIcon data-icon="inline-end" />
            </Link>
          ) : (
            <span className={buttonVariants({ variant: "outline", size: "sm" }) + " pointer-events-none opacity-50"}>
              다음
              <ChevronRightIcon data-icon="inline-end" />
            </span>
          )}
        </nav>
      )}
    </div>
  );
}