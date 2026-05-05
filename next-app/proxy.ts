import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth-redirects";

const PUBLIC_PATHS = ["/login", "/signup"];
const SESSION_COOKIES = [
  "better-auth.session_token",
  "better-auth-session_token",
  "__Secure-better-auth.session_token",
  "__Secure-better-auth-session_token",
];

function hasSessionCookie(request: NextRequest): boolean {
  return SESSION_COOKIES.some((name) => Boolean(request.cookies.get(name)?.value));
}

function getUnauthenticatedCallbackUrl(pathname: string, search: string): string {
  if (pathname === "/" && search === "") return DEFAULT_POST_LOGIN_PATH;
  return `${pathname}${search}`;
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  if (hasSessionCookie(request)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  const callbackUrl = getUnauthenticatedCallbackUrl(pathname, search);
  loginUrl.searchParams.set("callbackUrl", callbackUrl);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
