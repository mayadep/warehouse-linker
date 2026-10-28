"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adjustStockAction,
  listAdjustBucketsAction,
  searchAdjustProductsAction,
  type AdjustProductOption,
  type BalanceEntry,
  type SafetyStockActionState,
} from "@/modules/stock/actions";
import { ADJUST_MEMO_MAX, ADJUST_REASONS } from "@/modules/stock/codes";
import { newRequestId } from "@/lib/request-id";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

const initialState: SafetyStockActionState = { status: "idle", message: "" };
const NEW_BUCKET = "new";

/** 등록에 성공하면 key 를 바꿔 폼을 비우고 새 requestId 로 시작한다 */
export default function AdjustForm() {
  const [formKey, setFormKey] = useState(0);
  const [flash, setFlash] = useState("");
  return (
    <div>
      <AdjustFormBody
        key={formKey}
        onDone={(message) => {
          setFlash(message);
          setFormKey((n) => n + 1);
        }}
      />
      {flash && (
        <p aria-live="polite" className="mt-2 text-sm text-green-700">
          {flash}
        </p>
      )}
    </div>
  );
}

function AdjustFormBody({ onDone }: { onDone: (message: string) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<AdjustProductOption[]>([]);
  const [product, setProduct] = useState<AdjustProductOption | null>(null);
  const [buckets, setBuckets] = useState<BalanceEntry[]>([]);
  const [bucketIdx, setBucketIdx] = useState(""); // "" 미선택, 숫자 = buckets 인덱스, NEW_BUCKET = 새 칸
  const [reason, setReason] = useState("");
  const [state, formAction, pending] = useActionState(adjustStockAction, initialState);
  // 같은 폼의 재전송은 같은 requestId → 서버가 한 번만 반영
  const requestIdRef = useRef<string | null>(null);

  // 선택됐거나 검색어가 비면 목록을 숨김 (state 는 다음 검색 때 덮어씀)
  const visibleOptions = product || !query.trim() ? [] : options;
  const isIncrease = ADJUST_REASONS.find((r) => r.value === reason)?.sign === 1;

  // 상품 검색 (입력 멈춘 뒤 조회)
  useEffect(() => {
    if (product || !query.trim()) return;
    let alive = true;
    const t = setTimeout(() => {
      searchAdjustProductsAction(query).then((r) => alive && setOptions(r));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [query, product]);

  useEffect(() => {
    if (state.status === "success") {
      router.refresh();
      onDone(state.message);
    }
  }, [state, onDone, router]);

  function pick(p: AdjustProductOption) {
    setProduct(p);
    setQuery(`[${p.sku}] ${p.name}`);
    setBucketIdx("");
    setBuckets([]);
    listAdjustBucketsAction(p.id).then((b) => {
      setBuckets(b);
      if (b.length === 1) setBucketIdx("0");
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    const b = bucketIdx !== "" && bucketIdx !== NEW_BUCKET ? buckets[Number(bucketIdx)] : null;
    if (b) {
      fd.set("locationId", b.locationId ?? "");
      fd.set("expiryDate", b.expiryDate ?? "");
    }
    requestIdRef.current ??= newRequestId();
    fd.set("requestId", requestIdRef.current);
    startTransition(() => formAction(fd));
  }

  const selected = bucketIdx !== "" && bucketIdx !== NEW_BUCKET ? buckets[Number(bucketIdx)] : null;

  return (
    <form onSubmit={onSubmit} noValidate className="rounded-xl border bg-card p-4">
      <input type="hidden" name="productId" value={product?.id ?? ""} />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="relative md:col-span-2">
          <label className="mb-1 block text-xs text-muted-foreground">상품</label>
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (product) {
                setProduct(null);
                setBuckets([]);
                setBucketIdx("");
              }
            }}
            placeholder="상품명 또는 코드 검색"
            autoComplete="off"
          />
          {visibleOptions.length > 0 && (
            <ul className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border bg-card shadow-card">
              {visibleOptions.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => pick(o)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
                  >
                    <span>
                      <span className="font-mono text-xs text-muted-foreground">{o.sku}</span> {o.name}
                    </span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      재고 {o.stock.toLocaleString()} {o.baseUnit}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-muted-foreground">칸 (위치 · 유통기한)</label>
          <NativeSelect
            value={bucketIdx}
            onChange={(e) => setBucketIdx(e.target.value)}
            disabled={!product}
            className="[&_select]:bg-card"
          >
            <option value="">{product ? "칸 선택" : "상품을 먼저 선택하세요"}</option>
            {buckets.map((b, i) => (
              <option key={`${b.locationId ?? ""}|${b.expiryDate ?? ""}`} value={String(i)}>
                {b.locationCode ?? "미지정"} · {b.expiryDate ?? "유통기한 미상"} · {b.quantity.toLocaleString()}{" "}
                {product?.baseUnit}
              </option>
            ))}
            {isIncrease && <option value={NEW_BUCKET}>새 칸 직접 지정 (위치코드 · 유통기한)</option>}
          </NativeSelect>
        </div>

        {bucketIdx === NEW_BUCKET && (
          <>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">위치코드 (비우면 미지정)</label>
              <Input name="locationCode" maxLength={30} placeholder="예: RF1-R01-2-3" className="font-mono uppercase" />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-xs text-muted-foreground">유통기한 (비우면 미상)</label>
              <Input name="expiryDate" type="date" />
            </div>
          </>
        )}

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">사유</label>
          <NativeSelect
            name="reason"
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              // 감소 사유로 바꾸면 새 칸 지정은 불가
              if (ADJUST_REASONS.find((r) => r.value === e.target.value)?.sign === -1 && bucketIdx === NEW_BUCKET)
                setBucketIdx("");
            }}
            className="[&_select]:bg-card"
          >
            <option value="" disabled>
              선택
            </option>
            {ADJUST_REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {r.sign > 0 ? "＋ " : "－ "}
                {r.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">
            수량{selected ? ` (칸 재고 ${selected.quantity.toLocaleString()} ${product?.baseUnit})` : ""}
          </label>
          <Input name="quantity" type="number" min={1} step={1} defaultValue={1} className="text-right tabular-nums" />
        </div>
        <div className="md:col-span-2">
          <label className="mb-1 block text-xs text-muted-foreground">메모 (기타 사유는 필수)</label>
          <Input name="memo" maxLength={ADJUST_MEMO_MAX} placeholder="예: 냉장고 고장으로 변질" />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "처리 중..." : "조정 등록"}
        </Button>
        {state.status === "error" && (
          <span aria-live="polite" className="text-sm text-red-600">
            {state.message}
          </span>
        )}
      </div>
    </form>
  );
}
