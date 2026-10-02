import { redirect } from "next/navigation";
import { getCurrentUser } from "@/modules/user/auth";
import LoginForm from "./LoginForm";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-xs">
        <h1 className="mb-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <span className="size-2.5 rounded-full bg-primary" />
          재고관리
        </h1>
        <p className="mb-6 text-sm text-muted-foreground">아이디와 비밀번호로 로그인하세요.</p>
        <LoginForm />
      </div>
    </div>
  );
}
