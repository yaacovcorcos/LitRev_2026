import "server-only";

import { prisma } from "@/lib/server/prisma";
import { requireScope, type ServiceScope, type ScopeInput } from "@/lib/server/scope";

export async function ensureSingleUserSeed(scopeInput?: ScopeInput): Promise<ServiceScope> {
  const scope = requireScope(scopeInput ?? undefined);

  await prisma.user.upsert({
    where: { id: scope.ownerId },
    update: {
      email: `${scope.ownerId}@local.invalid`,
      name: "Local User",
      emailVerified: false,
    },
    create: {
      id: scope.ownerId,
      email: `${scope.ownerId}@local.invalid`,
      name: "Local User",
      emailVerified: false,
    },
  });

  await prisma.workspace.upsert({
    where: { id: scope.workspaceId },
    update: {},
    create: {
      id: scope.workspaceId,
      name: "Local Workspace",
    },
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId: scope.workspaceId,
        userId: scope.ownerId,
      },
    },
    update: {},
    create: {
      workspaceId: scope.workspaceId,
      userId: scope.ownerId,
      role: "owner",
    },
  });

  return scope;
}
