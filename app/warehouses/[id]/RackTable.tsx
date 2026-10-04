"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { locationCode, rackCode } from "@/modules/warehouse/codes";
import EmptyState from "@/components/EmptyState";
import { WarehouseIcon } from "lucide-react";
import ActiveToggleButton from "../ActiveToggleButton";
import type { ActiveActionState } from "@/modules/warehouse/actions";

export type OccupiedCell = { code: string; rackId: string; sku: string; name: string };
/** 칸에 있는 상품별 재고 (유통기한 합산) */
export type CellStock = { sku: string; name: string; quantity: number; unit: string };

export type RackRow = {
  id: string;
  number: number;
  levels: number;
  binsPerLevel: number;
  locationCount: number;
  isActive: boolean;
};

/** 랙 배치도: 위가 높은 단, 왼쪽부터 구획 1 */
function RackLayout({
  warehouseCode,
  rack,
  occupied,
  stockByCode,
}: {
  warehouseCode: string;
  rack: RackRow;
  occupied: Map<string, OccupiedCell>;
  stockByCode: Record<string, CellStock[]>;
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
                const stocks = stockByCode[code] ?? [];
                // 대표 수량: 배정 상품의 재고, 배정이 없으면 첫 상품
                const main = (item && stocks.find((s) => s.sku === item.sku)) ?? (item ? null : stocks[0] ?? null);
                const others = stocks.length - (main ? 1 : 0);
                const name = item?.name ?? main?.name;
                const title = [
                  item ? `배정: [${item.sku}] ${item.name}` : "배정 상품 없음",
                  ...stocks.map((s) => `[${s.sku}] ${s.name} ${s.quantity.toLocaleString()}${s.unit}`),
                ].join("\n");
                return (
                  <td
                    key={b}
                    title={title}
                    className={`border border-gray-300 px-1 py-2 ${item ? "bg-indigo-50" : "bg-gray-50"}`}
                  >
                    <span className="block font-mono text-[11px] text-gray-500">{code}</span>
                    <span className={`block truncate ${name ? "font-medium text-indigo-800" : "text-gray-300"}`}>
                      {name ?? "비어 있음"}
                    </span>
                    {(item || stocks.length > 0) && (
                      <span className={`block truncate tabular-nums ${main ? "text-gray-700" : "text-gray-400"}`}>
                        {main ? `${main.quantity.toLocaleString()}${main.unit}` : "재고 0"}
                        {others > 0 && <span className="text-amber-700"> 외 {others}종</span>}
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-gray-400">맨 아래가 1단, 왼쪽부터 1구획입니다. 파란 칸은 상품이 배정된 위치이고, 수량은 그 칸의 현재 재고입니다. &apos;외 N종&apos;은 다른 상품 재고도 있다는 뜻이며, 칸에 마우스를 올리면 전체 목록이 보입니다.</p>
    </div>
  );
}

export default function RackTable({
  warehouseCode,
  warehouseActive,
  racks,
  occupied,
  stockByCode,
}: {
  warehouseCode: string;
  warehouseActive: boolean;
  racks: RackRow[];
  occupied: OccupiedCell[];
  stockByCode: Record<string, CellStock[]>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [result, setResult] = useState<ActiveActionState | null>(null);
  const open = racks.find((r) => r.id === openId) ?? null;
  const byCode = useMemo(() => new Map(occupied.map((o) => [o.code, o])), [occupied]);
  const usedByRack = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of occupied) m.set(o.rackId, (m.get(o.rackId) ?? 0) + 1);
    return m;
  }, [occupied]);

  return (
    <>
      {result && result.status !== "idle" && (
        <p aria-live="polite" className={`mb-2 text-sm ${result.status === "success" ? "text-green-700" : "text-red-700"}`}>
          {result.message}
        </p>
      )}
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
            <th>상태</th>
          </tr>
        </thead>
        <tbody>
          {racks.length === 0 && (
            <tr>
              <td colSpan={8} className="p-0">
                <EmptyState icon={WarehouseIcon} title="랙이 없습니다." description="[+ 랙 추가]로 랙을 만들면 보관 위치가 생성됩니다." />
              </td>
            </tr>
          )}
          {racks.map((r) => (
            <tr
              key={r.id}
              onClick={() => setOpenId(r.id)}
              className={`cursor-pointer hover:bg-indigo-50 ${r.isActive && warehouseActive ? "" : "text-gray-400"}`}
            >
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
              <td>
                <span className="inline-flex items-center justify-center gap-2">
                  <span className={r.isActive ? "text-green-700" : "text-gray-400"}>{r.isActive ? "사용" : "비활성"}</span>
                  <ActiveToggleButton
                    target="rack"
                    id={r.id}
                    label={`${warehouseCode} ${rackCode(r.number)}`}
                    isActive={r.isActive}
                    size="xs"
                    onResult={setResult}
                  />
                </span>
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
          <RackLayout warehouseCode={warehouseCode} rack={open} occupied={byCode} stockByCode={stockByCode} />
        </Modal>
      )}
    </>
  );
}
