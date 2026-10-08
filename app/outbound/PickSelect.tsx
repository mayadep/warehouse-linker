"use client";

import { useEffect, useState } from "react";
import { getPickOptionsAction, type PickOption } from "@/modules/outbound/actions";
import { NativeSelect } from "@/components/ui/native-select";

const bucketLabel = (code: string | null, expiry: string | null) => `${code ?? "미지정"} · ${expiry ?? "유통기한 미상"}`;

/**
 * 출고 위치 선택: 기본 "자동"(선입선출: 입고일 오래된 순), 또는 칸 하나 지정 (그 칸에서만 출고, 모자라면 서버에서 거부)
 * 상품이 바뀌면 부모에서 key 를 바꿔 새로 만든다
 */
export default function PickSelect({
  productId,
  quantity,
  baseUnit,
  defaultValue = "",
  defaultLabel,
}: {
  productId: string;
  quantity: number;
  baseUnit?: string;
  /** 이미 지정된 칸 ("위치id|유통기한") */
  defaultValue?: string;
  /** 지정된 칸이 지금 목록에 없을 때(재고 0) 표시할 이름 */
  defaultLabel?: string;
}) {
  const [options, setOptions] = useState<PickOption[] | null>(null);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (!productId) return;
    let alive = true;
    getPickOptionsAction(productId).then((r) => {
      if (alive) setOptions(r ?? []);
    });
    return () => {
      alive = false;
    };
  }, [productId]);

  const chosen = options?.find((o) => o.value === value);
  const missingDefault = !!defaultValue && options !== null && !options.some((o) => o.value === defaultValue);
  const short = !!chosen && quantity > chosen.quantity;

  return (
    <>
      <NativeSelect
        name="pick"
        className="w-full"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={!productId || options === null}
      >
        <option value="">자동 (선입선출: 입고일 오래된 순)</option>
        {missingDefault && <option value={defaultValue}>{defaultLabel ?? "지정한 위치"} · 현재 재고 없음</option>}
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {bucketLabel(o.locationCode, o.expiryDate)} · {o.quantity.toLocaleString()}
            {baseUnit ? ` ${baseUnit}` : ""}
          </option>
        ))}
      </NativeSelect>
      {short && (
        <span className="mt-1 block text-xs text-red-600">
          선택한 위치의 재고({chosen.quantity.toLocaleString()})보다 많습니다.
        </span>
      )}
      {value && !short && (
        <span className="mt-1 block text-xs text-muted-foreground">이 위치에서만 출고합니다. 재고가 모자라면 처리되지 않습니다.</span>
      )}
    </>
  );
}

export { bucketLabel };
