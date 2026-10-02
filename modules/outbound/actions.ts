"use server";

import { authorize, NO_PERMISSION_MESSAGE } from "@/modules/user/auth";
import { revalidatePath } from "next/cache";
import {
  parseOutboundConfirmForm,
  parseOutboundForm,
  parseOutboundUpdateForm,
  parseOutboundVoidForm,
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

  if (!parsed.data.confirmDuplicate) {
    const similar = await findSimilarOutbound(parsed.data);
    if (similar) {
      return {
        status: "confirm",
        message: `${timeFmt.format(similar.createdAt)}에 같은 출고가 이미 등록되었습니다: ${similar.product.name} ${similar.quantity.toLocaleString()}개${similar.customer ? ` → ${similar.customer}` : ""}. 중복이 아니면 [그래도 등록]을 누르세요.`,
        ts: Date.now(),
      };
    }
  }

  try {
    const r = await createOutbound(parsed.data, actor);
    revalidateStockPages();
    return {
      status: "success",
      message:
        r.afterStock === null
          ? `${r.productName} ${parsed.data.quantity.toLocaleString()}개 출고 등록 — 관리자가 확정하면 재고에서 차감됩니다.`
          : `${r.productName} ${parsed.data.quantity.toLocaleString()}개 출고 완료 (현재고 ${r.afterStock.toLocaleString()})`,
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
  customer: "출고처",
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
