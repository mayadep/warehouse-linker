"use client";

import { useState } from "react";
import OutboundEditDialog from "./OutboundEditDialog";
import DevBadge from "@/components/DevBadge";

export type OutboundRevisionView = {
  createdAtText: string;
  reason: string;
  changesText: string;
};

/** 서버에서 직렬화해 넘기는 출고내역 1행 */
export type OutboundRow = {
  id: string;
  version: number;
  sku: string;
  productName: string;
  baseUnit: string;
  productStock: number;
  quantity: number;
  unitPrice: number | null;
  customer: string | null;
  memo: string | null;
  shippedAtText: string; // 표시용
  shippedAtInput: string; // datetime-local 값 (KST)
  originalMovement: { beforeStock: number; afterStock: number } | null;
  revisionCount: number;
  revisions: OutboundRevisionView[];
};

export default function OutboundTable({ rows }: { rows: OutboundRow[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [flash, setFlash] = useState("");

  // 목록이 갱신되어 사라진 행은 선택에서 제외
  const visibleSelected = rows.filter((r) => selected.has(r.id));
  const editing = rows.find((r) => r.id === editingId) ?? null;
  const allChecked = rows.length > 0 && visibleSelected.length === rows.length;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function openEdit() {
    if (visibleSelected.length !== 1) return;
    setFlash("");
    setEditingId(visibleSelected[0].id);
  }

  return (
    <div>
      <div className="mt-10 mb-2 flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500">
          최근 출고 내역 {rows.length}건
          {visibleSelected.length > 0 && ` · ${visibleSelected.length}건 선택`}
        </p>
        <div className="flex items-center gap-2">
          {visibleSelected.length > 1 && (
            <span className="text-xs text-gray-500">수정은 1건씩 가능합니다</span>
          )}
          <button
            type="button"
            onClick={openEdit}
            disabled={visibleSelected.length !== 1}
            className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
          >
            선택 수정
          </button>
          <button
            type="button"
            disabled
            title="출고 취소 기능은 개발 중입니다"
            className="flex cursor-not-allowed items-center gap-1 rounded border border-gray-200 px-3 py-1.5 text-sm text-gray-400"
          >
            선택 취소 <DevBadge />
          </button>
        </div>
      </div>

      {flash && (
        <p aria-live="polite" className="mb-2 text-sm text-green-700">
          {flash}
        </p>
      )}

      <table className="w-full text-center text-sm">
        <thead>
          <tr className="border-b">
            <th className="w-8 py-2">
              <input
                type="checkbox"
                aria-label="전체 선택"
                checked={allChecked}
                onChange={toggleAll}
                disabled={rows.length === 0}
              />
            </th>
            <th>출고일시</th>
            <th>코드</th>
            <th>품명</th>
            <th>수량</th>
            <th>단가</th>
            <th title="최초 출고 시점의 재고 변동 (수정분은 수정 기록 참고)">재고 변동(최초)</th>
            <th>출고처</th>
            <th>비고</th>
            <th>수정 사유</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={10} className="py-6 text-center text-gray-400">
                출고 내역이 없습니다.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr
              key={r.id}
              className={`border-b ${selected.has(r.id) ? "bg-blue-50" : ""}`}
            >
              <td className="py-2">
                <input
                  type="checkbox"
                  aria-label={`${r.productName} 선택`}
                  checked={selected.has(r.id)}
                  onChange={() => toggle(r.id)}
                />
              </td>
              <td className="whitespace-nowrap">
                {r.shippedAtText}
                {r.revisionCount > 0 && (
                  <span
                    className="ml-1 rounded bg-amber-100 px-1 text-xs text-amber-800"
                    title={r.revisions[0] ? `최근 수정: ${r.revisions[0].reason}` : undefined}
                  >
                    수정 {r.revisionCount}
                  </span>
                )}
              </td>
              <td>{r.sku}</td>
              <td>{r.productName}</td>
              <td>{r.quantity.toLocaleString()}</td>
              <td>
                {r.unitPrice == null ? "-" : r.unitPrice.toLocaleString()}
              </td>
              <td className="whitespace-nowrap text-gray-500">
                {r.originalMovement
                  ? `${r.originalMovement.beforeStock.toLocaleString()} → ${r.originalMovement.afterStock.toLocaleString()}`
                  : "-"}
              </td>
              <td>{r.customer ?? "-"}</td>
              <td className="max-w-40 truncate">{r.memo ?? ""}</td>
              {/* 최근 수정 사유 (마우스를 올리면 최근 수정 기록 전체) */}
              <td
                className="max-w-48 truncate text-gray-600"
                title={
                  r.revisions.length > 0
                    ? r.revisions.map((rv) => `${rv.createdAtText} ${rv.reason}`).join("\n")
                    : undefined
                }
              >
                {r.revisions[0]?.reason ?? ""}
                {r.revisionCount > 1 && (
                  <span className="ml-1 text-xs text-gray-400">외 {r.revisionCount - 1}건</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <OutboundEditDialog
          // version을 key에 넣으면 저장 직후 목록 갱신 시 다시 마운트되어 성공 상태를 잃음
          key={editing.id}
          row={editing}
          onClose={() => setEditingId(null)}
          onSaved={(message) => {
            setFlash(message);
            setEditingId(null);
            setSelected(new Set());
          }}
        />
      )}
    </div>
  );
}
