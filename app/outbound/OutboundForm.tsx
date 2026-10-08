"use client";

import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import {
  createOutboundAction,
  searchOutboundProductsAction,
  type OutboundActionState,
} from "@/modules/outbound/actions";
import { newRequestId } from "@/lib/request-id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import PickSelect from "./PickSelect";
import PartnerSelect, { type PartnerOption } from "@/components/PartnerSelect";
export type OutboundProductOption = {
  id: string;
  sku: string;
  name: string;
  category: string;
  stock: number;
  price: number | null; // 금액 권한이 없으면 null
  baseUnit: string;
  boxQty: number;
  location: { code: string } | null;
};

const initialState: OutboundActionState = { status: "idle", message: "" };

const input = "w-full";
const errText = "mt-1 block text-xs text-red-600";

export default function OutboundForm({
  products,
  productTotal,
  customers,
  showPrice,
}: {
  /** 처음 보여줄 상품(서버에서 가져온 앞쪽 일부) */
  products: OutboundProductOption[];
  /** 출고 가능한 전체 상품 수 */
  productTotal: number;
  customers: PartnerOption[];
  showPrice: boolean;
}) {
  const [state, formAction, pending] = useActionState(createOutboundAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  // 등록 요청 고유키: 저장 성공 전까지 같은 값을 재사용 → 재전송돼도 서버에서 1건만 처리
  const requestIdRef = useRef<string | null>(null);
  const [keyword, setKeyword] = useState("");
  const [productId, setProductId] = useState("");
  // 서버 검색 결과(목록), 검색 결과 전체 개수, 고른 상품(검색어가 바뀌어도 유지)
  const [options, setOptions] = useState(products);
  const [total, setTotal] = useState(productTotal);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<OutboundProductOption | null>(null);
  const [quantityText, setQuantityText] = useState("");
  const [qtyUnit, setQtyUnit] = useState<"BASE" | "BOX">("BASE");
  const [unitPriceText, setUnitPriceText] = useState("");

  // 성공 시 폼 초기화 (실패 시에는 입력값 유지)
  const [handledTs, setHandledTs] = useState<number | undefined>();
  if (state.status === "success" && state.ts !== handledTs) {
    setHandledTs(state.ts);
    setProductId("");
    setPicked(null);
    setKeyword("");
    setQuantityText("");
    setQtyUnit("BASE");
    setUnitPriceText("");
  }
  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      requestIdRef.current = null;
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
      searchOutboundProductsAction(k).then((r) => {
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
  // 박스 입력은 기본단위가 박스가 아니고 입수가 2 이상인 상품만. qty 는 항상 기본단위 수량
  const canBox = !!selected && selected.baseUnit !== "BOX" && selected.boxQty > 1;
  const useBox = canBox && qtyUnit === "BOX";
  const inputNum = /^\d+$/.test(quantityText) ? Number(quantityText) : 0;
  const qty = useBox ? inputNum * selected.boxQty : inputNum;
  const overStock = !!selected && qty > selected.stock;

  function onSelectProduct(id: string) {
    setProductId(id);
    const p = options.find((x) => x.id === id) ?? null;
    setPicked(p);
    setQtyUnit("BASE");
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
          onChange={(e) => onSelectProduct(e.target.value)}
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
            <option key={p.id} value={p.id} disabled={p.stock === 0}>
              [{p.sku}] {p.name} · 재고 {p.stock.toLocaleString()}
              {p.stock === 0 ? " (재고 없음)" : ""}
            </option>
          ))}
        </NativeSelect>
        {!searching && total > options.length && (
          <p className="mt-1 text-xs text-gray-500">검색 결과가 많아 앞쪽 {options.length}개만 보입니다. 검색어를 더 입력해 좁혀 보세요.</p>
        )}
        {selected && (
          <p className="mt-1 text-xs text-gray-500">
            현재고 {selected.stock.toLocaleString()} {selected.baseUnit}
            {qty > 0 && !overStock && ` → 출고 후 ${(selected.stock - qty).toLocaleString()}`}
            {selected.location && ` · 위치 ${selected.location.code}`}
          </p>
        )}
        {err.productId && <span className={errText}>{err.productId}</span>}
      </div>

      <div className="text-sm">
        <label htmlFor="outbound-quantity">출고 수량{useBox ? " (박스)" : selected ? ` (${selected.baseUnit})` : ""}</label>
        <div className="flex gap-2">
          <Input
            id="outbound-quantity"
            name="quantity"
            type="number"
            min={1}
            step={1}
            required
            className={`${input} text-right tabular-nums ${overStock ? "border-red-400" : ""}`}
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
        {useBox && qty > 0 && (
          <p className="mt-1 text-xs text-gray-500">
            = {qty.toLocaleString()} {selected.baseUnit} (1박스 = {selected.boxQty.toLocaleString()}{selected.baseUnit})
          </p>
        )}
        {overStock && (
          <span className={errText}>현재고({selected.stock.toLocaleString()})보다 많습니다.</span>
        )}
        {err.quantity && <span className={errText}>{err.quantity}</span>}
      </div>
      {/* 직원은 단가를 입력하지 않음 (관리자가 확정할 때 입력, 서버에서도 무시) */}
      {showPrice && (
        <label className="text-sm">
          출고단가 (원, 기본 판매가)
          <Input
            name="unitPrice"
            type="number"
            min={0}
            step={1}
            className={`${input} text-right tabular-nums`}
            placeholder="0"
            value={unitPriceText}
            onChange={(e) => setUnitPriceText(e.target.value)} />
          {err.unitPrice && <span className={errText}>{err.unitPrice}</span>}
        </label>
      )}
      <label className={`text-sm ${showPrice ? "" : "col-span-2"}`}>
        출고처 (선택)
        <PartnerSelect options={customers} label="출고처" />
        {err.partnerId && <span className={errText}>{err.partnerId}</span>}
      </label>
      <label className="text-sm">
        출고일시 (비우면 현재 시각)
        <Input name="shippedAt" type="datetime-local" className={input} />
        {err.shippedAt && <span className={errText}>{err.shippedAt}</span>}
      </label>

      <label className="col-span-4 text-sm">
        출고 위치
        <PickSelect key={productId} productId={productId} quantity={qty} baseUnit={selected?.baseUnit} />
        {err.pick && <span className={errText}>{err.pick}</span>}
      </label>

      <label className="col-span-3 text-sm">
        비고 (선택)
        <Input name="memo" maxLength={500} className={input} />
        {err.memo && <span className={errText}>{err.memo}</span>}
      </label>
      <div className="flex items-end">
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "처리 중..." : "출고 등록"}
        </Button>
      </div>

      {state.status === "confirm" ? (
        <div
          aria-live="polite"
          className="col-span-4 flex items-center justify-between gap-4 rounded-[6px] border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          <p>{state.message}</p>
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
