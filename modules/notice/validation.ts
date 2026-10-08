// 공지사항 입력값 검증 (서버에서 반드시 실행)
import { parseRequestId, parseVersion, text, UUID_RE } from "@/lib/form";
import { NOTICE_LIMITS } from "./codes";

export type NoticeFieldErrors = Partial<Record<"title" | "body" | "noticeId", string>>;
type Result<T> = { ok: true; data: T } | { ok: false; errors: NoticeFieldErrors; message?: string };

export type NoticeInput = { title: string; body: string; isPinned: boolean; isPublished: boolean };

function parseCommon(fd: FormData): { data: NoticeInput; errors: NoticeFieldErrors } {
  const errors: NoticeFieldErrors = {};
  const title = text(fd, "title");
  const body = text(fd, "body").replace(/\r\n/g, "\n"); // 줄바꿈은 유지, 앞뒤 공백만 제거
  if (!title) errors.title = "제목을 입력하세요.";
  else if (title.length > NOTICE_LIMITS.maxTitle) errors.title = `제목은 ${NOTICE_LIMITS.maxTitle}자 이내로 입력하세요.`;
  if (!body) errors.body = "내용을 입력하세요.";
  else if (body.length > NOTICE_LIMITS.maxBody) errors.body = `내용은 ${NOTICE_LIMITS.maxBody}자 이내로 입력하세요.`;
  return { data: { title, body, isPinned: text(fd, "isPinned") === "1", isPublished: text(fd, "isPublished") !== "0" }, errors };
}

export type NoticeCreateInput = NoticeInput & { requestId: string };

export function parseNoticeCreateForm(fd: FormData): Result<NoticeCreateInput> {
  const { data, errors } = parseCommon(fd);
  const rid = parseRequestId(fd);
  if (rid.error) return { ok: false, errors: {}, message: rid.error };
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { ...data, requestId: rid.value } };
}

export type NoticeUpdateInput = NoticeInput & { noticeId: string; version: number };

export function parseNoticeUpdateForm(fd: FormData): Result<NoticeUpdateInput> {
  const noticeId = text(fd, "noticeId");
  const version = parseVersion(fd);
  if (!UUID_RE.test(noticeId) || version.error) {
    return { ok: false, errors: {}, message: "잘못된 요청입니다. 새로고침 후 다시 시도하세요." };
  }
  const { data, errors } = parseCommon(fd);
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { ...data, noticeId, version: version.value } };
}
