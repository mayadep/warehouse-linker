// 로그인 쿠키가 없으면 /login 으로 (빠른 1차 확인일 뿐, 실제 세션·권한 확인은 각 페이지와 Server Action 에서 한다)
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "wl_session"; // modules/user/auth.ts 와 같은 이름
const PUBLIC_PWA = ["/manifest.webmanifest", "/sw.js", "/offline.html", "/pwa-icon"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  // PWA 파일은 로그인 전에도 받을 수 있어야 한다 (설치 가능 여부 확인·오프라인 안내)
  if (PUBLIC_PWA.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  // 루트 레이아웃이 모바일 화면(/m)을 구분할 수 있도록 경로를 요청 헤더로 넘긴다
  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  // 정적 파일·이미지·아이콘 제외
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
