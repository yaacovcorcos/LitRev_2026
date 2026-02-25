import "server-only";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { runWithActorContext } from "@/lib/server/actor";
import {
  clearAuthFailures,
  extractClientIp,
  registerAuthFailure,
} from "@/lib/server/auth/auth-rate-limit";
import { claimLegacySingleUserData } from "@/lib/server/auth/claim";
import { prisma } from "@/lib/server/prisma";

const TEST_FALLBACK_CONTEXT = {
  userId: "local-user",
  workspaceId: "local-workspace",
  role: "owner",
} as const;

export type AuthContext = {
  userId: string;
  workspaceId: string;
  role: string;
};

const isTestEnv = process.env.NODE_ENV === "test";

async function ensureDefaultWorkspaceMembership(userId: string, displayName?: string | null) {
  const existing = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    return existing;
  }

  const workspaceId = `workspace-${userId}`;
  const workspaceName =
    displayName && displayName.trim().length > 0
      ? `${displayName.trim()} Workspace`
      : "My Workspace";

  await prisma.workspace.upsert({
    where: { id: workspaceId },
    update: { name: workspaceName },
    create: {
      id: workspaceId,
      name: workspaceName,
    },
  });

  return prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId,
      },
    },
    update: { role: "owner" },
    create: {
      workspaceId,
      userId,
      role: "owner",
    },
  });
}

async function buildAuthContextFromSession(sessionUser: {
  id: string;
  name?: string | null;
}): Promise<AuthContext> {
  const membership = await ensureDefaultWorkspaceMembership(
    sessionUser.id,
    sessionUser.name,
  );

  await claimLegacySingleUserData({
    userId: sessionUser.id,
    workspaceId: membership.workspaceId,
  });

  return {
    userId: sessionUser.id,
    workspaceId: membership.workspaceId,
    role: membership.role,
  };
}

export async function getAuthContext(): Promise<AuthContext> {
  if (isTestEnv) {
    return { ...TEST_FALLBACK_CONTEXT };
  }

  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });

  if (!session) {
    throw new Error("Unauthorized");
  }

  return buildAuthContextFromSession({
    id: session.user.id,
    name: session.user.name,
  });
}

export async function withAuth<T>(fn: (context: AuthContext) => Promise<T>): Promise<T> {
  const context = await getAuthContext();
  return runWithActorContext(context, () => fn(context));
}

export async function requireApiSession(
  request: Request,
): Promise<{ ok: true; context: AuthContext } | { ok: false; response: Response }> {
  if (isTestEnv) {
    return { ok: true, context: { ...TEST_FALLBACK_CONTEXT } };
  }

  const session = await auth.api.getSession({ headers: request.headers });
  const clientIp = extractClientIp(request.headers);

  if (!session) {
    const limit = registerAuthFailure(clientIp);
    if (!limit.allowed) {
      return {
        ok: false,
        response: new Response(JSON.stringify({ error: "Too many authentication attempts" }), {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            ...(limit.retryAfterSeconds
              ? { "Retry-After": String(limit.retryAfterSeconds) }
              : {}),
          },
        }),
      };
    }
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  const context = await buildAuthContextFromSession({
    id: session.user.id,
    name: session.user.name,
  });
  clearAuthFailures(clientIp);

  return {
    ok: true,
    context,
  };
}
