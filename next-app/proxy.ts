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

function clearSessionCookies(response: NextResponse): void {
  for (const name of SESSION_COOKIES) {
    response.cookies.delete(name);
  }
}

function getUnauthenticatedCallbackUrl(pathname: string, search: string): string {
  if (pathname === "/" && search === "") return DEFAULT_POST_LOGIN_PATH;
  return `${pathname}${search}`;
}

async function hasValidSession(request: NextRequest): Promise<boolean> {
  if (!hasSessionCookie(request)) {
    return false;
  }

  const cookie = request.headers.get("cookie");
  if (!cookie) {
    return false;
  }

  const sessionUrl = new URL("/api/auth/get-session", request.url);
  sessionUrl.searchParams.set("disableCookieCache", "true");
  sessionUrl.searchParams.set("disableRefresh", "true");
  const response = await fetch(sessionUrl, {
    method: "GET",
    headers: { cookie },
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) {
    return false;
  }

  const payload = (await response.json().catch(() => null)) as unknown;
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const sessionPayload = payload as { session?: unknown; user?: unknown };
  return Boolean(sessionPayload.session && sessionPayload.user);
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const hasCookie = hasSessionCookie(request);
  if (await hasValidSession(request)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  const callbackUrl = getUnauthenticatedCallbackUrl(pathname, search);
  loginUrl.searchParams.set("callbackUrl", callbackUrl);
  const response = NextResponse.redirect(loginUrl);
  if (hasCookie) {
    clearSessionCookies(response);
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
