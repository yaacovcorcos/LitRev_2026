import "server-only";

import { prisma } from "@/lib/server/prisma";
import { requireScope, type ServiceScope } from "@/lib/server/scope";

export async function assertProjectAccess(
  scopeInput: Partial<ServiceScope> | null | undefined,
  projectId: string
): Promise<ServiceScope> {
  const id = projectId?.trim();
  if (!id) {
    throw new Error("Project ID is required.");
  }
  const scope = requireScope(scopeInput ?? undefined);
  const project = await prisma.project.findFirst({
    where: {
      id,
      workspaceId: scope.workspaceId,
      ownerId: scope.ownerId,
    },
    select: { id: true },
  });
  if (!project) {
    throw new Error("Project not found or access denied.");
  }
  return scope;
}
