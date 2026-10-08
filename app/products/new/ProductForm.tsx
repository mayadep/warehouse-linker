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
import { STORAGE_TEMPS, STORAGE_TEMP_LABELS } from "@/modules/product/storage";
import { DEFAULT_SAFETY_STOCK } from "@/modules/product/defaults";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
const initialState: ProductActionState = { status: "idle", message: "" };

const input = "w-full";
const errText = "mt-1 block text-xs text-red-600";

export default function ProductForm({ categories, showPrice }: { categories: string[]; showPrice: boolean }) {
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
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="grid grid-cols-4 gap-x-4 gap-y-3 rounded-lg border bg-card p-4"
      noValidate
    >
      <label className="text-sm">
        보관 온도
        <NativeSelect name="storageTemp" className={input} defaultValue="AMBIENT">
          {STORAGE_TEMPS.map((t) => (
            <option key={t} value={t}>
              {STORAGE_TEMP_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
        {err.storageTemp && <span className={errText}>{err.storageTemp}</span>}
      </label>
      <label className="text-sm">
        분류
        <Input
          name="category"
          className={input}
          required
          maxLength={50}
          list="product-categories"
          placeholder="소스류" />
        <datalist id="product-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        {err.category && <span className={errText}>{err.category}</span>}
      </label>
      <label className="col-span-2 text-sm">
        품명
        <Input name="name" className={input} required maxLength={100} placeholder="케찹 3.2kg" />
        {err.name && <span className={errText}>{err.name}</span>}
      </label>

      <label className="text-sm">
        기본단위
        <NativeSelect
          name="baseUnit"
          className={input}
          value={baseUnit}
          onChange={(e) => setBaseUnit(e.target.value as ProductUnitCode)}>
          {PRODUCT_UNITS.map((u) => (
            <option key={u} value={u}>
              {u} ({PRODUCT_UNIT_LABELS[u]})
            </option>
          ))}
        </NativeSelect>
        {err.baseUnit && <span className={errText}>{err.baseUnit}</span>}
      </label>
      <label className="text-sm">
        {baseUnit === "BOX" ? "박스당 입수 (1 고정)" : `박스당 입수 (1박스 = 몇 ${baseUnit})`}
        {baseUnit === "BOX" ? (
          <Input key="box-fixed" className={`${input} bg-gray-100 text-right text-gray-400 tabular-nums`} value={1} disabled readOnly />
        ) : (
          <Input
            key="box-qty"
            name="boxQty"
            className={`${input} text-right tabular-nums`}
            type="number"
            min={1}
            step={1}
            required
            defaultValue={1} />
        )}
        {err.boxQty && <span className={errText}>{err.boxQty}</span>}
      </label>
      {/* 직원은 판매가를 입력하지 않음 (관리자가 확정할 때 입력, 서버에서도 무시) */}
      {showPrice && (
        <label className="text-sm">
          판매가 (원)
          <Input name="price" className={`${input} text-right tabular-nums`} type="number" min={0} step={1} placeholder="0" />
          {err.price && <span className={errText}>{err.price}</span>}
        </label>
      )}
      <label className="text-sm">
        안전재고
        <Input name="safetyStock" className={`${input} text-right tabular-nums`} type="number" min={0} step={1} defaultValue={DEFAULT_SAFETY_STOCK} />
        {err.safetyStock && <span className={errText}>{err.safetyStock}</span>}
      </label>

      <p className="col-span-4 text-xs text-muted-foreground">
        안전재고: 현재고가 이 값 이하이면 재고현황에서 &quot;부족&quot;으로 표시됩니다. (0 = 사용 안 함, 비우면 {DEFAULT_SAFETY_STOCK})
      </p>

      <label className="col-span-3 flex items-center gap-2 text-sm">
        <input type="checkbox" name="trackExpiry" defaultChecked />
        유통기한 관리
      </label>
      <div className="flex items-end">
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? "처리 중..." : "등록"}
        </Button>
      </div>

      {state.message && (
        <p
          aria-live="polite"
          className={`col-span-4 text-sm ${state.status === "success" ? "text-green-700" : "text-red-600"}`}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
