"use server";

import { revalidatePath } from "next/cache";
import { authorize, NO_PERMISSION_MESSAGE } from "@/modules/user/auth";
import { createPartner, PartnerError, updatePartner } from "./service";
import { parsePartnerCreateForm, parsePartnerUpdateForm, type PartnerFieldErrors } from "./validation";

export type PartnerActionState = {
  status: "idle" | "success" | "error";
  message: string;
  errors?: PartnerFieldErrors;
  ts?: number;
};

async function run(fn: () => Promise<string>): Promise<PartnerActionState> {
  try {
    const message = await fn();
    revalidatePath("/partners");
    return { status: "success", message, ts: Date.now() };
  } catch (e) {
    if (e instanceof PartnerError) return { status: "error", message: e.message, ts: Date.now() };
    console.error("[partner] action failed", e);
    return { status: "error", message: "처리 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}

export async function createPartnerAction(_p: PartnerActionState, fd: FormData): Promise<PartnerActionState> {
  if (!(await authorize("admin"))) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const p = parsePartnerCreateForm(fd);
  if (!p.ok) return { status: "error", message: p.message ?? "입력값을 확인하세요.", errors: p.errors, ts: Date.now() };
  return run(async () => `${(await createPartner(p.data)).name} 거래처 등록 완료`);
}

export async function updatePartnerAction(_p: PartnerActionState, fd: FormData): Promise<PartnerActionState> {
  if (!(await authorize("admin"))) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const p = parsePartnerUpdateForm(fd);
  if (!p.ok) return { status: "error", message: p.message ?? "입력값을 확인하세요.", errors: p.errors, ts: Date.now() };
  return run(async () => `${(await updatePartner(p.data)).name} 수정 완료`);
}
