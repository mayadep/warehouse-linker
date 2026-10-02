"use client";

import { useActionState, useEffect, useMemo, useRef, useState, startTransition } from "react";
import {
  createOutboundAction,
  type OutboundActionState,
} from "@/modules/outbound/actions";
import { newRequestId } from "@/lib/request-id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
export type OutboundProductOption = {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock: number;
  price: number | null; // 금액 권한이 없으면 null
  baseUnit: string;
  location: { code: string } | null;
};

const initialState: OutboundActionState = { status: "idle", message: "" };

const input = "w-full";
const errText = "mt-1 block text-xs text-red-600";

export default function OutboundForm({
  products,
  customers,
  showPrice,
}: {
  products: OutboundProductOption[];
  customers: string[];
  showPrice: boolean;
}) {
  const [state, formAction, pending] = useActionState(createOutboundAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  // 등록 요청 고유키: 저장 성공 전까지 같은 값을 재사용 → 재전송돼도 서버에서 1건만 처리
  const requestIdRef = useRef<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [productId, setProductId] = useState("");
  const [quantityText, setQuantityText] = useState("");
  const [unitPriceText, setUnitPriceText] = useState("");

  // 성공 시 폼 초기화 (실패 시에는 입력값 유지)
  const [handledTs, setHandledTs] = useState<number | undefined>();
  if (state.status === "success" && state.ts !== handledTs) {
    setHandledTs(state.ts);
    setProductId("");
    setKeyword("");
    setQuantityText("");
    setUnitPriceText("");
  }
  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      requestIdRef.current = null;
    }
  }, [state]);

  const filtered = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return products;
    return products.filter(
      (p) =>
        p.sku.toLowerCase().includes(k) ||
        p.name.toLowerCase().includes(k) ||
        p.category.toLowerCase().includes(k)
    );
  }, [keyword, products]);

  const selected = products.find((p) => p.id === productId);
  const qty = /^\d+$/.test(quantityText) ? Number(quantityText) : 0;
  const overStock = !!selected && qty > selected.stock;

  function onSelectProduct(id: string) {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    // 상품 판매가를 출고단가 기본값으로 (수정 가능)
    setUnitPriceText(p?.price != null ? String(p.price) : "");
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return; // 중복 제출 방지
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const fd = new FormData(e.currentTarget, submitter);
    requestIdRef.current ??= newRequestId();
    fd.set("requestId", requestIdRef.current);
    startTransition(() => formAction(fd));
  }

  const err = state.status === "error" ? state.errors ?? {} : {};

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4" noValidate>
      <div className="text-sm">
        <span>상품</span>
        <Input
          className={`${input} mb-2`}
          placeholder="코드·품명·분류로 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)} />
        <NativeSelect
          name="productId"
          className={input}
          value={productId}
          onChange={(e) => onSelectProduct(e.target.value)}
          required>
          <option value="">-- 상품 선택 ({filtered.length}개) --</option>
          {selected && !filtered.includes(selected) && (
            <option value={selected.id}>
              [{selected.sku}] {selected.name}
            </option>
          )}
          {filtered.map((p) => (
            <option key={p.id} value={p.id} disabled={p.stock === 0}>
              [{p.sku}] {p.name} · 재고 {p.stock.toLocaleString()}
              {p.stock === 0 ? " (재고 없음)" : ""}
            </option>
          ))}
        </NativeSelect>
        {selected && (
          <p className="mt-1 text-xs text-gray-500">
            현재고 {selected.stock.toLocaleString()} {selected.baseUnit}
            {qty > 0 && !overStock && ` → 출고 후 ${(selected.stock - qty).toLocaleString()}`}
            {selected.location && ` · 위치 ${selected.location.code}`}
          </p>
        )}
        {err.productId && <span className={errText}>{err.productId}</span>}
      </div>

      <div className="flex gap-4">
        <label className="flex-1 text-sm">
          출고 수량
          <Input
            name="quantity"
            type="number"
            min={1}
            max={selected?.stock}
            step={1}
            required
            className={`${input} ${overStock ? "border-red-400" : ""}`}
            placeholder="0"
            value={quantityText}
            onChange={(e) => setQuantityText(e.target.value)} />
          {overStock && (
            <span className={errText}>현재고({selected.stock.toLocaleString()})보다 많습니다.</span>
          )}
          {err.quantity && <span className={errText}>{err.quantity}</span>}
        </label>
        {/* 직원은 단가를 입력하지 않음 (관리자가 확정할 때 입력, 서버에서도 무시) */}
        {showPrice && (
          <label className="flex-1 text-sm">
            출고단가 (원, 기본 판매가)
            <Input
              name="unitPrice"
              type="number"
              min={0}
              step={1}
              className={input}
              placeholder="0"
              value={unitPriceText}
              onChange={(e) => setUnitPriceText(e.target.value)} />
            {err.unitPrice && <span className={errText}>{err.unitPrice}</span>}
          </label>
        )}
      </div>

      <div className="flex gap-4">
        <label className="flex-1 text-sm">
          출고처 (선택)
          <Input
            name="customer"
            maxLength={100}
            className={input}
            placeholder="예: 한빛마트"
            list="outbound-customers" />
          <datalist id="outbound-customers">
            {customers.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {err.customer && <span className={errText}>{err.customer}</span>}
        </label>
        <label className="flex-1 text-sm">
          출고일시 (비우면 현재 시각)
          <Input name="shippedAt" type="datetime-local" className={input} />
          {err.shippedAt && <span className={errText}>{err.shippedAt}</span>}
        </label>
      </div>

      <label className="text-sm">
        비고 (선택)
        <Input name="memo" maxLength={500} className={input} />
        {err.memo && <span className={errText}>{err.memo}</span>}
      </label>

      <Button type="submit"
        disabled={pending}>
        {pending ? "처리 중..." : "출고 등록"}
      </Button>

      {state.status === "confirm" ? (
        <div
          aria-live="polite"
          className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
        >
          <p>{state.message}</p>
          <button
            name="confirmDuplicate"
            value="1"
            disabled={pending}
            className="mt-2 rounded-[6px] bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-500 disabled:bg-gray-400"
          >
            그래도 등록
          </button>
        </div>
      ) : (
        state.message && (
          <p
            aria-live="polite"
            className={`text-sm ${state.status === "success" ? "text-green-700" : "text-red-600"}`}
          >
            {state.message}
          </p>
        )
      )}
    </form>
  );
}
