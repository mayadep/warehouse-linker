"use client";

import { startTransition, useActionState } from "react";
import { changeOwnPasswordAction, type UserActionState } from "@/modules/user/actions";
import { USER_LIMITS } from "@/modules/user/codes";
import Modal from "@/components/Modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: UserActionState = { status: "idle", message: "" };
const errText = "mt-1 block text-xs text-red-600";
const PW_HINT = `${USER_LIMITS.minPassword}자 이상, 영문과 숫자 포함`;

/** 본인 비밀번호 변경 (헤더 사용자 메뉴에서 열림) */
export default function PasswordChangeModal({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState(changeOwnPasswordAction, initial);
  const err = state.status === "error" ? (state.errors ?? {}) : {};

  // 오류 시 입력값이 지워지지 않도록 직접 전송 (UserManager 와 같은 방식)
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };

  return (
    <Modal title="비밀번호 변경" onClose={onClose} closeDisabled={pending}>
      {state.status === "success" ? (
        <div className="flex flex-col gap-4">
          <p aria-live="polite" className="text-sm">
            {state.message}
          </p>
          <div className="flex justify-end">
            <Button type="button" onClick={onClose}>
              닫기
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <label className="text-sm">
            현재 비밀번호
            <Input name="currentPassword" type="password" className="w-full" autoComplete="current-password" />
            {err.currentPassword && <span className={errText}>{err.currentPassword}</span>}
          </label>
          <label className="text-sm">
            새 비밀번호
            <Input name="password" type="password" className="w-full" autoComplete="new-password" placeholder={PW_HINT} />
            {err.password && <span className={errText}>{err.password}</span>}
          </label>
          <label className="text-sm">
            새 비밀번호 확인
            <Input name="confirm" type="password" className="w-full" autoComplete="new-password" />
            {err.confirm && <span className={errText}>{err.confirm}</span>}
          </label>
          <p className="-mt-2 text-xs text-muted-foreground">변경하면 지금 이 화면을 뺀 다른 기기의 로그인은 종료됩니다.</p>
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
              {pending ? "처리 중..." : "변경"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
