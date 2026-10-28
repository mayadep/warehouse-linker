"use client";

import { useRef, useState, useTransition } from "react";
import { mobileLookupAction, type LookupResult } from "@/modules/stock/mobile-actions";
import BarcodeScanButton from "@/components/BarcodeScanButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** 스캔(USB 스캐너 Enter / 카메라) 또는 직접 입력으로 상품·위치의 재고를 조회 */
export default function LookupClient() {
  const [value, setValue] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function run(raw: string) {
    startTransition(async () => {
      setResult(await mobileLookupAction(raw));
      setValue("");
      inputRef.current?.focus(); // 다음 스캔을 바로 받을 수 있게
    });
  }

  return (
    <>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!pending) run(value);
        }}
      >
        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="바코드·상품코드·품명·위치코드"
          className="h-12 flex-1 text-base"
          inputMode="search"
          autoFocus
          autoComplete="off"
        />
        <Button type="submit" className="h-12 px-5" disabled={pending}>
          조회
        </Button>
      </form>
      <BarcodeScanButton onScan={run} label="카메라로 스캔" />

      {pending && <p className="text-sm text-muted-foreground">조회 중...</p>}
      {result && !result.ok && (
        <p aria-live="polite" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {result.message}
        </p>
      )}
      {result?.ok && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {result.title}
            {result.more && " · 결과가 많아 앞쪽만 표시합니다"}
          </p>
          {result.products.map((p) => (
            <section key={p.sku} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">{p.sku}</div>
                  <div className="truncate text-base font-semibold">{p.name}</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold tabular-nums">{p.stock.toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.baseUnit}
                    {p.stock > 0 && p.safetyStock > 0 && p.stock <= p.safetyStock && <span className="ml-1 text-amber-700">부족</span>}
                    {p.stock === 0 && <span className="ml-1 text-red-600">없음</span>}
                  </div>
                </div>
              </div>
              {p.boxQty > 1 && <div className="mt-1 text-xs text-muted-foreground">박스당 {p.boxQty.toLocaleString()}입</div>}
              <ul className="mt-3 flex flex-col divide-y rounded-lg border text-sm">
                {p.balances.length === 0 && <li className="p-2 text-muted-foreground">칸별 재고가 없습니다.</li>}
                {p.balances.map((b, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 p-2">
                    <span className="min-w-0">
                      <span className="font-medium">{b.locationCode ?? "위치 미지정"}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {b.expiryDate ? `유통기한 ${b.expiryDate}` : "유통기한 미상"}
                        {b.lotNo && ` · 로트 ${b.lotNo}`}
                      </span>
                    </span>
                    <span className="shrink-0 font-semibold tabular-nums">{b.quantity.toLocaleString()}</span>
                  </li>
                ))}
              </ul>
              {p.defaultLocation && <div className="mt-2 text-xs text-muted-foreground">기본 보관위치 {p.defaultLocation}</div>}
            </section>
          ))}
        </div>
      )}
    </>
  );
}
