"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import {
  parseInboundConfirmForm,
  parseInboundForm,
  parseInboundUpdateForm,
  parseInboundVoidForm,
  type InboundFieldErrors,
  type InboundUpdateFieldErrors,
} from "./validation";
import {
  cancelInbound,
  confirmInbound,
  createInbound,
  deletePendingInbound,
  updateInbound,
  findSimilarInbound,
  findInboundStorageWarning,
  InboundError,
} from "./service";
import { authorize, NO_PERMISSION_MESSAGE } from "@/modules/user/auth";

const timeFmt = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export type InboundActionState = {
  /** confirm: 유사 입고가 있어 사용자 확인이 필요 (저장 안 됨) */
  status: "idle" | "success" | "error" | "confirm";
  message: string;
  errors?: InboundFieldErrors;
  /** confirm 일 때 확인 대상 위치코드 (보관 온도 경고가 있었던 경우) */
  confirmLocationCode?: string;
  /** 매 응답마다 바뀌는 값 (클라이언트에서 폼 초기화 트리거용) */
  ts?: number;
};

export async function createInboundAction(
  _prev: InboundActionState,
  formData: FormData
): Promise<InboundActionState> {
  const actor = await authorize("inbound.create");
  if (!actor) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };

  const parsed = parseInboundForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      message: "입력값을 확인하세요.",
      errors: parsed.errors,
      ts: Date.now(),
    };
  }

  // 경고 확인: 유사 입고 + 보관 온도 (확인 후 재요청이면 건너뜀, 온도는 확인한 위치코드가 같을 때만)
  const warnings: string[] = [];
  const d = parsed.data;
  if (!d.confirmDuplicate) {
    const similar = await findSimilarInbound(d);
    if (similar) {
      warnings.push(
        `${timeFmt.format(similar.createdAt)}에 같은 입고가 이미 등록되었습니다: ${similar.product.name} ${similar.quantity.toLocaleString()}개${similar.supplier ? ` (${similar.supplier})` : ""}.`
      );
    }
  }
  const tempConfirmed = d.confirmDuplicate && d.confirmedLocationCode === d.locationCode;
  const tempWarning = tempConfirmed ? null : await findInboundStorageWarning(d);
  if (tempWarning) warnings.push(tempWarning);
  if (warnings.length > 0) {
    return {
      status: "confirm",
      message: `${warnings.join(" ")} 이대로 진행하려면 [그래도 등록]을 누르세요.`,
      confirmLocationCode: tempWarning ? d.locationCode ?? undefined : undefined,
      ts: Date.now(),
    };
  }

  try {
    const result = await createInbound(parsed.data, actor);
    revalidatePath("/inbound");
    revalidatePath("/outbound"); // 출고 화면 현재고
    revalidatePath("/products/new");
    return {
      status: "success",
      message:
        result.afterStock === null
          ? `${result.productName} ${parsed.data.quantity.toLocaleString()}개 입고 등록 — 관리자가 확정하면 재고에 반영됩니다.`
          : `${result.productName} ${parsed.data.quantity.toLocaleString()}개 입고 완료 (현재고 ${result.afterStock.toLocaleString()})`,
      ts: Date.now(),
    };
  } catch (e) {
    if (e instanceof InboundError) {
      return { status: "error", message: e.message, ts: Date.now() };
    }
    // 정수 범위 초과(재고 오버플로) 등 DB 오류
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[inbound] prisma error", e.code, e.message);
    } else {
      console.error("[inbound] unexpected error", e);
    }
    return {
      status: "error",
      message: "입고 처리 중 오류가 발생했습니다. 다시 시도하세요.",
      ts: Date.now(),
    };
  }
}

export type InboundUpdateActionState = {
  status: "idle" | "success" | "error";
  message: string;
  errors?: InboundUpdateFieldErrors;
  ts?: number;
};

const FIELD_LABELS: Record<string, string> = {
  quantity: "수량",
  unitCost: "단가",
  supplier: "공급처",
  memo: "비고",
  receivedAt: "입고일시",
};

export async function updateInboundAction(
  _prev: InboundUpdateActionState,
  formData: FormData
): Promise<InboundUpdateActionState> {
  if (!(await authorize("inbound.manage"))) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };

  const parsed = parseInboundUpdateForm(formData);
  if (!parsed.ok) {
    return { status: "error", message: "입력값을 확인하세요.", errors: parsed.errors, ts: Date.now() };
  }

  try {
    const r = await updateInbound(parsed.data);
    revalidatePath("/inbound");
    revalidatePath("/outbound");
    revalidatePath("/products/new"); // 현재고 표시
    revalidatePath("/orders", "layout"); // 발주 입고 수량
    const fields = r.changedFields.map((f) => FIELD_LABELS[f] ?? f).join(", ");
    const stock =
      r.afterStock === null
        ? ""
        : ` · 재고 ${r.quantityDelta > 0 ? "+" : ""}${r.quantityDelta.toLocaleString()} (현재고 ${r.afterStock.toLocaleString()})`;
    return { status: "success", message: `${r.productName} 입고 수정 완료 [${fields}]${stock}`, ts: Date.now() };
  } catch (e) {
    if (e instanceof InboundError) {
      return { status: "error", message: e.message, ts: Date.now() };
    }
    console.error("[inbound] update failed", e);
    return { status: "error", message: "입고 수정 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}

export type InboundReviewState = { status: "idle" | "success" | "error"; message: string; ts?: number };

async function review(fn: () => Promise<string>): Promise<InboundReviewState> {
  try {
    const message = await fn();
    revalidatePath("/inbound");
    revalidatePath("/outbound"); // 출고 화면 현재고
    revalidatePath("/products/new"); // 현재고 표시
    revalidatePath("/orders", "layout"); // 발주 입고 수량
    return { status: "success", message, ts: Date.now() };
  } catch (e) {
    if (e instanceof InboundError) return { status: "error", message: e.message, ts: Date.now() };
    console.error("[inbound] review failed", e);
    return { status: "error", message: "처리 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}

/** 입고 확정 (관리자): 재고 반영 */
export async function confirmInboundAction(_p: InboundReviewState, fd: FormData): Promise<InboundReviewState> {
  const actor = await authorize("inbound.manage");
  if (!actor) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const parsed = parseInboundConfirmForm(fd);
  if (!parsed.ok) return { status: "error", message: parsed.message, ts: Date.now() };
  return review(async () => {
    const r = await confirmInbound(parsed.data, actor);
    return `${r.productName} ${r.quantity.toLocaleString()}개 입고 확정 (현재고 ${r.afterStock.toLocaleString()})`;
  });
}

/** 확정 입고 취소 (관리자): 재고 차감 역이력 */
export async function cancelInboundAction(_p: InboundReviewState, fd: FormData): Promise<InboundReviewState> {
  const actor = await authorize("inbound.manage");
  if (!actor) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const parsed = parseInboundVoidForm(fd);
  if (!parsed.ok) return { status: "error", message: parsed.message, ts: Date.now() };
  return review(async () => {
    const r = await cancelInbound(parsed.data, actor);
    return `${r.productName} ${r.quantity.toLocaleString()}개 입고 취소 (현재고 ${r.afterStock.toLocaleString()})`;
  });
}

/** 대기 입고 삭제 (관리자) */
export async function deleteInboundAction(_p: InboundReviewState, fd: FormData): Promise<InboundReviewState> {
  if (!(await authorize("inbound.manage"))) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const parsed = parseInboundVoidForm(fd);
  if (!parsed.ok) return { status: "error", message: parsed.message, ts: Date.now() };
  return review(async () => {
    const r = await deletePendingInbound(parsed.data);
    return `${r.productName} ${r.quantity.toLocaleString()}개 대기 입고 삭제`;
  });
}
