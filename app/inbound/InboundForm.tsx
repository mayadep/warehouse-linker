"use client";

import { useActionState, useEffect, useMemo, useRef, useState, startTransition } from "react";
import {
  createInboundAction,
  type InboundActionState,
} from "@/modules/inbound/actions";
import { newRequestId } from "@/lib/request-id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
export type InboundProductOption = {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock: number;
  location: { code: string } | null;
};

const initialState: InboundActionState = { status: "idle", message: "" };

const input = "w-full";

export default function InboundForm({
  products,
  showPrice,
}: {
  products: InboundProductOption[];
  showPrice: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    createInboundAction,
    initialState
  );
  const formRef = useRef<HTMLFormElement>(null);
  // 등록 요청 고유키: 저장 성공 전까지 같은 값을 재사용 → 재전송돼도 서버에서 1건만 처리
  const requestIdRef = useRef<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [productId, setProductId] = useState("");

  // 성공 시 폼 초기화 (실패 시에는 입력값 유지)
  // 제어 상태는 렌더 중 1회 갱신, DOM 입력값은 effect에서 reset
  const [handledTs, setHandledTs] = useState<number | undefined>();
  if (state.status === "success" && state.ts !== handledTs) {
    setHandledTs(state.ts);
    setProductId("");
    setKeyword("");
  }
  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      requestIdRef.current = null; // 다음 등록은 새 요청
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

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return; // 중복 제출 방지
    // submitter 포함: [그래도 등록] 버튼의 confirmDuplicate=1 이 함께 전송됨
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const fd = new FormData(e.currentTarget, submitter);
    requestIdRef.current ??= newRequestId();
    fd.set("requestId", requestIdRef.current);
    startTransition(() => formAction(fd));
  }

  const err = state.status === "error" ? state.errors ?? {} : {};

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="grid grid-cols-4 gap-x-4 gap-y-3 rounded-lg border bg-card p-4"
      noValidate
    >
      <label className="col-span-2 text-sm">
        상품 검색
        <Input
          className={input}
          placeholder="코드·품명·분류로 검색"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)} />
      </label>
      <div className="col-span-2 text-sm">
        <span>상품</span>
        <NativeSelect
          name="productId"
          aria-label="상품"
          className={input}
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          required>
          <option value="">-- 상품 선택 ({filtered.length}개) --</option>
          {selected && !filtered.includes(selected) && (
            <option value={selected.id}>
              [{selected.sku}] {selected.name}
            </option>
          )}
          {filtered.map((p) => (
            <option key={p.id} value={p.id}>
              [{p.sku}] {p.name} · {p.category}
            </option>
          ))}
        </NativeSelect>
        {selected && (
          <p className="mt-1 text-xs text-gray-500">
            현재고 {selected.stock.toLocaleString()}
            {selected.location && ` · 위치 ${selected.location.code}`}
          </p>
        )}
        {err.productId && <p className="mt-1 text-xs text-red-600">{err.productId}</p>}
      </div>

      <label className="text-sm">
        입고 수량
        <Input
          name="quantity"
          type="number"
          min={1}
          step={1}
          required
          className={`${input} text-right tabular-nums`}
          placeholder="0" />
        {err.quantity && <span className="mt-1 block text-xs text-red-600">{err.quantity}</span>}
      </label>
      {/* 직원은 단가를 입력하지 않음 (관리자가 확정할 때 입력, 서버에서도 무시) */}
      {showPrice && (
        <label className="text-sm">
          입고 단가 (원, 선택)
          <Input
            name="unitCost"
            type="number"
            min={0}
            step={1}
            className={`${input} text-right tabular-nums`}
            placeholder="0" />
          {err.unitCost && <span className="mt-1 block text-xs text-red-600">{err.unitCost}</span>}
        </label>
      )}
      <label className={`text-sm ${showPrice ? "" : "col-span-2"}`}>
        공급처 (선택)
        <Input name="supplier" maxLength={100} className={input} placeholder="예: 한빛식자재" />
        {err.supplier && <span className="mt-1 block text-xs text-red-600">{err.supplier}</span>}
      </label>
      <label className="text-sm">
        입고일시 (비우면 현재 시각)
        <Input name="receivedAt" type="datetime-local" className={input} />
        {err.receivedAt && <span className="mt-1 block text-xs text-red-600">{err.receivedAt}</span>}
      </label>

      <label className="text-sm">
        유통기한 (선택)
        <Input name="expiryDate" type="date" className={input} />
        {err.expiryDate && <span className="mt-1 block text-xs text-red-600">{err.expiryDate}</span>}
      </label>
      <label className="text-sm">
        보관 위치 (비우면 기본 위치)
        <Input
          name="locationCode"
          maxLength={30}
          className={`${input} uppercase`}
          placeholder={selected ? (selected.location?.code ?? "기본 위치 없음 → 미지정") : "예: RF1-R01-2-3"} />
        {err.locationCode && <span className="mt-1 block text-xs text-red-600">{err.locationCode}</span>}
      </label>
      <label className="text-sm">
        비고 (선택)
        <Input name="memo" maxLength={500} className={input} />
        {err.memo && <span className="mt-1 block text-xs text-red-600">{err.memo}</span>}
      </label>
      <div className="flex items-end">
        <Button type="submit" className="w-full"
          disabled={pending}>
          {pending ? "처리 중..." : "입고 등록"}
        </Button>
      </div>

      {state.status === "confirm" ? (
        <div
          aria-live="polite"
          className="col-span-4 flex items-center justify-between gap-4 rounded-[6px] border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          <p>{state.message}</p>
          <input type="hidden" name="confirmedLocationCode" value={state.confirmLocationCode ?? ""} />
          <button
            name="confirmDuplicate"
            value="1"
            disabled={pending}
            className="shrink-0 rounded-[6px] bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-500 disabled:bg-gray-400"
          >
            그래도 등록
          </button>
        </div>
      ) : (
        state.message && (
          <p
            aria-live="polite"
            className={`col-span-4 text-sm ${state.status === "success" ? "text-green-700" : "text-red-600"}`}
          >
            {state.message}
          </p>
        )
      )}
    </form>
  );
}
