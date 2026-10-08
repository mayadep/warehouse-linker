"use server";

import { authorize, NO_PERMISSION_MESSAGE } from "@/modules/user/auth";
import { revalidatePath } from "next/cache";
import { UUID_RE, isBoxQtyUnit } from "@/lib/form";
import { dbToDateOnly } from "@/lib/datetime";
import { listProductBalances } from "@/modules/stock/queries";
import { convertBoxesToBase, normalizeProductKeyword } from "@/modules/product/service";
import { can } from "@/modules/user/codes";
import {
  parseOutboundConfirmForm,
  parseOutboundForm,
  parseOutboundUpdateForm,
  parseOutboundVoidForm,
  OUTBOUND_LIMITS,
  type OutboundFieldErrors,
  type OutboundUpdateFieldErrors,
} from "./validation";
import {
  cancelOutbound,
  confirmOutbound,
  createOutbound,
  deletePendingOutbound,
  updateOutbound,
  findSimilarOutbound,
  OutboundError,
  searchProductsForOutbound,
} from "./service";

const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

function revalidateStockPages() {
  revalidatePath("/outbound");
  revalidatePath("/inbound"); // 수정 모달의 현재고
  revalidatePath("/products/new"); // 현재고 표시
  revalidatePath("/orders", "layout"); // 수주 출고 수량
  revalidatePath("/dispatch", "layout"); // 배차 품목 수량
}

export type OutboundActionState = {
  /** confirm: 유사 출고가 있어 사용자 확인이 필요 (저장 안 됨) */
  status: "idle" | "success" | "error" | "confirm";
  message: string;
  errors?: OutboundFieldErrors;
  ts?: number;
};

export async function createOutboundAction(
  _prev: OutboundActionState,
  formData: FormData
): Promise<OutboundActionState> {
  const actor = await authorize("outbound.create");
  if (!actor) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };

  const parsed = parseOutboundForm(formData);
  if (!parsed.ok) {
    return { status: "error", message: "입력값을 확인하세요.", errors: parsed.errors, ts: Date.now() };
  }

  // 박스 단위 입력이면 서버에서 박스당 입수를 곱해 기본단위로 환산
  const d = { ...parsed.data };
  let boxNote = "";
  if (isBoxQtyUnit(formData)) {
    const conv = await convertBoxesToBase(d.productId, d.quantity, OUTBOUND_LIMITS.maxQuantity, "출고");
    if (!conv.ok) return { status: "error", message: conv.message, errors: { quantity: conv.message }, ts: Date.now() };
    boxNote = ` (${d.quantity.toLocaleString()}박스 × ${conv.boxQty.toLocaleString()}${conv.unit})`;
    d.quantity = conv.quantity;
  }

  if (!d.confirmDuplicate) {
    const similar = await findSimilarOutbound(d);
    if (similar) {
      return {
        status: "confirm",
        message: `${timeFmt.format(similar.createdAt)}에 같은 출고가 이미 등록되었습니다: ${similar.product.name} ${similar.quantity.toLocaleString()}개${similar.partner ? ` → ${similar.partner.name}` : ""}. 중복이 아니면 [그래도 등록]을 누르세요.`,
        ts: Date.now(),
      };
    }
  }

  try {
    const r = await createOutbound(d, actor);
    revalidateStockPages();
    return {
      status: "success",
      message:
        r.afterStock === null
          ? `${r.productName} ${d.quantity.toLocaleString()}개${boxNote} 출고 등록 — 관리자가 확정하면 재고에서 차감됩니다.`
          : `${r.productName} ${d.quantity.toLocaleString()}개${boxNote} 출고 완료 (현재고 ${r.afterStock.toLocaleString()})`,
      ts: Date.now(),
    };
  } catch (e) {
    if (e instanceof OutboundError) {
      return { status: "error", message: e.message, ts: Date.now() };
    }
    console.error("[outbound] create failed", e);
    return { status: "error", message: "출고 처리 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}

export type OutboundUpdateActionState = {
  status: "idle" | "success" | "error";
  message: string;
  errors?: OutboundUpdateFieldErrors;
  ts?: number;
};

const FIELD_LABELS: Record<string, string> = {
  quantity: "수량",
  unitPrice: "출고단가",
  partnerId: "출고처",
  memo: "비고",
  shippedAt: "출고일시",
};

export async function updateOutboundAction(
  _prev: OutboundUpdateActionState,
  formData: FormData
): Promise<OutboundUpdateActionState> {
  if (!(await authorize("outbound.manage"))) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };

  const parsed = parseOutboundUpdateForm(formData);
  if (!parsed.ok) {
    return { status: "error", message: "입력값을 확인하세요.", errors: parsed.errors, ts: Date.now() };
  }

  try {
    const r = await updateOutbound(parsed.data);
    revalidateStockPages();
    const fields = r.changedFields.map((f) => FIELD_LABELS[f] ?? f).join(", ");
    const stockChange = -r.quantityDelta;
    const stock =
      r.afterStock === null
        ? ""
        : ` · 재고 ${stockChange > 0 ? "+" : ""}${stockChange.toLocaleString()} (현재고 ${r.afterStock.toLocaleString()})`;
    return { status: "success", message: `${r.productName} 출고 수정 완료 [${fields}]${stock}`, ts: Date.now() };
  } catch (e) {
    if (e instanceof OutboundError) {
      return { status: "error", message: e.message, ts: Date.now() };
    }
    console.error("[outbound] update failed", e);
    return { status: "error", message: "출고 수정 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}

/** 출고 위치 선택지 1칸. value = "위치id|유통기한" (빈칸 = 미지정·미상) */
export type PickOption = { value: string; locationCode: string | null; expiryDate: string | null; quantity: number };

/** 상품의 칸별 재고 (출고 위치 선택용, 자동 출고 순서대로) */
export async function getPickOptionsAction(productId: string): Promise<PickOption[] | null> {
  if (!(await authorize("outbound.create"))) return null;
  if (typeof productId !== "string" || !UUID_RE.test(productId)) return null;
  const rows = await listProductBalances(productId);
  return rows.map((b) => {
    const expiryDate = b.expiryDate ? dbToDateOnly(b.expiryDate) : null;
    return {
      value: `${b.locationId ?? ""}|${expiryDate ?? ""}`,
      locationCode: b.location?.code ?? null,
      expiryDate,
      quantity: b.quantity,
    };
  });
}

/** 출고 화면 상품 선택용 서버 검색 (코드·품명·분류, 최대 20개). 판매가는 금액 권한이 있을 때만 */
export async function searchOutboundProductsAction(keyword: string) {
  const actor = await authorize("outbound.create");
  if (!actor) return null;
  const r = await searchProductsForOutbound(normalizeProductKeyword(keyword));
  const showPrice = can(actor.role, "price.view");
  return { total: r.total, rows: r.rows.map((p) => ({ ...p, price: showPrice ? p.price : null })) };
}

export type OutboundReviewState = { status: "idle" | "success" | "error"; message: string; ts?: number };

async function review(fn: () => Promise<string>): Promise<OutboundReviewState> {
  try {
    const message = await fn();
    revalidateStockPages();
    return { status: "success", message, ts: Date.now() };
  } catch (e) {
    if (e instanceof OutboundError) return { status: "error", message: e.message, ts: Date.now() };
    console.error("[outbound] review failed", e);
    return { status: "error", message: "처리 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}

/** 출고 확정 (관리자): 재고 차감 */
export async function confirmOutboundAction(_p: OutboundReviewState, fd: FormData): Promise<OutboundReviewState> {
  const actor = await authorize("outbound.manage");
  if (!actor) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const parsed = parseOutboundConfirmForm(fd);
  if (!parsed.ok) return { status: "error", message: parsed.message, ts: Date.now() };
  return review(async () => {
    const r = await confirmOutbound(parsed.data, actor);
    return `${r.productName} ${r.quantity.toLocaleString()}개 출고 확정 (현재고 ${r.afterStock.toLocaleString()})`;
  });
}

/** 확정 출고 취소 (관리자): 재고 복원 역이력 */
export async function cancelOutboundAction(_p: OutboundReviewState, fd: FormData): Promise<OutboundReviewState> {
  const actor = await authorize("outbound.manage");
  if (!actor) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const parsed = parseOutboundVoidForm(fd);
  if (!parsed.ok) return { status: "error", message: parsed.message, ts: Date.now() };
  return review(async () => {
    const r = await cancelOutbound(parsed.data, actor);
    return `${r.productName} ${r.quantity.toLocaleString()}개 출고 취소 (현재고 ${r.afterStock.toLocaleString()})`;
  });
}

/** 대기 출고 삭제 (관리자) */
export async function deleteOutboundAction(_p: OutboundReviewState, fd: FormData): Promise<OutboundReviewState> {
  if (!(await authorize("outbound.manage"))) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const parsed = parseOutboundVoidForm(fd);
  if (!parsed.ok) return { status: "error", message: parsed.message, ts: Date.now() };
  return review(async () => {
    const r = await deletePendingOutbound(parsed.data);
    return `${r.productName} ${r.quantity.toLocaleString()}개 대기 출고 삭제`;
  });
}
