import "server-only";

import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import type { ProjectCopilotState } from "@/lib/projectCopilotStorage";
import type { ServiceScope } from "@/lib/server/scope";

export async function getProjectCopilotState(
  scopeInput: Partial<ServiceScope> | null | undefined,
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
  scopeInput: Partial<ServiceScope> | null | undefined,
  projectId: string,
  state: ProjectCopilotState
): Promise<ProjectCopilotState> {
  await assertProjectAccess(scopeInput, projectId);
  const project = await prisma.project.update({
    where: { id: projectId },
    data: { projectCopilot: state },
    select: { projectCopilot: true },
  });
  return project.projectCopilot as ProjectCopilotState;
}
