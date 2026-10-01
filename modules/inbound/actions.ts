"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import {
  parseInboundForm,
  parseInboundUpdateForm,
  type InboundFieldErrors,
  type InboundUpdateFieldErrors,
} from "./validation";
import { createInbound, updateInbound, findSimilarInbound, InboundError } from "./service";

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
  /** 매 응답마다 바뀌는 값 (클라이언트에서 폼 초기화 트리거용) */
  ts?: number;
};

export async function createInboundAction(
  _prev: InboundActionState,
  formData: FormData
): Promise<InboundActionState> {
  // TODO: 인증/권한 체계 도입 시 여기서 입고 권한 확인 (UI에만 의존하지 않음)

  const parsed = parseInboundForm(formData);
  if (!parsed.ok) {
    return {
      status: "error",
      message: "입력값을 확인하세요.",
      errors: parsed.errors,
      ts: Date.now(),
    };
  }

  // 유사 입고 경고 (확인 후 재요청이면 건너뜀)
  if (!parsed.data.confirmDuplicate) {
    const similar = await findSimilarInbound(parsed.data);
    if (similar) {
      return {
        status: "confirm",
        message: `${timeFmt.format(similar.createdAt)}에 같은 입고가 이미 등록되었습니다: ${similar.product.name} ${similar.quantity.toLocaleString()}개${similar.supplier ? ` (${similar.supplier})` : ""}. 중복이 아니면 [그래도 등록]을 누르세요.`,
        ts: Date.now(),
      };
    }
  }

  try {
    const result = await createInbound(parsed.data);
    revalidatePath("/inbound");
    revalidatePath("/outbound"); // 출고 화면 현재고
    revalidatePath("/products/new");
    return {
      status: "success",
      message: `${result.productName} ${parsed.data.quantity.toLocaleString()}개 입고 완료 (현재고 ${result.afterStock.toLocaleString()})`,
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
  // TODO: 인증/권한 체계 도입 시 여기서 입고 수정 권한 확인 (UI에만 의존하지 않음)

  const parsed = parseInboundUpdateForm(formData);
  if (!parsed.ok) {
    return { status: "error", message: "입력값을 확인하세요.", errors: parsed.errors, ts: Date.now() };
  }

  try {
    const r = await updateInbound(parsed.data);
    revalidatePath("/inbound");
    revalidatePath("/outbound");
    revalidatePath("/products/new"); // 현재고 표시
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
