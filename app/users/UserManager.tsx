"use client";

import { startTransition, useActionState, useEffect, useState } from "react";
import { PlusIcon } from "lucide-react";
import {
  createUserAction,
  resetPasswordAction,
  updateUserAction,
  type UserActionState,
} from "@/modules/user/actions";
import { USER_LIMITS, USER_ROLES, USER_ROLE_LABELS, USER_ROLE_TONE, type UserRoleCode } from "@/modules/user/codes";
import Modal from "@/components/Modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

export type UserRow = {
  id: string;
  loginId: string;
  name: string;
  role: UserRoleCode;
  isActive: boolean;
  version: number;
  createdAtText: string;
};

const initial: UserActionState = { status: "idle", message: "" };
const errText = "mt-1 block text-xs text-red-600";
const PW_HINT = `${USER_LIMITS.minPassword}자 이상, 영문과 숫자 포함`;

type Dialog = { kind: "create" } | { kind: "edit"; user: UserRow } | { kind: "password"; user: UserRow } | null;

export default function UserManager({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
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
          사용자 <b className="font-semibold text-foreground">{users.length}</b>명
        </p>
        <Button
          size="sm"
          onClick={() => {
            setFlash("");
            setDialog({ kind: "create" });
          }}
        >
          <PlusIcon data-icon="inline-start" />
          사용자 추가
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
              <th className="left">아이디</th>
              <th className="left">이름</th>
              <th>역할</th>
              <th>상태</th>
              <th>등록일</th>
              <th>관리</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.isActive ? "" : "text-muted-foreground"}>
                <td className="left font-mono text-xs">
                  {u.loginId}
                  {u.id === currentUserId && <span className="ml-1 text-muted-foreground">(나)</span>}
                </td>
                <td className="left">{u.name}</td>
                <td>
                  <Badge variant={USER_ROLE_TONE[u.role]}>{USER_ROLE_LABELS[u.role]}</Badge>
                </td>
                <td>{u.isActive ? <span className="text-green-700">사용</span> : "중지"}</td>
                <td className="text-muted-foreground tabular-nums">{u.createdAtText}</td>
                <td>
                  <div className="flex justify-center gap-1">
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        setFlash("");
                        setDialog({ kind: "edit", user: u });
                      }}
                    >
                      수정
                    </Button>
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => {
                        setFlash("");
                        setDialog({ kind: "password", user: u });
                      }}
                    >
                      비밀번호 재설정
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {dialog?.kind === "create" && <CreateDialog onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === "edit" && (
        <EditDialog
          key={dialog.user.id}
          user={dialog.user}
          isSelf={dialog.user.id === currentUserId}
          onClose={() => setDialog(null)}
          onDone={done}
        />
      )}
      {dialog?.kind === "password" && (
        <PasswordDialog key={dialog.user.id} user={dialog.user} onClose={() => setDialog(null)} onDone={done} />
      )}
    </div>
  );
}

/** 액션 상태가 성공이면 부모에 알림 */
function useDone(state: UserActionState, onDone: (m: string) => void) {
  useEffect(() => {
    if (state.status === "success") onDone(state.message);
  }, [state, onDone]);
}

function submitWith(action: (fd: FormData) => void, pending: boolean) {
  return (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pending) return;
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

function Footer({ pending, label, state, onCancel }: { pending: boolean; label: string; state: UserActionState; onCancel: () => void }) {
  return (
    <>
      {state.status === "error" && (
        <p aria-live="polite" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" type="button" onClick={onCancel} disabled={pending}>
          취소
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? "처리 중..." : label}
        </Button>
      </div>
    </>
  );
}

function CreateDialog({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [state, action, pending] = useActionState(createUserAction, initial);
  useDone(state, onDone);
  const err = state.status === "error" ? (state.errors ?? {}) : {};
  return (
    <Modal title="사용자 추가" onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submitWith(action, pending)} noValidate className="flex flex-col gap-4">
        <div className="flex gap-4">
          <label className="flex-1 text-sm">
            아이디
            <Input name="loginId" className="w-full lowercase" maxLength={30} placeholder="kim.staff" autoComplete="off" />
            {err.loginId && <span className={errText}>{err.loginId}</span>}
          </label>
          <label className="flex-1 text-sm">
            이름
            <Input name="name" className="w-full" maxLength={USER_LIMITS.maxName} />
            {err.name && <span className={errText}>{err.name}</span>}
          </label>
        </div>
        <div className="flex gap-4">
          <label className="flex-1 text-sm">
            역할
            <NativeSelect name="role" defaultValue="STAFF" className="w-full">
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {USER_ROLE_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
            {err.role && <span className={errText}>{err.role}</span>}
          </label>
          <label className="flex-1 text-sm">
            초기 비밀번호
            <Input name="password" type="password" className="w-full" autoComplete="new-password" placeholder={PW_HINT} />
            {err.password && <span className={errText}>{err.password}</span>}
          </label>
        </div>
        <Footer pending={pending} label="등록" state={state} onCancel={onClose} />
      </form>
    </Modal>
  );
}

function EditDialog({
  user,
  isSelf,
  onClose,
  onDone,
}: {
  user: UserRow;
  isSelf: boolean;
  onClose: () => void;
  onDone: (m: string) => void;
}) {
  const [state, action, pending] = useActionState(updateUserAction, initial);
  useDone(state, onDone);
  const err = state.status === "error" ? (state.errors ?? {}) : {};
  return (
    <Modal title={`사용자 수정 · ${user.loginId}`} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submitWith(action, pending)} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="userId" value={user.id} />
        <input type="hidden" name="version" value={user.version} />
        <label className="text-sm">
          이름
          <Input name="name" className="w-full" maxLength={USER_LIMITS.maxName} defaultValue={user.name} />
          {err.name && <span className={errText}>{err.name}</span>}
        </label>
        <div className="flex gap-4">
          <label className="flex-1 text-sm">
            역할
            {/* 비활성 select 는 전송되지 않으므로 본인은 hidden 으로 현재 값을 보냄 (서버에서도 변경 거부) */}
            {isSelf && <input type="hidden" name="role" value={user.role} />}
            <NativeSelect name={isSelf ? undefined : "role"} defaultValue={user.role} className="w-full" disabled={isSelf}>
              {USER_ROLES.map((r) => (
                <option key={r} value={r}>
                  {USER_ROLE_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
            {err.role && <span className={errText}>{err.role}</span>}
          </label>
          <label className="flex-1 text-sm">
            사용 여부
            {isSelf && <input type="hidden" name="isActive" value="1" />}
            <NativeSelect
              name={isSelf ? undefined : "isActive"}
              defaultValue={user.isActive ? "1" : "0"}
              className="w-full"
              disabled={isSelf}
            >
              <option value="1">사용</option>
              <option value="0">중지 (로그인 불가)</option>
            </NativeSelect>
            {err.isActive && <span className={errText}>{err.isActive}</span>}
          </label>
        </div>
        {isSelf && <p className="-mt-2 text-xs text-muted-foreground">본인 계정의 역할과 사용 여부는 바꿀 수 없습니다.</p>}
        <p className="-mt-2 text-xs text-muted-foreground">역할을 바꾸거나 중지하면 그 사용자의 기존 로그인은 종료됩니다.</p>
        <Footer pending={pending} label="저장" state={state} onCancel={onClose} />
      </form>
    </Modal>
  );
}

function PasswordDialog({ user, onClose, onDone }: { user: UserRow; onClose: () => void; onDone: (m: string) => void }) {
  const [state, action, pending] = useActionState(resetPasswordAction, initial);
  useDone(state, onDone);
  const err = state.status === "error" ? (state.errors ?? {}) : {};
  return (
    <Modal title={`비밀번호 재설정 · ${user.loginId}`} onClose={onClose} closeDisabled={pending}>
      <form onSubmit={submitWith(action, pending)} noValidate className="flex flex-col gap-4">
        <input type="hidden" name="userId" value={user.id} />
        <label className="text-sm">
          새 비밀번호
          <Input name="password" type="password" className="w-full" autoComplete="new-password" placeholder={PW_HINT} />
          {err.password && <span className={errText}>{err.password}</span>}
        </label>
        <p className="-mt-2 text-xs text-muted-foreground">저장하면 이 사용자의 기존 로그인은 모두 종료됩니다.</p>
        <Footer pending={pending} label="재설정" state={state} onCancel={onClose} />
      </form>
    </Modal>
  );
}
