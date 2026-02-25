import "server-only";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { runWithActorContext } from "@/lib/server/actor";
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

export async function getAuthContext(): Promise<AuthContext> {
  if (isTestEnv) {
    return { ...TEST_FALLBACK_CONTEXT };
  }

  const headerStore = await headers();
  const session = await auth.api.getSession({ headers: headerStore });

  if (!session) {
    throw new Error("Unauthorized");
  }

  const membership = await ensureDefaultWorkspaceMembership(
    session.user.id,
    session.user.name,
  );

  return {
    userId: session.user.id,
    workspaceId: membership.workspaceId,
    role: membership.role,
  };
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

  if (!session) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    };
  }

  const membership = await ensureDefaultWorkspaceMembership(
    session.user.id,
    session.user.name,
  );

  return {
    ok: true,
    context: {
      userId: session.user.id,
      workspaceId: membership.workspaceId,
      role: membership.role,
    },
  };
}
