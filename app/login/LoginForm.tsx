"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "@/modules/user/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: LoginState = { status: "idle", message: "" };

export default function LoginForm() {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="text-sm">
        아이디
        <Input name="loginId" className="w-full" autoComplete="username" autoFocus required maxLength={30} />
      </label>
      <label className="text-sm">
        비밀번호
        <Input name="password" type="password" className="w-full" autoComplete="current-password" required />
      </label>
      {state.status === "error" && (
        <p aria-live="polite" className="text-sm text-red-600">
          {state.message}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "확인 중..." : "로그인"}
      </Button>
    </form>
  );
}
