"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { locationCode, rackCode } from "@/modules/warehouse/codes";
import EmptyState from "@/components/EmptyState";
import { WarehouseIcon } from "lucide-react";

export type OccupiedCell = { code: string; rackId: string; sku: string; name: string };

export type RackRow = {
  id: string;
  number: number;
  levels: number;
  binsPerLevel: number;
  locationCount: number;
};

/** 랙 배치도: 위가 높은 단, 왼쪽부터 구획 1 */
function RackLayout({
  warehouseCode,
  rack,
  occupied,
}: {
  warehouseCode: string;
  rack: RackRow;
  occupied: Map<string, OccupiedCell>;
}) {
  const levels = Array.from({ length: rack.levels }, (_, i) => rack.levels - i);
  const bins = Array.from({ length: rack.binsPerLevel }, (_, i) => i + 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-center text-xs">
        <thead>
          <tr>
            <th className="w-12 py-1 text-gray-500">단</th>
            {bins.map((b) => (
              <th key={b} className="py-1 text-gray-500">
                {b}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {levels.map((lv) => (
            <tr key={lv}>
              <th className="py-1 text-gray-500">{lv}단</th>
              {bins.map((b) => {
                const code = locationCode(warehouseCode, rack.number, lv, b);
                const item = occupied.get(code);
                return (
                  <td
                    key={b}
                    title={item ? `[${item.sku}] ${item.name}` : "비어 있음"}
                    className={`border border-gray-300 px-1 py-2 ${item ? "bg-indigo-50" : "bg-gray-50"}`}
                  >
                    <span className="block font-mono text-[11px] text-gray-500">{code}</span>
                    <span className={`block truncate ${item ? "font-medium text-indigo-800" : "text-gray-300"}`}>
                      {item ? item.name : "비어 있음"}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-gray-400">맨 아래가 1단, 왼쪽부터 1구획입니다. 파란 칸은 상품이 배정된 위치입니다.</p>
    </div>
  );
}

export default function RackTable({
  warehouseCode,
  racks,
  occupied,
}: {
  warehouseCode: string;
  racks: RackRow[];
  occupied: OccupiedCell[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = racks.find((r) => r.id === openId) ?? null;
  const byCode = useMemo(() => new Map(occupied.map((o) => [o.code, o])), [occupied]);
  const usedByRack = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of occupied) m.set(o.rackId, (m.get(o.rackId) ?? 0) + 1);
    return m;
  }, [occupied]);

  return (
    <>
      <div className="max-h-[70vh] overflow-auto rounded-lg border">
<table className="data-table">
        <thead>
          <tr>
            <th className="left">랙</th>
            <th className="num">단 수</th>
            <th className="num">단별 구획</th>
            <th className="num">구획 수</th>
            <th className="num">상품 배정</th>
            <th className="left">위치코드 범위</th>
            <th>배치도</th>
          </tr>
        </thead>
        <tbody>
          {racks.length === 0 && (
            <tr>
              <td colSpan={7} className="p-0">
                <EmptyState icon={WarehouseIcon} title="랙이 없습니다." description="[+ 랙 추가]로 랙을 만들면 보관 위치가 생성됩니다." />
              </td>
            </tr>
          )}
          {racks.map((r) => (
            <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer hover:bg-indigo-50">
              <td className="left font-mono font-medium">{rackCode(r.number)}</td>
              <td className="num">{r.levels}</td>
              <td className="num">{r.binsPerLevel}</td>
              <td className="num">{r.locationCount.toLocaleString()}</td>
              <td className={`num ${usedByRack.get(r.id) ? "text-indigo-700" : "text-gray-400"}`}>
                {(usedByRack.get(r.id) ?? 0).toLocaleString()}
              </td>
              <td className="left font-mono text-gray-600">
                {locationCode(warehouseCode, r.number, 1, 1)} ~ {locationCode(warehouseCode, r.number, r.levels, r.binsPerLevel)}
              </td>
              <td>
                <button
                  type="button"
                  className="text-indigo-700 hover:underline"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenId(r.id);
                  }}
                >
                  보기
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
</div>

      {open && (
        <Modal
          key={open.id}
          title={`${warehouseCode} ${rackCode(open.number)} 배치도 (${open.levels}단 × ${open.binsPerLevel}구획)`}
          onClose={() => setOpenId(null)}
          maxWidth="max-w-4xl"
        >
          <RackLayout warehouseCode={warehouseCode} rack={open} occupied={byCode} />
        </Modal>
      )}
    </>
  );
}
