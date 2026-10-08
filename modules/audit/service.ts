import "server-only";
// 감사 로그 기록 (추가만 가능 — 수정·삭제 함수는 두지 않으며 DB 트리거가 UPDATE·DELETE 를 차단)
import type { Prisma } from "@prisma/client";
import { toKstDateTimeLocal } from "@/lib/datetime";
import { getCurrentUser, type CurrentUser } from "@/modules/user/auth";
import type { AuditActionCode, AuditCategoryCode } from "./codes";

export type AuditEntry = {
  category: AuditCategoryCode;
  action: AuditActionCode;
  targetId?: string | null;
  targetLabel?: string | null;
  summary: string;
  detail?: Prisma.InputJsonValue;
  /** 작업자. 생략하면 현재 로그인 사용자 (로그인 직후처럼 쿠키가 아직 없을 때만 직접 지정) */
  actor?: CurrentUser | null;
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

/** 수정 전후 값(바뀐 항목만) → 상세. ISO 일시는 KST "YYYY-MM-DD HH:mm" 로 */
export function auditRevision(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  reason: string
): Prisma.InputJsonObject {
  const kst = (o: Record<string, unknown>) =>
    Object.fromEntries(
      Object.entries(o).map(([k, v]) => [
        k,
        typeof v === "string" && ISO_RE.test(v) ? toKstDateTimeLocal(new Date(v)).replace("T", " ") : v,
      ])
    ) as Prisma.InputJsonObject;
  return { before: kst(before), after: kst(after), reason };
}

/**
 * 감사 로그 1건 기록. 반드시 작업과 같은 트랜잭션(tx) 안에서 호출한다.
 * → 작업이 롤백되면 로그도 남지 않고, 로그 저장이 실패하면 작업도 취소된다.
 */
export async function recordAudit(tx: Prisma.TransactionClient, entry: AuditEntry) {
  const actor = entry.actor !== undefined ? entry.actor : await currentActor();
  await tx.auditLog.create({
    data: {
      category: entry.category,
      action: entry.action,
      targetId: entry.targetId ?? null,
      targetLabel: entry.targetLabel ?? null,
      summary: entry.summary,
      detail: entry.detail,
      actorId: actor?.id ?? null,
      actor: actor ? `${actor.name}(${actor.loginId})` : null,
    },
  });
}

/** 요청 밖(시드·스크립트)에서는 쿠키가 없으므로 null */
async function currentActor(): Promise<CurrentUser | null> {
  try {
    return await getCurrentUser();
  } catch {
    return null;
  }
}
