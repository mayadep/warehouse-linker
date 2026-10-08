"use client";

import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import {
  createInboundAction,
  searchInboundProductsAction,
  type InboundActionState,
} from "@/modules/inbound/actions";
import { newRequestId } from "@/lib/request-id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import PartnerSelect, { type PartnerOption } from "@/components/PartnerSelect";
export type InboundProductOption = {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock: number;
  baseUnit: string;
  boxQty: number;
  location: { code: string } | null;
};

const initialState: InboundActionState = { status: "idle", message: "" };

const input = "w-full";

export default function InboundForm({
  products,
  productTotal,
  suppliers,
  showPrice,
}: {
  /** 처음 보여줄 상품(서버에서 가져온 앞쪽 일부) */
  products: InboundProductOption[];
  /** 입고 가능한 전체 상품 수 */
  productTotal: number;
  suppliers: PartnerOption[];
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
  // 서버 검색 결과(목록), 검색 결과 전체 개수, 고른 상품(검색어가 바뀌어도 유지)
  const [options, setOptions] = useState(products);
  const [total, setTotal] = useState(productTotal);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<InboundProductOption | null>(null);
  const [qtyUnit, setQtyUnit] = useState<"BASE" | "BOX">("BASE");
  const [quantityText, setQuantityText] = useState("");

  // 성공 시 폼 초기화 (실패 시에는 입력값 유지)
  // 제어 상태는 렌더 중 1회 갱신, DOM 입력값은 effect에서 reset
  const [handledTs, setHandledTs] = useState<number | undefined>();
  if (state.status === "success" && state.ts !== handledTs) {
    setHandledTs(state.ts);
    setProductId("");
    setPicked(null);
    setKeyword("");
    setQtyUnit("BASE");
    setQuantityText("");
  }
  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      requestIdRef.current = null; // 다음 등록은 새 요청
    }
  }, [state]);


  // 서버 검색: 입력이 멈춘 뒤 0.25초에 조회 (빈 검색어는 처음 목록으로 되돌림)
  useEffect(() => {
    const k = keyword.trim();
    let alive = true;
    const t = setTimeout(() => {
      if (!k) {
        setOptions(products);
        setTotal(productTotal);
        setSearching(false);
        return;
      }
      setSearching(true);
      searchInboundProductsAction(k).then((r) => {
        if (!alive) return;
        if (r) {
          setOptions(r.rows);
          setTotal(r.total);
        }
        setSearching(false);
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [keyword, products, productTotal]);

  const selected = productId ? picked : null;
  // 박스 입력은 기본단위가 박스가 아니고 입수가 2 이상인 상품만
  const canBox = !!selected && selected.baseUnit !== "BOX" && selected.boxQty > 1;
  const useBox = canBox && qtyUnit === "BOX";
  const qtyNum = /^\d+$/.test(quantityText) ? Number(quantityText) : 0;

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
          onChange={(e) => {
            setProductId(e.target.value);
            setPicked(options.find((p) => p.id === e.target.value) ?? null);
            setQtyUnit("BASE");
          }}
          required>
          <option value="">
            -- 상품 선택 ({searching ? "검색 중..." : total > options.length ? `${options.length}개 표시 · 검색 결과 ${total.toLocaleString()}개` : `${options.length}개`}) --
          </option>
          {selected && !options.some((p) => p.id === selected.id) && (
            <option value={selected.id}>
              [{selected.sku}] {selected.name}
            </option>
          )}
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              [{p.sku}] {p.name} · {p.category}
            </option>
          ))}
        </NativeSelect>
        {!searching && total > options.length && (
          <p className="mt-1 text-xs text-gray-500">검색 결과가 많아 앞쪽 {options.length}개만 보입니다. 검색어를 더 입력해 좁혀 보세요.</p>
        )}
        {selected && (
          <p className="mt-1 text-xs text-gray-500">
            현재고 {selected.stock.toLocaleString()}
            {selected.location && ` · 위치 ${selected.location.code}`}
          </p>
        )}
        {err.productId && <p className="mt-1 text-xs text-red-600">{err.productId}</p>}
      </div>

      <div className="text-sm">
        <label htmlFor="inbound-quantity">입고 수량{useBox && selected ? " (박스)" : selected ? ` (${selected.baseUnit})` : ""}</label>
        <div className="flex gap-2">
          <Input
            id="inbound-quantity"
            name="quantity"
            type="number"
            min={1}
            step={1}
            required
            className={`${input} text-right tabular-nums`}
            placeholder="0"
            value={quantityText}
            onChange={(e) => setQuantityText(e.target.value)} />
          {canBox && (
            <NativeSelect name="qtyUnit" aria-label="수량 단위" value={qtyUnit} onChange={(e) => setQtyUnit(e.target.value as "BASE" | "BOX")} className="w-24 shrink-0">
              <option value="BASE">{selected.baseUnit}</option>
              <option value="BOX">박스</option>
            </NativeSelect>
          )}
        </div>
        {useBox && selected && qtyNum > 0 && (
          <p className="mt-1 text-xs text-gray-500">
            = {(qtyNum * selected.boxQty).toLocaleString()} {selected.baseUnit} (1박스 = {selected.boxQty.toLocaleString()}{selected.baseUnit})
          </p>
        )}
        {err.quantity && <span className="mt-1 block text-xs text-red-600">{err.quantity}</span>}
      </div>
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
        <PartnerSelect options={suppliers} label="공급처" />
        {err.partnerId && <span className="mt-1 block text-xs text-red-600">{err.partnerId}</span>}
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
