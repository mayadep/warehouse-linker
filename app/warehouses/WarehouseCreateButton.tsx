"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import Modal from "@/components/Modal";
import { createWarehouseAction, type WarehouseActionState } from "@/modules/warehouse/actions";
import {
  STORAGE_TYPES,
  STORAGE_TYPE_LABELS,
  WAREHOUSE_LIMITS as L,
  defaultWarehouseName,
  locationCode,
  type StorageTypeCode,
} from "@/modules/warehouse/codes";

const initialState: WarehouseActionState = { status: "idle", message: "" };
const input = "w-full rounded border border-gray-300 px-3 py-2 text-sm";
const errText = "mt-1 block text-xs text-red-600";

function CreateForm({
  suggestions,
  onDone,
  onClose,
}: {
  suggestions: Record<StorageTypeCode, string>;
  onDone: (msg: string) => void;
  onClose: () => void;
}) {
  const [state, formAction, pending] = useActionState(createWarehouseAction, initialState);
  const [type, setType] = useState<StorageTypeCode>("REFRIGERATED");
  const [code, setCode] = useState(suggestions.REFRIGERATED);
  const [name, setName] = useState(defaultWarehouseName("REFRIGERATED", suggestions.REFRIGERATED));
  const [nameTouched, setNameTouched] = useState(false);
  const [rackCount, setRackCount] = useState("50");
  const [levels, setLevels] = useState(String(L.defaultLevels));
  const [bins, setBins] = useState(String(L.defaultBinsPerLevel));

  useEffect(() => {
    if (state.status === "success") onDone(state.message);
  }, [state, onDone]);

  function onType(t: StorageTypeCode) {
    setType(t);
    setCode(suggestions[t]);
    if (!nameTouched) setName(defaultWarehouseName(t, suggestions[t]));
  }
  function onCode(v: string) {
    const c = v.toUpperCase();
    setCode(c);
    if (!nameTouched) setName(defaultWarehouseName(type, c));
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  }

  const n = (s: string) => (/^\d+$/.test(s) ? Number(s) : 0);
  const total = n(rackCount) * n(levels) * n(bins);
  const err = state.status === "error" ? state.errors ?? {} : {};

  return (
    <Modal title="창고 추가" onClose={onClose} closeDisabled={pending}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <div className="flex gap-4">
          <label className="flex-1 text-sm">
            보관유형
            <select name="storageType" className={input} value={type} onChange={(e) => onType(e.target.value as StorageTypeCode)}>
              {STORAGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {STORAGE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
            {err.storageType && <span className={errText}>{err.storageType}</span>}
          </label>
          <label className="flex-1 text-sm">
            창고코드
            <input name="code" className={`${input} uppercase`} maxLength={L.maxCodeLength} value={code} onChange={(e) => onCode(e.target.value)} />
            {err.code && <span className={errText}>{err.code}</span>}
          </label>
        </div>
        <label className="text-sm">
          창고명
          <input
            name="name"
            className={input}
            maxLength={L.maxNameLength}
            value={name}
            onChange={(e) => {
              setNameTouched(true);
              setName(e.target.value);
            }}
          />
          {err.name && <span className={errText}>{err.name}</span>}
        </label>
        <div className="flex gap-4">
          <label className="flex-1 text-sm">
            처음 만들 랙 수
            <input name="rackCount" type="number" min={0} max={L.maxRackNumber} className={input} value={rackCount} onChange={(e) => setRackCount(e.target.value)} />
            {err.rackCount && <span className={errText}>{err.rackCount}</span>}
          </label>
          <label className="flex-1 text-sm">
            단 수
            <input name="levels" type="number" min={1} max={L.maxLevels} className={input} value={levels} onChange={(e) => setLevels(e.target.value)} />
            {err.levels && <span className={errText}>{err.levels}</span>}
          </label>
          <label className="flex-1 text-sm">
            단별 구획 수
            <input name="binsPerLevel" type="number" min={1} max={L.maxBinsPerLevel} className={input} value={bins} onChange={(e) => setBins(e.target.value)} />
            {err.binsPerLevel && <span className={errText}>{err.binsPerLevel}</span>}
          </label>
        </div>
        <label className="text-sm">
          비고 (선택)
          <input name="memo" maxLength={L.maxMemoLength} className={input} />
          {err.memo && <span className={errText}>{err.memo}</span>}
        </label>

        <p className="rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
          {n(rackCount) > 0 && code
            ? `랙 ${n(rackCount)}개 × ${n(levels)}단 × ${n(bins)}구획 = ${total.toLocaleString()}칸 · 위치코드 ${locationCode(code, 1, 1, 1)} ~ ${locationCode(code, n(rackCount), n(levels), n(bins))}`
            : "랙 없이 창고만 만듭니다. 랙은 나중에 창고 화면에서 추가할 수 있습니다."}
          {total > L.maxLocationsPerRequest && (
            <span className="block text-red-600">한 번에 {L.maxLocationsPerRequest.toLocaleString()}칸까지 만들 수 있습니다.</span>
          )}
        </p>

        {state.status === "error" && (
          <p aria-live="polite" className="text-sm text-red-600">
            {state.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100">
            취소
          </button>
          <button disabled={pending} className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-gray-400">
            {pending ? "생성 중..." : "창고 추가"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function WarehouseCreateButton({ suggestions }: { suggestions: Record<StorageTypeCode, string> }) {
  const [open, setOpen] = useState(false);
  const [flash, setFlash] = useState("");
  return (
    <>
      <div className="flex items-center gap-3">
        {flash && <span aria-live="polite" className="text-sm text-green-700">{flash}</span>}
        <button
          type="button"
          onClick={() => {
            setFlash("");
            setOpen(true);
          }}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
        >
          + 창고 추가
        </button>
      </div>
      {open && (
        <CreateForm
          suggestions={suggestions}
          onClose={() => setOpen(false)}
          onDone={(msg) => {
            setFlash(msg);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
