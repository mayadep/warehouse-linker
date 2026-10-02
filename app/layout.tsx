import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Header from "@/components/Header";
import { getCurrentUser } from "@/modules/user/auth";

// 영문·숫자·코드는 Inter, 한글은 Pretendard(app/fonts, 서버에서 직접 제공). Inter에 한글 글리프가 없어 자동 대체된다
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const pretendard = localFont({
  src: "./fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  weight: "45 920",
  display: "swap",
});

export const metadata: Metadata = {
  title: "재고관리",
  description: "도매 재고관리 시스템",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // 로그인 전(로그인 화면)에는 사이드바·헤더 없이 표시. 권한 확인은 각 페이지에서 한다
  const user = await getCurrentUser();

  return (
    <html lang="ko" className={`${inter.variable} ${pretendard.variable} h-full antialiased`}>
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
        <body className="min-h-full">{children}</body>
      )}
    </html>
  );
}
