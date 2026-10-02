"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import StockLedgerDialog from "./StockLedgerDialog";
import type { WarehouseOption } from "./LocationEditor";
import EmptyState from "@/components/EmptyState";
import { SearchXIcon } from "lucide-react";

export type StockRow = {
  id: string;
  sku: string;
  name: string;
  category: string;
  locationId: string | null;
  locationCode: string | null;
  baseUnit: string;
  boxQty: number;
  price: number | null; // 금액 권한이 없으면 null
  stock: number;
  safetyStock: number;
  status: "OUT" | "LOW" | "OK";
  stockValue: number | null;
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

export default function StockTable({
  rows,
  warehouses,
  showPrice,
  canEdit,
}: {
  rows: StockRow[];
  warehouses: WarehouseOption[];
  showPrice: boolean;
  canEdit: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = rows.find((r) => r.id === openId) ?? null;

  return (
    <>
      <div className="max-h-[70vh] overflow-auto rounded-lg border">
<table className="data-table [&_td]:whitespace-nowrap">
        <thead>
          <tr>
            <th className="left">코드</th>
            <th className="left">품명</th>
            <th>분류</th>
            <th>위치</th>
            <th>단위</th>
            <th className="num">현재고</th>
            <th className="num">안전재고</th>
            <th>상태</th>
            {showPrice && <th className="num">판매가</th>}
            {showPrice && <th className="num">재고금액</th>}
            <th>최근 입고</th>
            <th>최근 출고</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={showPrice ? 12 : 10} className="p-0">
                <EmptyState icon={SearchXIcon} title="조건에 맞는 상품이 없습니다." description="검색어나 상태 조건을 바꿔 보세요." />
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
                <td className="left font-mono text-xs text-muted-foreground">{r.sku}</td>
                <td className="left">
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
                <td className="num whitespace-nowrap font-medium">
                  {r.stock.toLocaleString()}
                  {box && <span className="ml-1 text-xs font-normal text-muted-foreground">({box})</span>}
                </td>
                <td className="num">{r.safetyStock ? r.safetyStock.toLocaleString() : "-"}</td>
                <td>
                  <Badge variant={badge.tone}>{badge.label}</Badge>
                </td>
                {showPrice && <td className="num">{r.price?.toLocaleString() ?? "-"}</td>}
                {showPrice && <td className="num">{r.stockValue?.toLocaleString() ?? "-"}</td>}
                <td className="whitespace-nowrap text-muted-foreground">{r.lastInboundText ?? "-"}</td>
                <td className="whitespace-nowrap text-muted-foreground">{r.lastOutboundText ?? "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>

      {open && (
        <StockLedgerDialog key={open.id} row={open} warehouses={warehouses} canEdit={canEdit} onClose={() => setOpenId(null)} />
      )}
    </>
  );
}
