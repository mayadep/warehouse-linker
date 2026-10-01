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
}: {
  products: InboundProductOption[];
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
      className="flex max-w-xl flex-col gap-4"
      noValidate
    >
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

      <div className="flex gap-4">
        <label className="flex-1 text-sm">
          입고 수량
          <Input
            name="quantity"
            type="number"
            min={1}
            step={1}
            required
            className={input}
            placeholder="0" />
          {err.quantity && <span className="mt-1 block text-xs text-red-600">{err.quantity}</span>}
        </label>
        <label className="flex-1 text-sm">
          입고 단가 (원, 선택)
          <Input
            name="unitCost"
            type="number"
            min={0}
            step={1}
            className={input}
            placeholder="0" />
          {err.unitCost && <span className="mt-1 block text-xs text-red-600">{err.unitCost}</span>}
        </label>
      </div>

      <div className="flex gap-4">
        <label className="flex-1 text-sm">
          공급처 (선택)
          <Input name="supplier" maxLength={100} className={input} placeholder="○○식자재" />
          {err.supplier && <span className="mt-1 block text-xs text-red-600">{err.supplier}</span>}
        </label>
        <label className="flex-1 text-sm">
          입고일시 (비우면 현재 시각)
          <Input name="receivedAt" type="datetime-local" className={input} />
          {err.receivedAt && <span className="mt-1 block text-xs text-red-600">{err.receivedAt}</span>}
        </label>
      </div>

      <label className="text-sm">
        비고 (선택)
        <Input name="memo" maxLength={500} className={input} />
        {err.memo && <span className="mt-1 block text-xs text-red-600">{err.memo}</span>}
      </label>

      <Button type="submit"
        disabled={pending}>
        {pending ? "처리 중..." : "입고 등록"}
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
            className="mt-2 rounded bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-500 disabled:bg-gray-400"
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
