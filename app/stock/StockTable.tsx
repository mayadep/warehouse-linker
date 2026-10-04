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
  /** 헤더에서 창고를 골랐을 때 그 창고 칸의 재고 합계 (전체 창고면 null) */
  warehouseStock: number | null;
  /** 재고가 남은 칸 중 가장 빠른 유통기한 (없으면 null) */
  nearestExpiry: { date: string; state: "EXPIRED" | "SOON" | "OK"; days: number } | null;
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
function boxText(r: StockRow, qty: number): string | null {
  if (r.baseUnit === "BOX" || r.boxQty <= 1 || qty <= 0) return null;
  const boxes = Math.floor(qty / r.boxQty);
  const rest = qty % r.boxQty;
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
            <th>유통기한</th>
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
              <td colSpan={showPrice ? 13 : 11} className="p-0">
                <EmptyState icon={SearchXIcon} title="조건에 맞는 상품이 없습니다." description="검색어나 상태 조건을 바꿔 보세요." />
              </td>
            </tr>
          )}
          {rows.map((r) => {
            const badge = STATUS_BADGE[r.status];
            const qty = r.warehouseStock ?? r.stock;
            const box = boxText(r, qty);
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
                <td className="whitespace-nowrap tabular-nums">
                  {r.nearestExpiry ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span className={r.nearestExpiry.state === "OK" ? "text-muted-foreground" : ""}>{r.nearestExpiry.date}</span>
                      {r.nearestExpiry.state === "EXPIRED" && <Badge variant="red">만료</Badge>}
                      {r.nearestExpiry.state === "SOON" && (
                        <Badge variant="amber">{r.nearestExpiry.days === 0 ? "D-day" : `D-${r.nearestExpiry.days}`}</Badge>
                      )}
                    </span>
                  ) : (
                    "-"
                  )}
                </td>
                <td>{r.baseUnit}</td>
                <td className="num whitespace-nowrap font-medium">
                  {qty.toLocaleString()}
                  {box && <span className="ml-1 text-xs font-normal text-muted-foreground">({box})</span>}
                  {r.warehouseStock !== null && r.warehouseStock !== r.stock && (
                    <span className="block text-xs font-normal text-muted-foreground">전체 {r.stock.toLocaleString()}</span>
                  )}
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
