"use server";

import { authorize, NO_PERMISSION_MESSAGE } from "@/modules/user/auth";
import { revalidatePath } from "next/cache";
import { createOrder, finishOrder, processOrder, OrderError } from "./service";
import { parseOrderCreateForm, parseOrderProcessForm, parseOrderRefForm, type OrderCreateErrors } from "./validation";
import { ORDER_PROCESS_LABELS, ORDER_STATUS_LABELS, ORDER_TYPE_LABELS } from "./codes";

function revalidateAll() {
  revalidatePath("/orders", "layout");
  revalidatePath("/inbound");
  revalidatePath("/outbound");
  revalidatePath("/stock");
  revalidatePath("/products/new");
  revalidatePath("/dispatch", "layout");
}

export type OrderCreateState = {
  status: "idle" | "success" | "error";
  message: string;
  errors?: OrderCreateErrors;
  orderId?: string;
  ts?: number;
};

export async function createOrderAction(_prev: OrderCreateState, fd: FormData): Promise<OrderCreateState> {
  if (!(await authorize("admin"))) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const parsed = parseOrderCreateForm(fd);
  if (!parsed.ok) return { status: "error", message: "입력값을 확인하세요.", errors: parsed.errors, ts: Date.now() };
  try {
    const o = await createOrder(parsed.data);
    revalidateAll();
    return { status: "success", message: `${ORDER_TYPE_LABELS[parsed.data.type]} ${o.orderNo} 등록 완료`, orderId: o.id, ts: Date.now() };
  } catch (e) {
    if (e instanceof OrderError) return { status: "error", message: e.message, ts: Date.now() };
    console.error("[order] create failed", e);
    return { status: "error", message: "등록 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}

export type OrderActionState = { status: "idle" | "success" | "error"; message: string; ts?: number };

export async function processOrderAction(_prev: OrderActionState, fd: FormData): Promise<OrderActionState> {
  if (!(await authorize("admin"))) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const parsed = parseOrderProcessForm(fd);
  if (!parsed.ok) return { status: "error", message: parsed.message, ts: Date.now() };
  try {
    const r = await processOrder(parsed.data);
    revalidateAll();
    return {
      status: "success",
      message: `${r.orderNo} ${ORDER_PROCESS_LABELS[r.type]} ${r.lineCount}개 품목 ${r.totalQty.toLocaleString()}개 처리 · 상태 ${ORDER_STATUS_LABELS[r.status]}`,
      ts: Date.now(),
    };
  } catch (e) {
    if (e instanceof OrderError) return { status: "error", message: e.message, ts: Date.now() };
    console.error("[order] process failed", e);
    return { status: "error", message: "처리 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}

export async function finishOrderAction(_prev: OrderActionState, fd: FormData): Promise<OrderActionState> {
  if (!(await authorize("admin"))) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const parsed = parseOrderRefForm(fd);
  if (!parsed.ok) return { status: "error", message: parsed.message, ts: Date.now() };
  const action = fd.get("action") === "cancel" ? "cancel" : "close";
  try {
    const r = await finishOrder(parsed.orderId, parsed.version, action);
    revalidateAll();
    return { status: "success", message: `${r.orderNo} ${ORDER_STATUS_LABELS[r.status]} 처리 완료`, ts: Date.now() };
  } catch (e) {
    if (e instanceof OrderError) return { status: "error", message: e.message, ts: Date.now() };
    console.error("[order] finish failed", e);
    return { status: "error", message: "처리 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}
