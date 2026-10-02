// 로그인 쿠키가 없으면 /login 으로 (빠른 1차 확인일 뿐, 실제 세션·권한 확인은 각 페이지와 Server Action 에서 한다)
import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "wl_session"; // modules/user/auth.ts 와 같은 이름

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === "/login") return NextResponse.next();
  if (!request.cookies.has(SESSION_COOKIE)) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // 정적 파일·이미지·아이콘 제외
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp)$).*)"],
};
