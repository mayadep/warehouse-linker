// 사용자·로그인 입력값 검증 (서버에서 반드시 실행)
import { INT_RE, UUID_RE, text } from "@/lib/form";
import { isUserRole, LOGIN_ID_RE, USER_LIMITS, type UserRoleCode } from "./codes";

export type UserFieldErrors = Partial<Record<"loginId" | "name" | "role" | "password" | "isActive", string>>;

type Result<T> = { ok: true; data: T } | { ok: false; errors: UserFieldErrors; message?: string };

function checkPassword(pw: string, errors: UserFieldErrors) {
  if (pw.length < USER_LIMITS.minPassword) errors.password = `비밀번호는 ${USER_LIMITS.minPassword}자 이상이어야 합니다.`;
  else if (pw.length > USER_LIMITS.maxPassword) errors.password = `비밀번호는 ${USER_LIMITS.maxPassword}자 이하여야 합니다.`;
  else if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) errors.password = "비밀번호는 영문과 숫자를 모두 포함해야 합니다.";
}

function checkName(name: string, errors: UserFieldErrors) {
  if (!name) errors.name = "이름을 입력하세요.";
  else if (name.length > USER_LIMITS.maxName) errors.name = `이름은 ${USER_LIMITS.maxName}자 이내로 입력하세요.`;
}

/** 로그인: 형식만 확인 (아이디 존재 여부는 알려주지 않음) */
export function parseLoginForm(fd: FormData): { loginId: string; password: string } | null {
  const loginId = text(fd, "loginId").toLowerCase();
  const pw = fd.get("password");
  const password = typeof pw === "string" ? pw : "";
  if (!loginId || !password || loginId.length > 30 || password.length > USER_LIMITS.maxPassword) return null;
  return { loginId, password };
}

export type UserCreateInput = { loginId: string; name: string; role: UserRoleCode; password: string };

export function parseUserCreateForm(fd: FormData): Result<UserCreateInput> {
  const errors: UserFieldErrors = {};
  const loginId = text(fd, "loginId").toLowerCase();
  if (!loginId) errors.loginId = "아이디를 입력하세요.";
  else if (!LOGIN_ID_RE.test(loginId)) errors.loginId = "아이디는 영문 소문자·숫자·._- 로 3~30자여야 합니다.";
  const name = text(fd, "name");
  checkName(name, errors);
  const role = text(fd, "role");
  if (!isUserRole(role)) errors.role = "역할을 선택하세요.";
  const pw = fd.get("password");
  const password = typeof pw === "string" ? pw : "";
  checkPassword(password, errors);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { loginId, name, role: role as UserRoleCode, password } };
}

export type UserUpdateInput = { userId: string; version: number; name: string; role: UserRoleCode; isActive: boolean };

export function parseUserUpdateForm(fd: FormData): Result<UserUpdateInput> {
  const errors: UserFieldErrors = {};
  const userId = text(fd, "userId");
  const versionRaw = text(fd, "version");
  if (!UUID_RE.test(userId) || !INT_RE.test(versionRaw)) return { ok: false, errors, message: "잘못된 요청입니다." };
  const name = text(fd, "name");
  checkName(name, errors);
  const role = text(fd, "role");
  if (!isUserRole(role)) errors.role = "역할을 선택하세요.";
  const active = text(fd, "isActive");
  if (active !== "1" && active !== "0") errors.isActive = "상태를 선택하세요.";
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: { userId, version: Number(versionRaw), name, role: role as UserRoleCode, isActive: active === "1" },
  };
}

export type PasswordResetInput = { userId: string; password: string };

export function parsePasswordResetForm(fd: FormData): Result<PasswordResetInput> {
  const errors: UserFieldErrors = {};
  const userId = text(fd, "userId");
  if (!UUID_RE.test(userId)) return { ok: false, errors, message: "잘못된 요청입니다." };
  const pw = fd.get("password");
  const password = typeof pw === "string" ? pw : "";
  checkPassword(password, errors);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { userId, password } };
}
