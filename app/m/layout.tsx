import Link from "next/link";
import { HomeIcon } from "lucide-react";
import { requirePageUser } from "@/modules/user/auth";
import PwaRegister from "./PwaRegister";

/** 현장용 모바일 셸: 큰 터치 영역, 상단 홈 이동. 사이드바·헤더 없음 (루트 레이아웃에서 /m 은 제외) */
export default async function MobileLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col bg-background">
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b bg-card px-4">
        <Link href="/m" className="flex items-center gap-2 text-base font-semibold">
          <HomeIcon className="size-5" /> 재고관리 현장
        </Link>
        <span className="text-sm text-muted-foreground">{user.name}</span>
      </header>
      <main className="flex-1 p-4">{children}</main>
      <PwaRegister />
    </div>
  );
}
