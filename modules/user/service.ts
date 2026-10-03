import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/modules/stock/service";
import { recordAudit } from "@/modules/audit/service";
import { getDummyHash, hashPassword, verifyPassword } from "./password";
import { startSession, type CurrentUser } from "./auth";
import { LOGIN_LIMITS, USER_ROLE_LABELS } from "./codes";
import type { PasswordChangeInput, PasswordResetInput, UserCreateInput, UserUpdateInput } from "./validation";

export class UserError extends Error {}

const label = (u: { name: string; loginId: string }) => `${u.name}(${u.loginId})`;

export const lockedMessage = (minutes: number) =>
  `로그인 시도가 너무 많습니다. ${minutes}분 후 다시 시도하세요. (연속 ${LOGIN_LIMITS.maxFails}회 실패)`;

/** 잠금 남은 시간(분, 올림). 잠겨 있지 않으면 0 */
async function lockedMinutes(loginId: string): Promise<number> {
  const t = await prisma.loginThrottle.findUnique({ where: { loginId }, select: { lockedUntil: true } });
  const ms = t?.lockedUntil ? t.lockedUntil.getTime() - Date.now() : 0;
  return ms > 0 ? Math.ceil(ms / 60_000) : 0;
}

/**
 * 실패 1회 기록. 같은 아이디는 advisory lock 으로 직렬화해 동시 요청에도 횟수가 빠지지 않는다.
 * 잠금이 끝난 기록은 1부터 다시 센다. 이번 실패로 잠겼으면 true
 */
async function recordLoginFailure(tx: Prisma.TransactionClient, loginId: string): Promise<boolean> {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext(${"login:" + loginId}))`;
  const now = new Date();
  const t = await tx.loginThrottle.findUnique({ where: { loginId } });
  const expired = !!t?.lockedUntil && t.lockedUntil <= now;
  const failCount = !t || expired ? 1 : t.failCount + 1;
  const lockedUntil =
    failCount >= LOGIN_LIMITS.maxFails ? new Date(now.getTime() + LOGIN_LIMITS.lockMinutes * 60_000) : null;
  await tx.loginThrottle.upsert({
    where: { loginId },
    create: { loginId, failCount, lockedUntil },
    update: { failCount, lockedUntil },
  });
  return lockedUntil !== null;
}

export type LoginResult = { ok: true; user: CurrentUser } | { ok: false; lockedMinutes?: number };

/**
 * 로그인: 성공 시 세션 시작. 실패 사유(아이디 없음/비밀번호 틀림/비활성)는 구분해 알려주지 않음.
 * 같은 아이디로 연속 실패하면 잠금 (없는 아이디도 똑같이 잠가서 아이디 존재 여부가 드러나지 않게 함)
 */
export async function login(loginId: string, password: string): Promise<LoginResult> {
  // 잠금 중에는 비밀번호를 비교하지 않음. 잠긴 동안의 시도는 감사 로그에 남기지 않음(로그 폭증 방지)
  const locked = await lockedMinutes(loginId);
  if (locked > 0) return { ok: false, lockedMinutes: locked };

  const user = await prisma.user.findUnique({ where: { loginId } });
  // 아이디가 없어도 같은 시간이 걸리도록 비교
  const ok = await verifyPassword(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok || !user.isActive) {
    const nowLocked = await prisma.$transaction(async (tx) => {
      const lockedNow = await recordLoginFailure(tx, loginId);
      await recordAudit(tx, {
        category: "USER",
        action: "LOGIN_FAIL",
        targetId: user?.id ?? null,
        targetLabel: loginId,
        summary: `로그인 실패: ${loginId}${user && ok && !user.isActive ? " (비활성 계정)" : ""}`,
        actor: null,
      });
      if (lockedNow) {
        await recordAudit(tx, {
          category: "USER",
          action: "LOGIN_LOCKED",
          targetId: user?.id ?? null,
          targetLabel: loginId,
          summary: `로그인 잠금: ${loginId} (연속 ${LOGIN_LIMITS.maxFails}회 실패, ${LOGIN_LIMITS.lockMinutes}분)`,
          actor: null,
        });
      }
      return lockedNow;
    });
    return nowLocked ? { ok: false, lockedMinutes: LOGIN_LIMITS.lockMinutes } : { ok: false };
  }
  const current: CurrentUser = { id: user.id, loginId: user.loginId, name: user.name, role: user.role };
  await prisma.$transaction(async (tx) => {
    await tx.loginThrottle.deleteMany({ where: { loginId } });
    await startSession(tx, user.id);
    await recordAudit(tx, {
      category: "USER",
      action: "LOGIN",
      targetId: user.id,
      targetLabel: label(user),
      summary: `로그인: ${label(user)}`,
      actor: current,
    });
  });
  return { ok: true, user: current };
}

export async function recordLogout(user: CurrentUser) {
  await prisma.$transaction((tx) =>
    recordAudit(tx, {
      category: "USER",
      action: "LOGOUT",
      targetId: user.id,
      targetLabel: label(user),
      summary: `로그아웃: ${label(user)}`,
      actor: user,
    })
  );
}

export async function createUser(input: UserCreateInput) {
  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { loginId: input.loginId, name: input.name, role: input.role, passwordHash },
        select: { id: true, loginId: true, name: true, role: true },
      });
      await recordAudit(tx, {
        category: "USER",
        action: "USER_CREATE",
        targetId: u.id,
        targetLabel: label(u),
        summary: `사용자 등록: ${label(u)} ${USER_ROLE_LABELS[u.role]}`,
        detail: { loginId: u.loginId, name: u.name, role: USER_ROLE_LABELS[u.role] },
      });
      return u;
    });
  } catch (e) {
    if (isUniqueViolation(e, "loginId")) throw new UserError(`이미 사용 중인 아이디입니다: ${input.loginId}`);
    throw e;
  }
}

/** 활성 관리자가 최소 1명 남는지 확인 (관리자 변경은 하나씩 처리) */
async function assertAdminRemains(tx: Prisma.TransactionClient, excludeUserId: string) {
  await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtext('user-admin-change'))`;
  const others = await tx.user.count({ where: { role: "ADMIN", isActive: true, id: { not: excludeUserId } } });
  if (others === 0) throw new UserError("활성 관리자가 최소 1명은 있어야 합니다.");
}

/** 이름·역할·사용 여부 변경 (본인 계정은 역할·사용 여부 변경 불가) */
export async function updateUser(input: UserUpdateInput, actor: CurrentUser) {
  return prisma.$transaction(async (tx) => {
    const cur = await tx.user.findUnique({ where: { id: input.userId } });
    if (!cur) throw new UserError("존재하지 않는 사용자입니다.");
    if (cur.version !== input.version) throw new UserError("다른 곳에서 먼저 수정되었습니다. 새로고침 후 다시 시도하세요.");
    if (cur.id === actor.id && (input.role !== cur.role || !input.isActive)) {
      throw new UserError("본인 계정의 역할과 사용 여부는 바꿀 수 없습니다.");
    }

    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    if (cur.name !== input.name) [before.name, after.name] = [cur.name, input.name];
    if (cur.role !== input.role) [before.role, after.role] = [USER_ROLE_LABELS[cur.role], USER_ROLE_LABELS[input.role]];
    if (cur.isActive !== input.isActive)
      [before.isActive, after.isActive] = [cur.isActive ? "사용" : "중지", input.isActive ? "사용" : "중지"];
    if (Object.keys(after).length === 0) throw new UserError("변경된 내용이 없습니다.");

    const losesAdmin = cur.role === "ADMIN" && cur.isActive && (input.role !== "ADMIN" || !input.isActive);
    if (losesAdmin) await assertAdminRemains(tx, cur.id);

    const r = await tx.user.updateMany({
      where: { id: cur.id, version: input.version },
      data: { name: input.name, role: input.role, isActive: input.isActive, version: { increment: 1 } },
    });
    if (r.count === 0) throw new UserError("다른 곳에서 먼저 수정되었습니다. 새로고침 후 다시 시도하세요.");
    // 권한이 줄거나 중지되면 기존 로그인 세션을 끊음
    if (before.role || !input.isActive) await tx.session.deleteMany({ where: { userId: cur.id } });

    await recordAudit(tx, {
      category: "USER",
      action: "USER_UPDATE",
      targetId: cur.id,
      targetLabel: label({ name: input.name, loginId: cur.loginId }),
      summary: `사용자 수정: ${cur.loginId} [${Object.keys(after)
        .map((k) => ({ name: "이름", role: "역할", isActive: "사용 여부" })[k])
        .join(", ")}]`,
      detail: { before, after },
    });
    return { loginId: cur.loginId };
  });
}

/** 비밀번호 재설정 (해당 사용자의 기존 세션 모두 종료) */
export async function resetPassword(input: PasswordResetInput) {
  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: input.userId }, select: { id: true, loginId: true, name: true } });
    if (!u) throw new UserError("존재하지 않는 사용자입니다.");
    await tx.user.update({ where: { id: u.id }, data: { passwordHash, version: { increment: 1 } } });
    await tx.session.deleteMany({ where: { userId: u.id } });
    await tx.loginThrottle.deleteMany({ where: { loginId: u.loginId } }); // 로그인 잠금도 해제
    await recordAudit(tx, {
      category: "USER",
      action: "USER_PASSWORD_RESET",
      targetId: u.id,
      targetLabel: label(u),
      summary: `비밀번호 재설정: ${label(u)}`,
    });
    return { loginId: u.loginId };
  });
}

/**
 * 본인 비밀번호 변경: 현재 비밀번호 확인 → 변경, 지금 쓰는 세션만 남기고 다른 로그인은 종료.
 * 현재 비밀번호 확인 실패도 로그인 시도 제한에 포함 (탈취한 세션으로 비밀번호 대입 방지)
 */
export async function changeOwnPassword(user: CurrentUser, input: PasswordChangeInput, keepSessionId: string) {
  const locked = await lockedMinutes(user.loginId);
  if (locked > 0) throw new UserError(lockedMessage(locked));

  const cur = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } });
  if (!cur) throw new UserError("존재하지 않는 사용자입니다.");
  if (!(await verifyPassword(input.currentPassword, cur.passwordHash))) {
    const nowLocked = await prisma.$transaction((tx) => recordLoginFailure(tx, user.loginId));
    throw new UserError(nowLocked ? lockedMessage(LOGIN_LIMITS.lockMinutes) : "현재 비밀번호가 올바르지 않습니다.");
  }

  const passwordHash = await hashPassword(input.newPassword);
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: user.id }, data: { passwordHash, version: { increment: 1 } } });
    await tx.session.deleteMany({ where: { userId: user.id, id: { not: keepSessionId } } });
    await tx.loginThrottle.deleteMany({ where: { loginId: user.loginId } });
    await recordAudit(tx, {
      category: "USER",
      action: "USER_PASSWORD_CHANGE",
      targetId: user.id,
      targetLabel: label(user),
      summary: `비밀번호 변경(본인): ${label(user)}`,
      actor: user,
    });
  });
}

export async function listUsers() {
  return prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { role: "desc" }, { loginId: "asc" }],
    select: { id: true, loginId: true, name: true, role: true, isActive: true, version: true, createdAt: true },
  });
}
