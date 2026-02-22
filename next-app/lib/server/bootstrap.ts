import "server-only";

import { prisma } from "@/lib/server/prisma";
import { requireScope, type ServiceScope, type ScopeInput } from "@/lib/server/scope";

export async function ensureSingleUserSeed(scopeInput?: ScopeInput): Promise<ServiceScope> {
  const scope = requireScope(scopeInput ?? undefined);

  await prisma.user.upsert({
    where: { id: scope.ownerId },
    update: {},
    create: {
      id: scope.ownerId,
      name: "Local User",
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
