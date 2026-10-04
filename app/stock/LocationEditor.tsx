"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import {
  changeProductLocationAction,
  getRacksForPickerAction,
  type LocationChangeActionState,
  type RackPickerData,
} from "@/modules/warehouse/actions";
import { STORAGE_TYPE_LABELS, locationCode, rackCode, type StorageTypeCode } from "@/modules/warehouse/codes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
export type WarehouseOption = { id: string; code: string; name: string; storageType: StorageTypeCode; isActive: boolean };

const initialState: LocationChangeActionState = { status: "idle", message: "" };
const sel = "";

/** 보관위치 변경: 창고 → 랙 → 단 → 구획 선택 후 변경 (교환·유형 경고는 서버가 확인 요청) */
export default function LocationEditor({
  productId,
  locationId,
  locationCode: currentCode,
  warehouses,
  onChanged,
}: {
  productId: string;
  locationId: string | null;
  locationCode: string | null;
  warehouses: WarehouseOption[];
  onChanged: () => void;
}) {
  const [state, formAction, pending] = useActionState(changeProductLocationAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const [whId, setWhId] = useState("");
  const [picker, setPicker] = useState<RackPickerData | null>(null);
  const [rackNo, setRackNo] = useState("");
  const [level, setLevel] = useState("");
  const [bin, setBin] = useState("");
  const [loadingRacks, setLoadingRacks] = useState(false);
  // 확인 요청을 받은 대상 위치 (선택을 바꾸면 그 확인은 무효)
  const [submittedTarget, setSubmittedTarget] = useState("");

  // 성공 시 선택 초기화 + 원장/이력 다시 불러오기
  const [handledTs, setHandledTs] = useState<number | undefined>();
  if (state.status === "success" && state.ts !== handledTs) {
    setHandledTs(state.ts);
    setRackNo("");
    setLevel("");
    setBin("");
  }
  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
      onChanged();
    }
  }, [state, onChanged]);

  function onWarehouse(id: string) {
    setWhId(id);
    setRackNo("");
    setLevel("");
    setBin("");
    setPicker(null);
    if (!id) return;
    setLoadingRacks(true);
    getRacksForPickerAction(id).then((r) => {
      setPicker(r);
      setLoadingRacks(false);
    });
  }

  const wh = warehouses.find((w) => w.id === whId);
  const racks = picker?.ok ? picker.racks : [];
  const rack = racks.find((r) => String(r.number) === rackNo);
  const target = wh && rack && level && bin ? locationCode(wh.code, rack.number, Number(level), Number(bin)) : "";
  const occupant = target && picker?.ok ? picker.occupied[target] : undefined;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const submitter = (e.nativeEvent as SubmitEvent).submitter;
    const fd = new FormData(e.currentTarget, submitter);
    setSubmittedTarget(String(fd.get("targetCode") ?? ""));
    startTransition(() => formAction(fd));
  }

  return (
    <form ref={formRef} onSubmit={submit} noValidate className="flex flex-col gap-2 rounded bg-gray-50 p-3 text-sm">
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="expectedLocationId" value={locationId ?? ""} />
      <input type="hidden" name="targetCode" value={target} />
      <input type="hidden" name="expectedOccupantId" value={state.status === "confirm" ? state.occupantId ?? "" : ""} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">보관위치</span>
        <span className="rounded bg-card px-2 py-0.5 font-mono">{currentCode ?? "없음"}</span>
        <span className="text-gray-400">→</span>
        <NativeSelect aria-label="창고" className={sel} value={whId} onChange={(e) => onWarehouse(e.target.value)}>
          <option value="">창고</option>
          {warehouses.filter((w) => w.isActive).map((w) => (
            <option key={w.id} value={w.id}>
              {w.code} {w.name} ({STORAGE_TYPE_LABELS[w.storageType]})
            </option>
          ))}
        </NativeSelect>
        <NativeSelect
          aria-label="랙"
          className={sel}
          value={rackNo}
          disabled={!picker?.ok || loadingRacks}
          onChange={(e) => {
            setRackNo(e.target.value);
            setLevel("");
            setBin("");
          }}>
          <option value="">{loadingRacks ? "불러오는 중" : "랙"}</option>
          {racks.map((r) => (
            <option key={r.number} value={r.number}>
              {rackCode(r.number)}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect aria-label="단" className={sel} value={level} disabled={!rack} onChange={(e) => setLevel(e.target.value)}>
          <option value="">단</option>
          {rack &&
            Array.from({ length: rack.levels }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}단
              </option>
            ))}
        </NativeSelect>
        <NativeSelect aria-label="구획" className={sel} value={bin} disabled={!rack || !level} onChange={(e) => setBin(e.target.value)}>
          <option value="">구획</option>
          {rack &&
            level &&
            Array.from({ length: rack.binsPerLevel }, (_, i) => i + 1).map((n) => {
              const code = wh ? locationCode(wh.code, rack.number, Number(level), n) : "";
              const who = picker?.ok ? picker.occupied[code] : undefined;
              return (
                <option key={n} value={n}>
                  {n}구획{who ? ` (${who})` : " (빈 칸)"}
                </option>
              );
            })}
        </NativeSelect>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {target && (
          <span className="font-mono text-xs text-gray-600">
            {target}
            {occupant ? <span className="ml-1 text-amber-700">· {occupant} 있음 (교환)</span> : <span className="ml-1 text-green-700">· 빈 칸</span>}
          </span>
        )}
        <Input className="w-48 text-sm h-8" name="reason" maxLength={200} placeholder="사유 (선택)" />
        <Button size="sm" type="submit"
          name="mode"
          value="set"
          disabled={pending || !target}>
          {pending ? "처리 중..." : "위치 변경"}
        </Button>
        {locationId && (
          <Button variant="outline" size="sm" type="submit" name="mode" value="clear" disabled={pending}>
            위치 해제
          </Button>
        )}
      </div>

      {state.status === "confirm" && submittedTarget === target && (
        <div aria-live="polite" className="rounded border border-amber-300 bg-amber-50 p-2 text-amber-900">
          <ul className="list-disc pl-5">
            {state.warnings?.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
          <button
            name="mode"
            value="set-confirmed"
            disabled={pending}
            className="mt-2 rounded-[6px] bg-amber-600 px-3 py-1 text-white hover:bg-amber-500 disabled:bg-gray-400"
          >
            확인하고 변경
          </button>
        </div>
      )}
      {(state.status === "success" || state.status === "error") && (
        <p aria-live="polite" className={`text-xs ${state.status === "success" ? "text-green-700" : "text-red-600"}`}>
          {state.message}
        </p>
      )}
    </form>
  );
}
