"use server";

import { revalidatePath } from "next/cache";
import {
  parseOutboundForm,
  parseOutboundUpdateForm,
  type OutboundFieldErrors,
  type OutboundUpdateFieldErrors,
} from "./validation";
import {
  createOutbound,
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
  // TODO: 인증/권한 체계 도입 시 여기서 출고 권한 확인 (UI에만 의존하지 않음)

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
    const r = await createOutbound(parsed.data);
    revalidateStockPages();
    return {
      status: "success",
      message: `${r.productName} ${parsed.data.quantity.toLocaleString()}개 출고 완료 (현재고 ${r.afterStock.toLocaleString()})`,
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
  // TODO: 인증/권한 체계 도입 시 여기서 출고 수정 권한 확인 (UI에만 의존하지 않음)

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
