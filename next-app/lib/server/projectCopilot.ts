import "server-only";

import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import type { ProjectCopilotState } from "@/lib/projectCopilotStorage";
import type { ScopeInput } from "@/lib/server/scope";

export async function getProjectCopilotState(
  scopeInput: ScopeInput,
  projectId: string
): Promise<ProjectCopilotState | null> {
  await assertProjectAccess(scopeInput, projectId);
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { projectCopilot: true },
  });
  return (project?.projectCopilot as ProjectCopilotState) ?? null;
}

export async function saveProjectCopilotState(
  scopeInput: ScopeInput,
  projectId: string,
  state: ProjectCopilotState
): Promise<ProjectCopilotState> {
  await assertProjectAccess(scopeInput, projectId);
  const project = await prisma.project.update({
    where: { id: projectId },
    data: { projectCopilot: state as object },
    select: { projectCopilot: true },
  });
  return project.projectCopilot as ProjectCopilotState;
}
