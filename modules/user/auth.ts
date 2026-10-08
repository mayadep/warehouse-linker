import "server-only";
// 로그인 세션 · 현재 사용자 · 권한 확인 (서버 전용)
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { can, type Permission, type UserRoleCode } from "./codes";

export const SESSION_COOKIE = "wl_session";
const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12시간 (하루 근무 기준)

export type CurrentUser = { id: string; loginId: string; name: string; role: UserRoleCode };

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** 세션 생성 + 쿠키 설정 (Server Action 안에서 호출) */
export async function startSession(tx: Prisma.TransactionClient, userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await tx.session.create({ data: { id: hashToken(token), userId, expiresAt } });
  // 만료된 세션 정리 (이 사용자 것만)
  await tx.session.deleteMany({ where: { userId, expiresAt: { lt: new Date() } } });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

/** 현재 세션 삭제 + 쿠키 제거 */
export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: hashToken(token) } });
  store.delete(SESSION_COOKIE);
}

/** 현재 세션 id(토큰 해시). 쿠키가 없으면 null */
export async function currentSessionId(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

/** 현재 로그인 사용자 (요청당 1회 조회). 만료·비활성 계정이면 null */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const s = await prisma.session.findUnique({
    where: { id: hashToken(token) },
    select: {
      expiresAt: true,
      user: { select: { id: true, loginId: true, name: true, role: true, isActive: true } },
    },
  });
  if (!s || s.expiresAt <= new Date() || !s.user.isActive) return null;
  return { id: s.user.id, loginId: s.user.loginId, name: s.user.name, role: s.user.role };
});

/** 페이지용: 로그인 안 했으면 /login 으로. 권한은 호출한 페이지에서 can() 으로 확인 */
export async function requirePageUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Server Action 용: 권한이 없으면 null (호출자가 오류 상태를 반환) */
export async function authorize(perm: Permission): Promise<CurrentUser | null> {
  const user = await getCurrentUser();
  return user && can(user.role, perm) ? user : null;
}

export const NO_PERMISSION_MESSAGE = "권한이 없습니다. 로그인 상태와 계정 권한을 확인하세요.";
