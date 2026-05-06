import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { DEFAULT_POST_LOGIN_PATH } from "@/lib/auth-redirects";
import { getAuth } from "@/lib/auth";

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

type ProxySessionState = "missing" | "valid" | "invalid" | "unavailable";

async function getProxySessionState(request: NextRequest): Promise<ProxySessionState> {
  if (!hasSessionCookie(request)) {
    return "missing";
  }

  try {
    const session = await getAuth().api.getSession({
      headers: request.headers,
      query: {
        disableCookieCache: true,
        disableRefresh: true,
      },
    });
    return session?.session && session.user ? "valid" : "invalid";
  } catch {
    return "unavailable";
  }
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) {
    return NextResponse.next();
  }

  const sessionState = await getProxySessionState(request);
  if (sessionState === "valid") {
    return NextResponse.next();
  }
  if (sessionState === "unavailable") {
    // Avoid turning transient auth-store outages into misleading global logouts.
    // Data access still goes through server-side auth/authorization boundaries.
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  const callbackUrl = getUnauthenticatedCallbackUrl(pathname, search);
  loginUrl.searchParams.set("callbackUrl", callbackUrl);
  const response = NextResponse.redirect(loginUrl);
  if (sessionState === "invalid") {
    clearSessionCookies(response);
  }
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
