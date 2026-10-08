"use server";

import { revalidatePath } from "next/cache";
import { authorize, NO_PERMISSION_MESSAGE } from "@/modules/user/auth";
import { createNotice, NoticeError, updateNotice } from "./service";
import { parseNoticeCreateForm, parseNoticeUpdateForm, type NoticeFieldErrors } from "./validation";

export type NoticeActionState = {
  status: "idle" | "success" | "error";
  message: string;
  errors?: NoticeFieldErrors;
  ts?: number;
};

async function run(fn: () => Promise<string>): Promise<NoticeActionState> {
  try {
    const message = await fn();
    revalidatePath("/notices");
    revalidatePath("/");
    return { status: "success", message, ts: Date.now() };
  } catch (e) {
    if (e instanceof NoticeError) return { status: "error", message: e.message, ts: Date.now() };
    console.error("[notice] action failed", e);
    return { status: "error", message: "처리 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}

export async function createNoticeAction(_p: NoticeActionState, fd: FormData): Promise<NoticeActionState> {
  const user = await authorize("admin");
  if (!user) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const p = parseNoticeCreateForm(fd);
  if (!p.ok) return { status: "error", message: p.message ?? "입력값을 확인하세요.", errors: p.errors, ts: Date.now() };
  return run(async () => `공지 등록 완료: ${(await createNotice(p.data, user)).title}`);
}

export async function updateNoticeAction(_p: NoticeActionState, fd: FormData): Promise<NoticeActionState> {
  if (!(await authorize("admin"))) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const p = parseNoticeUpdateForm(fd);
  if (!p.ok) return { status: "error", message: p.message ?? "입력값을 확인하세요.", errors: p.errors, ts: Date.now() };
  return run(async () => `공지 수정 완료: ${(await updateNotice(p.data)).title}`);
}
