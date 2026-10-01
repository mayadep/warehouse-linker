"use client";

import { useActionState, useEffect, useRef, useState, startTransition } from "react";
import {
  createProductAction,
  type ProductActionState,
} from "@/modules/product/actions";
import {
  PRODUCT_UNITS,
  PRODUCT_UNIT_LABELS,
  type ProductUnitCode,
} from "@/modules/product/units";

const initialState: ProductActionState = { status: "idle", message: "" };

const input = "w-full rounded border border-gray-300 px-3 py-2 text-sm";
const errText = "mt-1 block text-xs text-red-600";

export default function ProductForm({ categories }: { categories: string[] }) {
  const [state, formAction, pending] = useActionState(createProductAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [baseUnit, setBaseUnit] = useState<ProductUnitCode>("EA");

  // 성공 시 폼 초기화 (실패 시에는 입력값 유지)
  const [handledTs, setHandledTs] = useState<number | undefined>();
  if (state.status === "success" && state.ts !== handledTs) {
    setHandledTs(state.ts);
    setBaseUnit("EA");
  }
  useEffect(() => {
    if (state.status === "success") formRef.current?.reset();
  }, [state]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return; // 중복 제출 방지
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  const err = state.status === "error" ? state.errors ?? {} : {};

  return (
    <form ref={formRef} onSubmit={onSubmit} className="flex max-w-xl flex-col gap-4" noValidate>
      <div className="flex gap-4">
        <label className="flex-1 text-sm">
          품목코드
          <input
            name="sku"
            className={`${input} uppercase`}
            required
            maxLength={30}
            placeholder="SAU-009"
          />
          {err.sku && <span className={errText}>{err.sku}</span>}
        </label>
        <label className="flex-1 text-sm">
          분류
          <input
            name="category"
            className={input}
            required
            maxLength={50}
            list="product-categories"
            placeholder="소스류"
          />
          <datalist id="product-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {err.category && <span className={errText}>{err.category}</span>}
        </label>
      </div>

      <label className="text-sm">
        품명
        <input name="name" className={input} required maxLength={100} placeholder="케찹 3.2kg" />
        {err.name && <span className={errText}>{err.name}</span>}
      </label>

      <div className="flex gap-4">
        <label className="flex-1 text-sm">
          기본단위
          <select
            name="baseUnit"
            className={input}
            value={baseUnit}
            onChange={(e) => setBaseUnit(e.target.value as ProductUnitCode)}
          >
            {PRODUCT_UNITS.map((u) => (
              <option key={u} value={u}>
                {u} ({PRODUCT_UNIT_LABELS[u]})
              </option>
            ))}
          </select>
          {err.baseUnit && <span className={errText}>{err.baseUnit}</span>}
        </label>

        <label className="flex-1 text-sm">
          {baseUnit === "BOX"
            ? "박스당 입수 (박스 단위 상품은 1 고정)"
            : `박스당 입수 (1박스 = 몇 ${baseUnit})`}
          {baseUnit === "BOX" ? (
            <input className={`${input} bg-gray-100 text-gray-400`} value={1} disabled readOnly />
          ) : (
            <input
              name="boxQty"
              className={input}
              type="number"
              min={1}
              step={1}
              required
              defaultValue={1}
            />
          )}
          {err.boxQty && <span className={errText}>{err.boxQty}</span>}
        </label>

        <label className="flex-1 text-sm">
          판매가 (원)
          <input name="price" className={input} type="number" min={0} step={1} placeholder="0" />
          {err.price && <span className={errText}>{err.price}</span>}
        </label>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="trackExpiry" defaultChecked />
        유통기한 관리
      </label>

      <button
        disabled={pending}
        className="rounded bg-blue-600 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-gray-400"
      >
        {pending ? "처리 중..." : "등록"}
      </button>

      {state.message && (
        <p
          aria-live="polite"
          className={`text-sm ${state.status === "success" ? "text-green-700" : "text-red-600"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
