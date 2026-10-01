"use client";

import { useState } from "react";
import StockLedgerDialog from "./StockLedgerDialog";
import type { WarehouseOption } from "./LocationEditor";

export type StockRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  locationId: string | null;
  locationCode: string | null;
  baseUnit: string;
  boxQty: number;
  price: number;
  stock: number;
  safetyStock: number;
  status: "OUT" | "LOW" | "OK";
  stockValue: number;
  lastInboundText: string | null;
  lastOutboundText: string | null;
};

const STATUS_BADGE: Record<StockRow["status"], { label: string; cls: string }> = {
  OUT: { label: "재고 없음", cls: "bg-red-100 text-red-700" },
  LOW: { label: "부족", cls: "bg-amber-100 text-amber-800" },
  OK: { label: "정상", cls: "bg-green-50 text-green-700" },
};

/** 36EA, 입수 20 → "1박스+16" */
function boxText(r: StockRow): string | null {
  if (r.baseUnit === "BOX" || r.boxQty <= 1 || r.stock <= 0) return null;
  const boxes = Math.floor(r.stock / r.boxQty);
  const rest = r.stock % r.boxQty;
  if (boxes === 0) return null;
  return rest ? `${boxes}박스+${rest}` : `${boxes}박스`;
}

export default function StockTable({ rows, warehouses }: { rows: StockRow[]; warehouses: WarehouseOption[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.id === openId) ?? null;

  return (
    <>
      <table className="w-full text-center text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">코드</th>
            <th>품명</th>
            <th>분류</th>
            <th>위치</th>
            <th>단위</th>
            <th>현재고</th>
            <th>안전재고</th>
            <th>상태</th>
            <th>판매가</th>
            <th>재고금액</th>
            <th>최근 입고</th>
            <th>최근 출고</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={12} className="py-6 text-gray-400">
                조건에 맞는 상품이 없습니다.
              </td>
            </tr>
          )}
          {rows.map((r) => {
            const badge = STATUS_BADGE[r.status];
            const box = boxText(r);
            return (
              <tr
                key={r.id}
                onClick={() => setOpenId(r.id)}
                className={`cursor-pointer border-b hover:bg-blue-50 ${r.status === "OUT" ? "bg-red-50/40" : r.status === "LOW" ? "bg-amber-50/40" : ""}`}
              >
                <td className="py-2">{r.sku}</td>
                <td>
                  <button
                    type="button"
                    className="text-blue-700 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenId(r.id);
                    }}
                  >
                    {r.name}
                  </button>
                </td>
                <td>{r.category}</td>
                <td className="whitespace-nowrap font-mono text-xs text-gray-600">{r.locationCode ?? "-"}</td>
                <td>{r.baseUnit}</td>
                <td className="whitespace-nowrap font-medium">
                  {r.stock.toLocaleString()}
                  {box && <span className="ml-1 text-xs font-normal text-gray-400">({box})</span>}
                </td>
                <td>{r.safetyStock ? r.safetyStock.toLocaleString() : "-"}</td>
                <td>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${badge.cls}`}>{badge.label}</span>
                </td>
                <td>{r.price.toLocaleString()}</td>
                <td>{r.stockValue.toLocaleString()}</td>
                <td className="whitespace-nowrap text-gray-500">{r.lastInboundText ?? "-"}</td>
                <td className="whitespace-nowrap text-gray-500">{r.lastOutboundText ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {open && (
        <StockLedgerDialog key={open.id} row={open} warehouses={warehouses} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}
