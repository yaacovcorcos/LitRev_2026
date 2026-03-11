import "server-only";

import { headers } from "next/headers";
import { getAuth } from "@/lib/auth";
import { runWithActorContext } from "@/lib/server/actor";
import {
  clearAuthFailures,
  extractClientIp,
  registerAuthFailure,
} from "@/lib/server/auth/auth-rate-limit";
import { claimLegacySingleUserData } from "@/lib/server/auth/claim";
import { prisma } from "@/lib/server/prisma";
import type { LegacyClaimResult } from "@/lib/server/auth/claim";

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

type SessionUserInput = {
  id: string;
  name?: string | null;
};

async function buildAuthContextFromSession(
  sessionUser: SessionUserInput,
  options: { runLegacyClaim?: boolean } = {},
): Promise<AuthContext> {
  const { runLegacyClaim = true } = options;
  const membership = await ensureDefaultWorkspaceMembership(
    sessionUser.id,
    sessionUser.name,
  );

  if (runLegacyClaim) {
    await claimLegacySingleUserData({
      userId: sessionUser.id,
      workspaceId: membership.workspaceId,
    });
  }

  return {
    userId: sessionUser.id,
    workspaceId: membership.workspaceId,
    role: membership.role,
  };
}

async function getOptionalSessionUserFromHeaders(
  headerStore: Awaited<ReturnType<typeof headers>>,
): Promise<SessionUserInput | null> {
  const session = await getAuth().api.getSession({ headers: headerStore });
  if (!session) {
    return null;
  }

  return {
    id: session.user.id,
    name: session.user.name,
  };
}

export async function getOptionalFastAuthSessionContext(): Promise<{
  context: AuthContext;
  sessionUser: SessionUserInput;
} | null> {
  if (isTestEnv) {
    return {
      context: { ...TEST_FALLBACK_CONTEXT },
      sessionUser: { id: TEST_FALLBACK_CONTEXT.userId, name: "Test User" },
    };
  }

  const headerStore = await headers();
  const sessionUser = await getOptionalSessionUserFromHeaders(headerStore);
  if (!sessionUser) {
    return null;
  }

  const context = await buildAuthContextFromSession(sessionUser, {
    runLegacyClaim: false,
  });
  return { context, sessionUser };
}

export async function getFastAuthContext(): Promise<AuthContext> {
  const sessionContext = await getOptionalFastAuthSessionContext();
  if (!sessionContext) {
    throw new Error("Unauthorized");
  }
  return sessionContext.context;
}

export async function claimLegacyForCurrentSession(): Promise<LegacyClaimResult | null> {
  const sessionContext = await getOptionalFastAuthSessionContext();
  if (!sessionContext) {
    return null;
  }

  return claimLegacySingleUserData({
    userId: sessionContext.context.userId,
    workspaceId: sessionContext.context.workspaceId,
  });
}

export async function getAuthContext(): Promise<AuthContext> {
  if (isTestEnv) {
    return { ...TEST_FALLBACK_CONTEXT };
  }

  const headerStore = await headers();
  const sessionUser = await getOptionalSessionUserFromHeaders(headerStore);
  if (!sessionUser) {
    throw new Error("Unauthorized");
  }

  return buildAuthContextFromSession(sessionUser);
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

  const session = await getAuth().api.getSession({ headers: request.headers });
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
