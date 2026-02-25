import { randomBytes } from "node:crypto";
import { serializeSignedCookie } from "better-call";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/server/prisma";
import {
  clearAuthFailures,
  extractClientIp,
} from "@/lib/server/auth/auth-rate-limit";
import {
  DEV_QUICK_LOGIN_EMAIL,
  DEV_QUICK_LOGIN_NAME,
  DEV_QUICK_LOGIN_USER_ID,
  isDevQuickLoginAllowed,
  normalizeCallbackUrl,
} from "@/lib/server/auth/dev-quick-login";

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function getRequestOrigin(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto") || request.nextUrl.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || request.nextUrl.host;
  return `${proto}://${host}`;
}

function isHttpsRequest(request: NextRequest): boolean {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  if (forwardedProto) return forwardedProto === "https";
  return request.nextUrl.protocol === "https:";
}

function getSessionCookieName(request: NextRequest): string {
  return isHttpsRequest(request)
    ? "__Secure-better-auth.session_token"
    : "better-auth.session_token";
}

export async function POST(request: NextRequest) {
  if (!isDevQuickLoginAllowed()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== getRequestOrigin(request)) {
    return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  }

  const authSecret = process.env.BETTER_AUTH_SECRET;
  if (!authSecret) {
    return NextResponse.json(
      { error: "BETTER_AUTH_SECRET is required for quick login" },
      { status: 500 },
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    callbackUrl?: string | null;
  };
  const callbackUrl = normalizeCallbackUrl(body.callbackUrl);

  const workspaceId = `workspace-${DEV_QUICK_LOGIN_USER_ID}`;
  await prisma.user.upsert({
    where: { id: DEV_QUICK_LOGIN_USER_ID },
    update: {
      email: DEV_QUICK_LOGIN_EMAIL,
      name: DEV_QUICK_LOGIN_NAME,
      emailVerified: true,
    },
    create: {
      id: DEV_QUICK_LOGIN_USER_ID,
      email: DEV_QUICK_LOGIN_EMAIL,
      name: DEV_QUICK_LOGIN_NAME,
      emailVerified: true,
    },
  });

  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: { name: "Preview Dev Workspace" },
    create: {
      id: workspaceId,
      name: "Preview Dev Workspace",
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: DEV_QUICK_LOGIN_USER_ID,
      },
    },
    update: { role: "owner" },
    create: {
      workspaceId,
      userId: DEV_QUICK_LOGIN_USER_ID,
      role: "owner",
    },
  });

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await prisma.session.create({
    data: {
      userId: DEV_QUICK_LOGIN_USER_ID,
      token,
      expiresAt,
      ipAddress: extractClientIp(request.headers),
      userAgent: request.headers.get("user-agent") || undefined,
    },
  });

  clearAuthFailures(extractClientIp(request.headers));

  const cookieName = getSessionCookieName(request);
  const cookie = await serializeSignedCookie(cookieName, token, authSecret, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttpsRequest(request),
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  const response = NextResponse.json({
    ok: true,
    redirectTo: callbackUrl,
  });
  response.headers.append("set-cookie", cookie);
  return response;
}
