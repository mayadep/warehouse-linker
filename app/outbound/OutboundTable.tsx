"use client";

import { useState } from "react";
import OutboundEditDialog from "./OutboundEditDialog";
import OutboundReviewDialog, { type OutboundReviewKind } from "./OutboundReviewDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
export type OutboundRevisionView = {
  createdAtText: string;
  reason: string;
  changesText: string;
};

export type OutboundStatusCode = "PENDING" | "CONFIRMED" | "CANCELLED";

const STATUS_BADGE: Record<OutboundStatusCode, { label: string; tone: "amber" | "green" | "red" }> = {
  PENDING: { label: "확정 대기", tone: "amber" },
  CONFIRMED: { label: "확정", tone: "green" },
  CANCELLED: { label: "취소", tone: "red" },
};

/** 서버에서 직렬화해 넘기는 출고내역 1행 */
export type OutboundRow = {
  id: string;
  version: number;
  sku: string;
  productName: string;
  baseUnit: string;
  productStock: number;
  productPrice: number | null; // 확정 시 출고단가 기본값 (금액 권한이 없으면 null)
  quantity: number;
  unitPrice: number | null; // 금액 권한이 없으면 항상 null
  status: OutboundStatusCode;
  createdByName: string | null;
  cancelReason: string | null;
  dispatchNo: string | null; // 배차된 경우 배차번호
  customer: string | null;
  memo: string | null;
  shippedAtText: string; // 표시용
  shippedAtInput: string; // datetime-local 값 (KST)
  originalMovement: { beforeStock: number; afterStock: number } | null;
  revisionCount: number;
  revisions: OutboundRevisionView[];
};

export default function OutboundTable({
  rows,
  canManage,
  showPrice,
}: {
  rows: OutboundRow[];
  canManage: boolean;
  showPrice: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [review, setReview] = useState<{ kind: OutboundReviewKind; id: string } | null>(null);
  const [flash, setFlash] = useState("");

  // 목록이 갱신되어 사라진 행은 선택에서 제외
  const visibleSelected = rows.filter((r) => selected.has(r.id));
  const one = visibleSelected.length === 1 ? visibleSelected[0] : null;
  const editing = rows.find((r) => r.id === editingId) ?? null;
  const reviewing = review ? (rows.find((r) => r.id === review.id) ?? null) : null;
  const allChecked = rows.length > 0 && visibleSelected.length === rows.length;
  const pendingCount = rows.filter((r) => r.status === "PENDING").length;
  const colCount = 11 + (canManage ? 1 : 0) + (showPrice ? 1 : 0);

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

  function openReview(kind: OutboundReviewKind) {
    if (!one) return;
    setFlash("");
    setReview({ kind, id: one.id });
  }

  function finished(message: string) {
    setFlash(message);
    setEditingId(null);
    setReview(null);
    setSelected(new Set());
  }

  return (
    <div>
      <div className="mt-10 mb-2 flex items-center justify-between gap-4">
        <p className="text-sm text-gray-500">
          출고 내역 {rows.length}건
          {pendingCount > 0 && <span className="ml-1 font-medium text-amber-700">(확정 대기 {pendingCount}건)</span>}
          {visibleSelected.length > 0 && ` · ${visibleSelected.length}건 선택`}
        </p>
        {canManage && (
          <div className="flex items-center gap-2">
            {visibleSelected.length > 1 && <span className="text-xs text-gray-500">1건씩 처리할 수 있습니다</span>}
            <Button size="sm" type="button" onClick={() => openReview("confirm")} disabled={one?.status !== "PENDING"}>
              선택 확정
            </Button>
            <Button
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                if (!one) return;
                setFlash("");
                setEditingId(one.id);
              }}
              disabled={!one || one.status === "CANCELLED"}
            >
              선택 수정
            </Button>
            <Button
              variant="destructive"
              size="sm"
              type="button"
              onClick={() => openReview("cancel")}
              disabled={one?.status !== "CONFIRMED"}
              title="확정된 출고를 취소합니다 (재고 복원)"
            >
              선택 취소
            </Button>
            <Button
              variant="destructive"
              size="sm"
              type="button"
              onClick={() => openReview("delete")}
              disabled={one?.status !== "PENDING"}
              title="확정 대기 출고를 삭제합니다"
            >
              선택 삭제
            </Button>
          </div>
        )}
      </div>

      {flash && (
        <p aria-live="polite" className="mb-2 text-sm text-green-700">
          {flash}
        </p>
      )}

      <div className="max-h-[70vh] overflow-auto rounded-lg border">
<table className="data-table">
        <thead>
          <tr>
            {canManage && (
              <th className="w-8">
                <input
                  type="checkbox"
                  aria-label="전체 선택"
                  checked={allChecked}
                  onChange={toggleAll}
                  disabled={rows.length === 0}
                />
              </th>
            )}
            <th>출고일시</th>
            <th>상태</th>
            <th>코드</th>
            <th>품명</th>
            <th className="num">수량</th>
            {showPrice && <th className="num">단가</th>}
            <th className="num" title="최초 출고(확정) 시점의 재고 변동 (수정분은 수정 기록 참고)">재고 변동(최초)</th>
            <th>출고처</th>
            <th>비고</th>
            <th>등록자</th>
            <th>수정·취소 사유</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={colCount} className="text-gray-400">
                출고 내역이 없습니다.
              </td>
            </tr>
          )}
          {rows.map((r) => {
            const badge = STATUS_BADGE[r.status];
            return (
              <tr
                key={r.id}
                className={
                  selected.has(r.id)
                    ? "bg-indigo-50"
                    : r.status === "PENDING"
                      ? "bg-amber-50/40"
                      : r.status === "CANCELLED"
                        ? "text-gray-400"
                        : undefined
                }
              >
                {canManage && (
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${r.productName} 선택`}
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                    />
                  </td>
                )}
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
                <td className="whitespace-nowrap">
                  <Badge variant={badge.tone}>{badge.label}</Badge>
                  {r.dispatchNo && (
                    <span className="ml-1 text-xs text-muted-foreground" title={`배차 ${r.dispatchNo}`}>
                      배차
                    </span>
                  )}
                </td>
                <td>{r.sku}</td>
                <td>{r.productName}</td>
                <td className="num">{r.quantity.toLocaleString()}</td>
                {showPrice && <td className="num">{r.unitPrice == null ? "-" : r.unitPrice.toLocaleString()}</td>}
                <td className="num whitespace-nowrap text-gray-500">
                  {r.originalMovement
                    ? `${r.originalMovement.beforeStock.toLocaleString()} → ${r.originalMovement.afterStock.toLocaleString()}`
                    : "-"}
                </td>
                <td>{r.customer ?? "-"}</td>
                <td className="max-w-40 truncate">{r.memo ?? ""}</td>
                <td className="text-gray-500">{r.createdByName ?? "-"}</td>
                {/* 취소 사유 또는 최근 수정 사유 (마우스를 올리면 최근 수정 기록 전체) */}
                <td
                  className="max-w-48 truncate text-gray-600"
                  title={
                    r.revisions.length > 0
                      ? r.revisions.map((rv) => `${rv.createdAtText} ${rv.reason}`).join("\n")
                      : undefined
                  }
                >
                  {r.status === "CANCELLED" ? (
                    <span className="text-red-600">취소: {r.cancelReason}</span>
                  ) : (
                    <>
                      {r.revisions[0]?.reason ?? ""}
                      {r.revisionCount > 1 && (
                        <span className="ml-1 text-xs text-gray-400">외 {r.revisionCount - 1}건</span>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
</div>

      {editing && (
        <OutboundEditDialog
          // version을 key에 넣으면 저장 직후 목록 갱신 시 다시 마운트되어 성공 상태를 잃음
          key={editing.id}
          row={editing}
          onClose={() => setEditingId(null)}
          onSaved={finished}
        />
      )}
      {review && reviewing && (
        <OutboundReviewDialog
          key={`${review.kind}-${reviewing.id}`}
          kind={review.kind}
          row={reviewing}
          onClose={() => setReview(null)}
          onDone={finished}
        />
      )}
    </div>
  );
}
