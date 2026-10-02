import type { Metadata } from "next";
import { Inter, Noto_Sans_KR } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { getCurrentUser } from "@/modules/user/auth";

// 영문·숫자는 Inter, 한글은 Noto Sans KR (Inter에 한글 글리프가 없어 자동 대체)
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-kr",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "재고관리",
  description: "도매 재고관리 시스템",
};

const THEME_SCRIPT = `(function(){try{var p=null;try{p=localStorage.getItem("theme")}catch(x){}if(p!=="dark")p="light";var e=document.documentElement;e.classList.toggle("dark",p==="dark");e.dataset.themePref=p}catch(x){}})()`;

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // 로그인 전(로그인 화면)에는 사이드바·헤더 없이 표시. 권한 확인은 각 페이지에서 한다
  const user = await getCurrentUser();

  return (
    <html
      lang="ko"
      className={`${inter.variable} ${notoSansKr.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* 첫 화면을 그리기 전에 저장된 테마(없으면 시스템 설정)를 적용해 깜빡임을 막는다 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      {user ? (
        <body className="min-h-full flex">
          <Sidebar user={{ name: user.name, loginId: user.loginId, role: user.role }} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Header />
            <main className="flex-1 p-6">
              <div className="max-w-[1440px]">{children}</div>
            </main>
          </div>
        </body>
      ) : (
        <body className="min-h-full bg-muted/40">{children}</body>
      )}
    </html>
  );
}