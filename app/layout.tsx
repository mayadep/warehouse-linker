import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "재고관리",
  description: "도매 재고관리 시스템",
};

const THEME_SCRIPT = `(function(){try{var p=null;try{p=localStorage.getItem("theme")}catch(x){}if(p!=="dark")p="light";var e=document.documentElement;e.classList.toggle("dark",p==="dark");e.dataset.themePref=p}catch(x){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* 첫 화면을 그리기 전에 저장된 테마(없으면 시스템 설정)를 적용해 깜빡임을 막는다 */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex">
        <Sidebar />
        <main className="flex-1 p-8">{children}</main>
      </body>
    </html>
  );
}