"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import { saveCountAction, type CountActionState } from "@/modules/cyclecount/actions";
import { lookupBarcodeAction } from "@/modules/product/actions";
import BarcodeScanButton from "@/components/BarcodeScanButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Line = {
  id: string;
  sku: string;
  name: string;
  baseUnit: string;
  locationCode: string | null;
  expiryDate: string | null;
  lotNo: string | null;
  bookQty: number;
  currentQty: number | null;
  countedQty: number | null;
};

const initialState: CountActionState = { status: "idle", message: "" };
const PAGE = 30;

/** 현장 실사: 위치(또는 상품)를 스캔하면 그 줄만 카드로 보여주고, 수량을 입력하면 바로 저장 */
export default function MobileCount({ lines }: { lines: Line[] }) {
  const [filter, setFilter] = useState("");
  const [scanValue, setScanValue] = useState("");
  const [onlyTodo, setOnlyTodo] = useState(true);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [, saveAction, saving] = useActionState(async (prev: CountActionState, fd: FormData) => {
    const r = await saveCountAction(prev, fd);
    setMsg({ ok: r.status === "success", text: r.status === "success" ? "저장했습니다." : r.message });
    return r;
  }, initialState);

  const rawOf = (l: Line) => inputs[l.id] ?? (l.countedQty === null ? "" : String(l.countedQty));
  const countedNow = lines.filter((l) => rawOf(l) !== "").length;

  const visible = useMemo(() => {
    const k = filter.trim().toLowerCase();
    return lines.filter((l) => {
      if (k && ![l.sku, l.name, l.locationCode ?? "", l.lotNo ?? ""].some((v) => v.toLowerCase().includes(k))) return false;
      return !(onlyTodo && l.countedQty !== null);
    });
  }, [lines, filter, onlyTodo]);

  function save(l: Line, raw: string) {
    if (raw === (l.countedQty === null ? "" : String(l.countedQty))) return;
    const fd = new FormData();
    fd.set("lineId", l.id);
    fd.set("countedQty", raw);
    startTransition(() => saveAction(fd));
  }

  async function onScan(code: string) {
    const c = code.trim();
    if (!c) return;
    const hit = await lookupBarcodeAction(c);
    setFilter(hit ? hit.sku : c);
    setScanValue("");
  }

  return (
    <>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          onScan(scanValue);
        }}
      >
        <Input
          value={scanValue}
          onChange={(e) => setScanValue(e.target.value)}
          placeholder="위치·상품 바코드 스캔"
          className="h-12 flex-1 text-base"
          autoFocus
          autoComplete="off"
        />
        <Button type="submit" className="h-12 px-5">
          찾기
        </Button>
      </form>
      <BarcodeScanButton onScan={onScan} label="카메라로 스캔" />
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} className="size-4" />
          아직 안 센 줄만
        </label>
        <span className="tabular-nums text-muted-foreground">
          {countedNow.toLocaleString()} / {lines.length.toLocaleString()}
        </span>
      </div>
      {filter && (
        <button type="button" onClick={() => setFilter("")} className="self-start rounded-md bg-muted px-3 py-1 text-sm">
          필터: {filter} ✕
        </button>
      )}
      {msg && (
        <p aria-live="polite" className={`text-sm ${msg.ok ? "text-green-700" : "text-red-600"}`}>
          {msg.text}
        </p>
      )}
      {visible.length === 0 && (
        <p className="text-sm text-muted-foreground">표시할 줄이 없습니다. 필터를 지우거나 [아직 안 센 줄만]을 해제하세요.</p>
      )}
      <ul className="flex flex-col gap-3">
        {visible.slice(0, PAGE).map((l) => {
          const raw = rawOf(l);
          const base = l.currentQty ?? l.bookQty;
          const diff = raw === "" ? null : Number(raw) - base;
          return (
            <li key={l.id} className="rounded-xl border bg-card p-4">
              <div className="text-sm font-semibold text-primary">{l.locationCode ?? "위치 미지정"}</div>
              <div className="mt-1 text-base font-medium">
                [{l.sku}] {l.name}
              </div>
              <div className="text-xs text-muted-foreground">
                {l.expiryDate ? `유통기한 ${l.expiryDate}` : "유통기한 미상"}
                {l.lotNo && ` · 로트 ${l.lotNo}`}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="text-sm">
                  장부 <span className="text-lg font-bold tabular-nums">{base.toLocaleString()}</span>
                  <span className="ml-1 text-xs text-muted-foreground">{l.baseUnit}</span>
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  aria-label={`${l.sku} 실사 수량`}
                  placeholder="실사"
                  value={raw}
                  onChange={(e) => setInputs((p) => ({ ...p, [l.id]: e.target.value }))}
                  onBlur={() => save(l, raw)}
                  className="h-12 flex-1 text-right text-lg tabular-nums"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-12"
                  disabled={saving}
                  onClick={() => {
                    setInputs((p) => ({ ...p, [l.id]: String(base) }));
                    save(l, String(base));
                  }}
                >
                  일치
                </Button>
              </div>
              {diff !== null && diff !== 0 && (
                <div className={`mt-2 text-sm font-medium ${diff > 0 ? "text-blue-700" : "text-red-600"}`}>
                  차이 {diff > 0 ? "+" : ""}
                  {diff.toLocaleString()}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {visible.length > PAGE && (
        <p className="text-center text-xs text-muted-foreground">{PAGE}줄까지 표시합니다. 위치를 스캔해 범위를 좁히세요.</p>
      )}
      <p className="text-xs text-muted-foreground">실사 확정은 관리자가 PC 화면에서 합니다.</p>
    </>
  );
}
