"use client";

import { startTransition, useActionState, useMemo, useRef, useState } from "react";
import {
  addFoundAction,
  cancelCountAction,
  confirmCountAction,
  saveCountAction,
  type CountActionState,
} from "@/modules/cyclecount/actions";
import { lookupBarcodeAction } from "@/modules/product/actions";
import { COUNT_STATUS_LABELS, COUNT_STATUS_TONE } from "@/modules/cyclecount/codes";
import BarcodeScanButton from "@/components/BarcodeScanButton";
import Modal from "@/components/Modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type CountInfo = {
  id: string;
  countNo: string;
  status: "COUNTING" | "CONFIRMED" | "CANCELLED";
  scope: string;
  memo: string | null;
  version: number;
  createdByName: string | null;
  confirmedByName: string | null;
};

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
  appliedDelta: number | null;
};

const initialState: CountActionState = { status: "idle", message: "" };
const signed = (n: number) => (n > 0 ? `+${n.toLocaleString()}` : n.toLocaleString());

export default function CountSheet({ count, lines, canConfirm }: { count: CountInfo; lines: Line[]; canConfirm: boolean }) {
  const counting = count.status === "COUNTING";
  const [filter, setFilter] = useState("");
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [dialog, setDialog] = useState<"confirm" | "cancel" | "found" | null>(null);
  // 입력 중인 수량(저장 전 포함): lineId → 문자열
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [saveMsg, setSaveMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [saveState, saveAction] = useActionState(
    async (prev: CountActionState, fd: FormData) => {
      const r = await saveCountAction(prev, fd);
      setSaveMsg({ ok: r.status === "success", text: r.message });
      return r;
    },
    initialState
  );
  void saveState;

  const valueOf = (l: Line) => inputs[l.id] ?? (l.countedQty === null ? "" : String(l.countedQty));
  // 장부 기준 수량: 진행 중에는 지금 장부, 끝난 실사는 만들 때 장부
  const baseOf = (l: Line) => l.currentQty ?? l.bookQty;

  const visible = useMemo(() => {
    const k = filter.trim().toLowerCase();
    return lines.filter((l) => {
      if (k && ![l.sku, l.name, l.locationCode ?? "", l.lotNo ?? ""].some((v) => v.toLowerCase().includes(k))) return false;
      if (onlyDiff) {
        const raw = inputs[l.id] ?? (l.countedQty === null ? "" : String(l.countedQty));
        if (raw === "" || Number(raw) === (l.currentQty ?? l.bookQty)) return false;
      }
      return true;
    });
  }, [lines, filter, onlyDiff, inputs]);

  const stats = useMemo(() => {
    let counted = 0;
    let diffLines = 0;
    for (const l of lines) {
      const raw = inputs[l.id] ?? (l.countedQty === null ? "" : String(l.countedQty));
      if (raw === "") continue;
      counted++;
      if (Number(raw) !== (l.currentQty ?? l.bookQty)) diffLines++;
    }
    return { counted, diffLines };
  }, [lines, inputs]);

  function save(l: Line) {
    const raw = valueOf(l);
    const saved = l.countedQty === null ? "" : String(l.countedQty);
    if (raw === saved) return; // 바뀐 게 없으면 저장하지 않음
    const fd = new FormData();
    fd.set("lineId", l.id);
    fd.set("countedQty", raw);
    startTransition(() => saveAction(fd));
  }

  /** 스캔: 상품 바코드면 상품코드로, 아니면 위치코드·상품코드 그대로 필터 */
  async function onScan(raw: string) {
    const code = raw.trim();
    if (!code) return;
    const hit = await lookupBarcodeAction(code);
    setFilter(hit ? hit.sku : code);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border bg-card p-4 text-sm">
        <Badge variant={COUNT_STATUS_TONE[count.status]}>{COUNT_STATUS_LABELS[count.status]}</Badge>
        <span>범위 {count.scope}</span>
        <span className="text-gray-500">작성 {count.createdByName ?? "-"}</span>
        {count.confirmedByName && <span className="text-gray-500">확정 {count.confirmedByName}</span>}
        {count.memo && <span className="text-gray-500">메모 {count.memo}</span>}
        <span className="ml-auto tabular-nums">
          센 줄 {stats.counted.toLocaleString()} / {lines.length.toLocaleString()} · 차이 {stats.diffLines.toLocaleString()}줄
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onScan(filter);
            }
          }}
          placeholder="위치·상품 스캔 또는 검색 (코드·품명·로트)"
          className="w-72 text-sm"
          autoFocus={counting}
        />
        <BarcodeScanButton onScan={(c) => { setFilter(c); onScan(c); }} />
        <label className="flex items-center gap-1 text-sm text-gray-600">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
          차이 있는 줄만
        </label>
        <div className="ml-auto flex items-center gap-2">
          {counting && (
            <>
              <Button variant="outline" size="sm" onClick={() => setDialog("found")}>
                발견분 추가
              </Button>
              <Button variant="outline" size="sm" onClick={() => setDialog("cancel")}>
                실사 취소
              </Button>
              {canConfirm && (
                <Button size="sm" onClick={() => setDialog("confirm")}>
                  실사 확정
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {saveMsg && (
        <p aria-live="polite" className={`text-xs ${saveMsg.ok ? "text-green-700" : "text-red-600"}`}>
          {saveMsg.text}
        </p>
      )}

      <div className="max-h-[65vh] overflow-auto rounded-lg border">
        <table className="data-table">
          <thead>
            <tr>
              <th>위치</th>
              <th className="left">상품</th>
              <th>유통기한</th>
              <th>로트</th>
              <th className="num">{counting ? "장부(현재)" : "장부"}</th>
              <th className="num">실사</th>
              <th className="num">차이</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={7}>조건에 맞는 줄이 없습니다.</td>
              </tr>
            )}
            {visible.map((l) => {
              const raw = valueOf(l);
              const base = baseOf(l);
              const diff = raw === "" ? null : Number(raw) - base;
              const moved = counting && l.currentQty !== null && l.currentQty !== l.bookQty;
              return (
                <tr key={l.id}>
                  <td>{l.locationCode ?? "미지정"}</td>
                  <td className="left">
                    [{l.sku}] {l.name}
                  </td>
                  <td>{l.expiryDate ?? "-"}</td>
                  <td>{l.lotNo ?? "-"}</td>
                  <td className="num tabular-nums">
                    {base.toLocaleString()}
                    {moved && (
                      <span className="ml-1 text-xs text-amber-700" title={`실사표 작성 시점 ${l.bookQty.toLocaleString()}`}>
                        (변동)
                      </span>
                    )}
                  </td>
                  <td className="num">
                    {counting ? (
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        aria-label={`${l.sku} ${l.locationCode ?? "미지정"} 실사 수량`}
                        value={raw}
                        onChange={(e) => setInputs((p) => ({ ...p, [l.id]: e.target.value }))}
                        onBlur={() => save(l)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                        className="ml-auto w-24 text-right tabular-nums"
                      />
                    ) : l.countedQty === null ? (
                      "-"
                    ) : (
                      l.countedQty.toLocaleString()
                    )}
                  </td>
                  <td className={`num tabular-nums ${diff ? (diff > 0 ? "text-blue-700" : "text-red-600") : ""}`}>
                    {counting ? (diff === null ? "-" : signed(diff)) : l.appliedDelta === null ? "-" : signed(l.appliedDelta)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {dialog === "found" && <FoundDialog countId={count.id} onClose={() => setDialog(null)} />}
      {(dialog === "confirm" || dialog === "cancel") && (
        <TransitionDialog
          mode={dialog}
          count={count}
          uncounted={lines.length - stats.counted}
          diffLines={stats.diffLines}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function TransitionDialog({
  mode,
  count,
  uncounted,
  diffLines,
  onClose,
}: {
  mode: "confirm" | "cancel";
  count: CountInfo;
  uncounted: number;
  diffLines: number;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState(mode === "confirm" ? confirmCountAction : cancelCountAction, initialState);
  const confirm = mode === "confirm";
  return (
    <Modal title={confirm ? "재고 실사 확정" : "재고 실사 취소"} onClose={onClose} closeDisabled={pending}>
      {state.status === "success" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-green-700">{state.message}</p>
          <div className="flex justify-end">
            <Button onClick={onClose}>닫기</Button>
          </div>
        </div>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-4 text-left"
          onSubmit={(e) => {
            e.preventDefault();
            if (pending) return;
            startTransition(() => action(new FormData(e.currentTarget)));
          }}
        >
          <input type="hidden" name="countId" value={count.id} />
          <input type="hidden" name="version" value={count.version} />
          <p className="text-sm text-muted-foreground">
            {confirm
              ? `센 줄 중 장부와 다른 ${diffLines.toLocaleString()}줄을 재고조정(실사 증가/감소)으로 재고에 반영합니다. 아직 세지 않은 ${uncounted.toLocaleString()}줄은 반영하지 않습니다. 확정 후에는 되돌릴 수 없습니다.`
              : "실사를 취소하면 입력한 수량은 버려지고 재고는 바뀌지 않습니다."}
          </p>
          {state.status === "error" && (
            <p aria-live="polite" className="text-sm text-red-600">
              {state.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" type="button" onClick={onClose} disabled={pending}>
              닫기
            </Button>
            <Button type="submit" variant={confirm ? "default" : "destructive"} disabled={pending}>
              {pending ? "처리 중..." : confirm ? "확정" : "실사 취소"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function FoundDialog({ countId, onClose }: { countId: string; onClose: () => void }) {
  const [state, action, pending] = useActionState(addFoundAction, initialState);
  const [productKey, setProductKey] = useState("");
  const [locationCode, setLocationCode] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <Modal title="발견분 추가" onClose={onClose} closeDisabled={pending}>
      <form
        ref={formRef}
        noValidate
        className="flex flex-col gap-3 text-left"
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          startTransition(() => action(new FormData(e.currentTarget)));
        }}
      >
        <input type="hidden" name="countId" value={countId} />
        <p className="text-sm text-muted-foreground">실사표에 없던 재고를 찾았을 때 추가합니다. 장부 수량은 0으로 기록되고, 확정하면 입력한 수량만큼 늘어납니다.</p>
        <label className="text-sm">
          상품코드 또는 바코드
          <div className="flex gap-2">
            <Input name="productKey" value={productKey} onChange={(e) => setProductKey(e.target.value)} maxLength={40} className="w-full" autoFocus />
            <BarcodeScanButton onScan={setProductKey} label="카메라" />
          </div>
        </label>
        <label className="text-sm">
          위치코드
          <div className="flex gap-2">
            <Input name="locationCode" value={locationCode} onChange={(e) => setLocationCode(e.target.value)} maxLength={40} className="w-full uppercase" placeholder="예: RF1-R01-2-3" />
            <BarcodeScanButton onScan={setLocationCode} label="카메라" />
          </div>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            유통기한 (선택)
            <Input name="expiryDate" type="date" className="w-full" />
          </label>
          <label className="text-sm">
            수량
            <Input name="countedQty" type="number" min={1} step={1} className="w-full text-right tabular-nums" />
          </label>
        </div>
        {state.status !== "idle" && (
          <p aria-live="polite" className={`text-sm ${state.status === "error" ? "text-red-600" : "text-green-700"}`}>
            {state.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose} disabled={pending}>
            닫기
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "추가 중..." : "추가"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
