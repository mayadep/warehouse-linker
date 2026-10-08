import "server-only";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/modules/audit/service";
import type { CurrentUser } from "@/modules/user/auth";
import { NOTICE_LIMITS } from "./codes";
import type { NoticeCreateInput, NoticeUpdateInput } from "./validation";

export class NoticeError extends Error {}

const CONFLICT = "다른 곳에서 먼저 수정되었습니다. 새로고침 후 다시 시도하세요.";

/** 관리 화면 목록 (고정 → 최신순, 게시 중지 포함) */
export async function listNotices() {
  return prisma.notice.findMany({ orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }] });
}

/** 대시보드용: 게시 중인 공지만 (고정 → 최신순) */
export async function listPublishedNotices(limit = NOTICE_LIMITS.dashboardCount) {
  return prisma.notice.findMany({
    where: { isPublished: true },
    orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: { id: true, title: true, body: true, isPinned: true, authorName: true, createdAt: true },
  });
}

export async function createNotice(input: NoticeCreateInput, user: CurrentUser) {
  try {
    return await prisma.$transaction(async (tx) => {
      const n = await tx.notice.create({
        data: {
          title: input.title,
          body: input.body,
          isPinned: input.isPinned,
          isPublished: input.isPublished,
          authorName: user.name,
          requestId: input.requestId,
        },
        select: { id: true, title: true },
      });
      await recordAudit(tx, {
        category: "NOTICE",
        action: "NOTICE_CREATE",
        targetId: n.id,
        targetLabel: n.title,
        summary: `공지 등록: ${n.title}`,
        detail: { title: input.title, isPinned: input.isPinned, isPublished: input.isPublished },
      });
      return n;
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") throw new NoticeError("이미 처리된 요청입니다. 목록을 확인하세요.");
    throw e;
  }
}

export async function updateNotice(input: NoticeUpdateInput) {
  return prisma.$transaction(async (tx) => {
    const cur = await tx.notice.findUnique({ where: { id: input.noticeId } });
    if (!cur) throw new NoticeError("존재하지 않는 공지입니다.");
    if (cur.version !== input.version) throw new NoticeError(CONFLICT);

    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    if (cur.title !== input.title) [before.title, after.title] = [cur.title, input.title];
    if (cur.body !== input.body) [before.body, after.body] = ["(이전 내용)", "(수정됨)"];
    if (cur.isPinned !== input.isPinned) [before.isPinned, after.isPinned] = [cur.isPinned ? "고정" : "해제", input.isPinned ? "고정" : "해제"];
    if (cur.isPublished !== input.isPublished) {
      [before.isPublished, after.isPublished] = [cur.isPublished ? "게시" : "중지", input.isPublished ? "게시" : "중지"];
    }
    if (Object.keys(after).length === 0) throw new NoticeError("변경된 내용이 없습니다.");

    const r = await tx.notice.updateMany({
      where: { id: cur.id, version: input.version },
      data: { title: input.title, body: input.body, isPinned: input.isPinned, isPublished: input.isPublished, version: { increment: 1 } },
    });
    if (r.count === 0) throw new NoticeError(CONFLICT);

    await recordAudit(tx, {
      category: "NOTICE",
      action: "NOTICE_UPDATE",
      targetId: cur.id,
      targetLabel: input.title,
      summary: `공지 수정: ${cur.title}`,
      detail: { before, after },
    });
    return { title: input.title };
  });
}
