"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
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

const STATUS_BADGE: Record<StockRow["status"], { label: string; tone: "red" | "amber" | "green" }> = {
  OUT: { label: "재고 없음", tone: "red" },
  LOW: { label: "부족", tone: "amber" },
  OK: { label: "정상", tone: "green" },
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
      <div className="overflow-x-auto rounded-lg border">
<table className="w-full text-center text-sm tabular-nums [&_td]:whitespace-nowrap [&_td]:px-3 [&_td]:py-2.5 [&_th]:whitespace-nowrap [&_th]:px-3">
        <thead>
          <tr className="border-b bg-muted/60 text-xs font-medium text-muted-foreground">
            <th className="py-2.5">코드</th>
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
              <td colSpan={12} className="!py-10 text-muted-foreground">
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
                className={`cursor-pointer border-b transition-colors last:border-b-0 hover:bg-indigo-50 ${r.status === "OUT" ? "bg-red-50/40" : r.status === "LOW" ? "bg-amber-50/40" : ""}`}
              >
                <td className="font-mono text-xs text-muted-foreground">{r.sku}</td>
                <td>
                  <button
                    type="button"
                    className="font-medium text-indigo-700 hover:underline"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenId(r.id);
                    }}
                  >
                    {r.name}
                  </button>
                </td>
                <td>{r.category}</td>
                <td className="whitespace-nowrap font-mono text-xs text-muted-foreground">{r.locationCode ?? "-"}</td>
                <td>{r.baseUnit}</td>
                <td className="whitespace-nowrap font-medium">
                  {r.stock.toLocaleString()}
                  {box && <span className="ml-1 text-xs font-normal text-muted-foreground">({box})</span>}
                </td>
                <td>{r.safetyStock ? r.safetyStock.toLocaleString() : "-"}</td>
                <td>
                  <Badge variant={badge.tone}>{badge.label}</Badge>
                </td>
                <td>{r.price.toLocaleString()}</td>
                <td>{r.stockValue.toLocaleString()}</td>
                <td className="whitespace-nowrap text-muted-foreground">{r.lastInboundText ?? "-"}</td>
                <td className="whitespace-nowrap text-muted-foreground">{r.lastOutboundText ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {open && (
        <StockLedgerDialog key={open.id} row={open} warehouses={warehouses} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}
