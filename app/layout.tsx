import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

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
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "재고관리", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#315eea",
};

/**
 * 루트 레이아웃: html·body·폰트만. 화면 틀은 라우트 그룹별 레이아웃이 맡는다.
 * - app/(pc): 사이드바 + 헤더 (PC 업무 화면)
 * - app/m: 현장용 모바일 셸
 * - app/login: 틀 없음
 */
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${inter.variable} ${pretendard.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
