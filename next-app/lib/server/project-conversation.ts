import "server-only";

import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import type { ProjectConversationState } from "@/lib/project-conversation-storage";
import type { ScopeInput } from "@/lib/server/scope";

export async function getProjectConversationState(
  scopeInput: ScopeInput,
  projectId: string
): Promise<ProjectConversationState | null> {
  await assertProjectAccess(scopeInput, projectId);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { projectConversation: true },
  });
  return (project?.projectConversation as ProjectConversationState) ?? null;
}

export async function saveProjectConversationState(
  scopeInput: ScopeInput,
  projectId: string,
  state: ProjectConversationState
): Promise<ProjectConversationState> {
  await assertProjectAccess(scopeInput, projectId);
  const project = await prisma.project.update({
    where: { id: projectId },
    data: { projectConversation: state as object },
    select: { projectConversation: true },
  });
  return project.projectConversation as ProjectConversationState;
}
