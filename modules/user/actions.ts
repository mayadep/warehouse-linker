"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { authorize, currentSessionId, endSession, getCurrentUser, NO_PERMISSION_MESSAGE } from "./auth";
import {
  changeOwnPassword,
  createUser,
  lockedMessage,
  login,
  recordLogout,
  resetPassword,
  updateUser,
  UserError,
} from "./service";
import {
  parseLoginForm,
  parsePasswordChangeForm,
  parsePasswordResetForm,
  parseUserCreateForm,
  parseUserUpdateForm,
  type UserFieldErrors,
} from "./validation";

export type LoginState = { status: "idle" | "error"; message: string; ts?: number };

export async function loginAction(_prev: LoginState, fd: FormData): Promise<LoginState> {
  const parsed = parseLoginForm(fd);
  if (!parsed) return { status: "error", message: "아이디와 비밀번호를 입력하세요.", ts: Date.now() };
  const r = await login(parsed.loginId, parsed.password);
  if (!r.ok) {
    const message = r.lockedMinutes
      ? lockedMessage(r.lockedMinutes)
      : "아이디 또는 비밀번호가 올바르지 않거나 사용 중지된 계정입니다.";
    return { status: "error", message, ts: Date.now() };
  }
  redirect("/");
}

export async function logoutAction() {
  const user = await getCurrentUser();
  if (user) await recordLogout(user);
  await endSession();
  redirect("/login");
}

export type UserActionState = {
  status: "idle" | "success" | "error";
  message: string;
  errors?: UserFieldErrors;
  ts?: number;
};

async function run(fn: () => Promise<string>): Promise<UserActionState> {
  try {
    const message = await fn();
    revalidatePath("/users");
    return { status: "success", message, ts: Date.now() };
  } catch (e) {
    if (e instanceof UserError) return { status: "error", message: e.message, ts: Date.now() };
    console.error("[user] action failed", e);
    return { status: "error", message: "처리 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}

export async function createUserAction(_p: UserActionState, fd: FormData): Promise<UserActionState> {
  if (!(await authorize("admin"))) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const p = parseUserCreateForm(fd);
  if (!p.ok) return { status: "error", message: p.message ?? "입력값을 확인하세요.", errors: p.errors, ts: Date.now() };
  return run(async () => `${(await createUser(p.data)).loginId} 사용자 등록 완료`);
}

export async function updateUserAction(_p: UserActionState, fd: FormData): Promise<UserActionState> {
  const actor = await authorize("admin");
  if (!actor) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const p = parseUserUpdateForm(fd);
  if (!p.ok) return { status: "error", message: p.message ?? "입력값을 확인하세요.", errors: p.errors, ts: Date.now() };
  return run(async () => `${(await updateUser(p.data, actor)).loginId} 수정 완료`);
}

export async function resetPasswordAction(_p: UserActionState, fd: FormData): Promise<UserActionState> {
  if (!(await authorize("admin"))) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const p = parsePasswordResetForm(fd);
  if (!p.ok) return { status: "error", message: p.message ?? "입력값을 확인하세요.", errors: p.errors, ts: Date.now() };
  return run(async () => `${(await resetPassword(p.data)).loginId} 비밀번호 재설정 완료 (기존 로그인은 모두 종료됨)`);
}

/** 본인 비밀번호 변경: 로그인한 사용자면 역할과 무관하게 가능 */
export async function changeOwnPasswordAction(_p: UserActionState, fd: FormData): Promise<UserActionState> {
  const user = await getCurrentUser();
  const sessionId = await currentSessionId();
  if (!user || !sessionId) return { status: "error", message: NO_PERMISSION_MESSAGE, ts: Date.now() };
  const p = parsePasswordChangeForm(fd);
  if (!p.ok) return { status: "error", message: p.message ?? "입력값을 확인하세요.", errors: p.errors, ts: Date.now() };
  try {
    await changeOwnPassword(user, p.data, sessionId);
    return { status: "success", message: "비밀번호를 변경했습니다. 다른 기기의 로그인은 종료되었습니다.", ts: Date.now() };
  } catch (e) {
    if (e instanceof UserError) return { status: "error", message: e.message, ts: Date.now() };
    console.error("[user] password change failed", e);
    return { status: "error", message: "처리 중 오류가 발생했습니다. 다시 시도하세요.", ts: Date.now() };
  }
}
