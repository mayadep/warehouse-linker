"use client";

import { STORAGE_TYPE_LABELS, type StorageTypeCode } from "@/modules/warehouse/codes";
import { canCarry } from "@/modules/dispatch/codes";

export type OutboundOption = {
  id: string;
  shippedAtText: string;
  customer: string | null;
  sku: string;
  name: string;
  quantity: number;
  baseUnit: string;
  required: StorageTypeCode;
};

/** 배차할 출고 건 선택 (차량 온도 등급에 안 맞는 건은 선택 불가) */
export default function OutboundPicker({
  options,
  vehicleType,
  selected,
  onChange,
}: {
  options: OutboundOption[];
  vehicleType: StorageTypeCode | null;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const ok = (o: OutboundOption) => !vehicleType || canCarry(vehicleType, o.required);
  const selectable = options.filter(ok);
  const all = selectable.length > 0 && selectable.every((o) => selected.includes(o.id));

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  if (options.length === 0) {
    return <p className="rounded bg-gray-50 p-4 text-center text-sm text-gray-400">배차할 출고 건이 없습니다. (최근 14일, 미배차)</p>;
  }

  return (
    <div className="max-h-72 overflow-auto rounded-lg border">
      <table className="data-table">
        <thead>
          <tr>
            <th className="w-8">
              <input
                type="checkbox"
                aria-label="전체 선택"
                checked={all}
                disabled={selectable.length === 0}
                onChange={() => onChange(all ? [] : selectable.map((o) => o.id))}
              />
            </th>
            <th>출고일시</th>
            <th>출고처</th>
            <th>품목</th>
            <th className="num">수량</th>
            <th>보관</th>
          </tr>
        </thead>
        <tbody>
          {options.map((o) => {
            const can = ok(o);
            return (
              <tr key={o.id} className={`${can ? "" : "bg-gray-50 text-gray-400"} ${selected.includes(o.id) ? "bg-indigo-50" : ""}`}>
                <td>
                  <input type="checkbox" aria-label={`${o.name} 선택`} disabled={!can} checked={selected.includes(o.id)} onChange={() => toggle(o.id)} />
                </td>
                <td className="whitespace-nowrap text-xs">{o.shippedAtText}</td>
                <td>{o.customer ?? "-"}</td>
                <td className="text-left">
                  <span className="font-mono text-xs text-gray-500">{o.sku}</span> {o.name}
                </td>
                <td className="num whitespace-nowrap">
                  {o.quantity.toLocaleString()} {o.baseUnit}
                </td>
                <td className="text-xs" title={can ? "" : "이 차량 온도로는 실을 수 없습니다"}>
                  {STORAGE_TYPE_LABELS[o.required]}
                  {!can && " ✕"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
