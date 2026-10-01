"use client";

import { startTransition, useActionState, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import { newRequestId } from "@/lib/request-id";
import { createOrderAction, type OrderCreateState } from "@/modules/order/actions";
import {
  ORDER_DUE_LABELS,
  ORDER_LIMITS,
  ORDER_PARTNER_LABELS,
  ORDER_TYPE_LABELS,
  type OrderTypeCode,
} from "@/modules/order/codes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
export type OrderProductOption = {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  baseUnit: string;
};

type Row = { key: number; productId: string; quantity: string; unitPrice: string };

const initial: OrderCreateState = { status: "idle", message: "" };
const input = "w-full";

function CreateForm({
  type,
  products,
  partners,
  onClose,
}: {
  type: OrderTypeCode;
  products: OrderProductOption[];
  partners: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(createOrderAction, initial);
  const requestIdRef = useRef<string | null>(null);
  const [rows, setRows] = useState<Row[]>([{ key: 1, productId: "", quantity: "", unitPrice: "" }]);
  const [keyword, setKeyword] = useState("");
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    return k ? products.filter((p) => p.sku.toLowerCase().includes(k) || p.name.toLowerCase().includes(k)) : products;
  }, [keyword, products]);

  // 등록 성공 → 상세 화면으로
  useEffect(() => {
    if (state.status === "success" && state.orderId) router.push(`/orders/${type === "SALES" ? "sales" : "purchase"}/${state.orderId}`);
  }, [state, router, type]);

  function update(key: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }
  function choose(key: number, productId: string) {
    const p = byId.get(productId);
    // 수주는 판매가를 단가 기본값으로
    update(key, { productId, unitPrice: type === "SALES" && p ? String(p.price) : "" });
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    fd.set("type", type);
    fd.set(
      "lines",
      JSON.stringify(
        rows
          .filter((r) => r.productId || r.quantity)
          .map((r) => ({ productId: r.productId, quantity: r.quantity, unitPrice: r.unitPrice === "" ? null : r.unitPrice }))
      )
    );
    requestIdRef.current ??= newRequestId();
    fd.set("requestId", requestIdRef.current);
    startTransition(() => action(fd));
  }

  const err = state.status === "error" ? state.errors ?? {} : {};
  const total = rows.reduce((s, r) => s + (Number(r.quantity) || 0) * (Number(r.unitPrice) || 0), 0);

  return (
    <Modal title={`${ORDER_TYPE_LABELS[type]} 등록`} onClose={onClose} maxWidth="max-w-3xl" closeDisabled={pending}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3 text-sm">
        <div className="flex gap-3">
          <label className="flex-1">
            {ORDER_PARTNER_LABELS[type]}
            <Input name="partner" list="order-partners" maxLength={ORDER_LIMITS.maxPartnerLength} className={input} />
            <datalist id="order-partners">
              {partners.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
            {err.partner && <span className="text-xs text-red-600">{err.partner}</span>}
          </label>
          <label className="w-44">
            {ORDER_DUE_LABELS[type]} (선택)
            <Input name="dueDate" type="date" className={input} />
            {err.dueDate && <span className="text-xs text-red-600">{err.dueDate}</span>}
          </label>
        </div>

        <div className="rounded border border-gray-200 p-2">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-medium">품목</span>
            <Input className="w-56 text-xs h-8"
              placeholder="상품 목록 검색 (코드·품명)"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)} />
          </div>
          <table className="w-full text-center text-sm">
            <thead>
              <tr className="text-xs text-gray-500">
                <th className="w-8">#</th>
                <th>상품</th>
                <th className="w-24">수량</th>
                <th className="w-28">단가</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const p = byId.get(r.productId);
                const short = type === "SALES" && p && Number(r.quantity) > p.stock;
                return (
                  <tr key={r.key}>
                    <td className="text-gray-400">{i + 1}</td>
                    <td className="py-1">
                      <NativeSelect className={input} value={r.productId} onChange={(e) => choose(r.key, e.target.value)}>
                        <option value="">-- 상품 선택 --</option>
                        {p && !filtered.includes(p) && (
                          <option value={p.id}>
                            [{p.sku}] {p.name}
                          </option>
                        )}
                        {filtered.map((o) => (
                          <option key={o.id} value={o.id} disabled={rows.some((x) => x.key !== r.key && x.productId === o.id)}>
                            [{o.sku}] {o.name} · 재고 {o.stock.toLocaleString()}
                          </option>
                        ))}
                      </NativeSelect>
                      {short && <span className="block text-xs text-amber-700">현재고 {p!.stock.toLocaleString()} — 출고 시 부족할 수 있음</span>}
                    </td>
                    <td>
                      <Input type="number" min={1} className={input} value={r.quantity} onChange={(e) => update(r.key, { quantity: e.target.value })} />
                    </td>
                    <td>
                      <Input type="number" min={0} className={input} value={r.unitPrice} placeholder="선택" onChange={(e) => update(r.key, { unitPrice: e.target.value })} />
                    </td>
                    <td>
                      {rows.length > 1 && (
                        <button type="button" aria-label="품목 삭제" className="text-gray-400 hover:text-red-600" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2 flex items-center justify-between">
            <Button variant="outline" size="xs"
              type="button"
              disabled={rows.length>= ORDER_LIMITS.maxLines}
              onClick={() => setRows((rs) => [...rs, { key: Math.max(...rs.map((x) => x.key)) + 1, productId: "", quantity: "", unitPrice: "" }])}>
              + 품목 추가
            </Button>
            <span className="text-xs text-gray-500">합계 금액 {total.toLocaleString()}원</span>
          </div>
          {err.lines && <p className="mt-1 text-xs text-red-600">{err.lines}</p>}
        </div>

        <label>
          비고 (선택)
          <Input name="memo" maxLength={ORDER_LIMITS.maxMemoLength} className={input} />
        </label>

        {state.status === "error" && <p className="text-red-600">{state.message}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "등록 중..." : `${ORDER_TYPE_LABELS[type]} 등록`}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function OrderCreateButton(props: { type: OrderTypeCode; products: OrderProductOption[]; partners: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button  type="button" onClick={() => setOpen(true)}>
        + {ORDER_TYPE_LABELS[props.type]} 등록
      </Button>
      {open && <CreateForm {...props} onClose={() => setOpen(false)} />}
    </>
  );
}
