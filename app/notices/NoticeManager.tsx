"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { PinIcon, PlusIcon } from "lucide-react";
import { createNoticeAction, updateNoticeAction, type NoticeActionState } from "@/modules/notice/actions";
import { NOTICE_LIMITS } from "@/modules/notice/codes";
import { newRequestId } from "@/lib/request-id";
import Modal from "@/components/Modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export type NoticeRow = {
  id: string;
  title: string;
  body: string;
  isPinned: boolean;
  isPublished: boolean;
  version: number;
  authorName: string;
  createdAtText: string;
};

const initial: NoticeActionState = { status: "idle", message: "" };
const errText = "mt-1 block text-xs text-red-600";

type Dialog = { kind: "create" } | { kind: "edit"; notice: NoticeRow } | null;

export default function NoticeManager({ notices }: { notices: NoticeRow[] }) {
  const [dialog, setDialog] = useState<Dialog>(null);
  const [flash, setFlash] = useState("");
  const done = (message: string) => {
    setFlash(message);
    setDialog(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          공지 <b className="font-semibold text-foreground">{notices.length}</b>건
        </p>
        <Button
          size="sm"
          onClick={() => {
            setFlash("");
            setDialog({ kind: "create" });
          }}
        >
          <PlusIcon data-icon="inline-start" />
          공지 작성
        </Button>
      </div>

      {flash && (
        <p aria-live="polite" className="text-sm text-green-700">
          {flash}
        </p>
      )}

      <div className="max-h-[70vh] overflow-auto rounded-lg border">
        <table className="data-table">
          <thead>
            <tr>
              <th className="left">제목</th>
              <th>상태</th>
              <th>작성자</th>
              <th>작성일</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {notices.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-muted-foreground">
                  등록된 공지가 없습니다. [공지 작성]으로 첫 공지를 등록하세요.
                </td>
              </tr>
            )}
            {notices.map((n) => (
              <tr key={n.id} className={n.isPublished ? "" : "text-muted-foreground"}>
                <td className="left max-w-xl truncate">
                  {n.isPinned && <PinIcon className="mr-1 inline size-3.5 text-primary" aria-label="상단 고정" />}
                  {n.title}
                </td>
                <td>{n.isPublished ? <Badge variant="green">게시</Badge> : <Badge variant="gray">중지</Badge>}</td>
                <td>{n.authorName}</td>
                <td className="text-muted-foreground tabular-nums">{n.createdAtText}</td>
                <td>
                  <div className="flex justify-center gap-1">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        setFlash("");
                        setDialog({ kind: "edit", notice: n });
                      }}
                    >
                      수정
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog?.kind === "create" && <NoticeDialog onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "edit" && <NoticeDialog key={dialog.notice.id} notice={dialog.notice} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
}

function NoticeDialog({ notice, onClose, onDone }: { notice?: NoticeRow; onClose: () => void; onDone: (m: string) => void }) {
  const [state, action, pending] = useActionState(notice ? updateNoticeAction : createNoticeAction, initial);
  const [requestId] = useState(newRequestId); // 저장 성공 전까지 같은 요청 고유키 재사용
  useEffect(() => {
    if (state.status === "success") onDone(state.message);
  }, [state, onDone]);
  const err = state.status === "error" ? (state.errors ?? {}) : {};

  return (
    <Modal title={notice ? "공지 수정" : "공지 작성"} onClose={onClose} closeDisabled={pending}>
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          const fd = new FormData(e.currentTarget);
          startTransition(() => action(fd));
        }}
      >
        {notice ? (
          <>
            <input type="hidden" name="noticeId" value={notice.id} />
            <input type="hidden" name="version" value={notice.version} />
          </>
        ) : (
          <input type="hidden" name="requestId" value={requestId} />
        )}
        <label className="text-sm">
          제목
          <Input name="title" className="w-full" maxLength={NOTICE_LIMITS.maxTitle} defaultValue={notice?.title} autoComplete="off" />
          {err.title && <span className={errText}>{err.title}</span>}
        </label>
        <label className="text-sm">
          내용
          <textarea
            name="body"
            rows={6}
            maxLength={NOTICE_LIMITS.maxBody}
            defaultValue={notice?.body}
            className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          {err.body && <span className={errText}>{err.body}</span>}
        </label>
        <div className="flex gap-4">
          <label className="flex-1 text-sm">
            게시 여부
            <NativeSelect name="isPublished" defaultValue={notice?.isPublished === false ? "0" : "1"} className="w-full">
              <option value="1">게시 (대시보드에 표시)</option>
              <option value="0">중지 (숨김)</option>
            </NativeSelect>
          </label>
          <label className="flex-1 text-sm">
            상단 고정
            <NativeSelect name="isPinned" defaultValue={notice?.isPinned ? "1" : "0"} className="w-full">
              <option value="0">고정 안 함</option>
              <option value="1">상단 고정</option>
            </NativeSelect>
          </label>
        </div>
        {state.status === "error" && (
          <p aria-live="polite" className="text-sm text-red-600">
            {state.message}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" type="button" onClick={onClose} disabled={pending}>
            취소
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "처리 중..." : notice ? "저장" : "등록"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
