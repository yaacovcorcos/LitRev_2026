"use server";

import type { ProjectCopilotState } from "@/lib/projectCopilotStorage";
import { getProjectCopilotState, saveProjectCopilotState } from "@/lib/server/projectCopilot";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";

export async function getProjectCopilotAction(projectId: string): Promise<ProjectCopilotState | null> {
  return getProjectCopilotState(SINGLE_USER_SCOPE, projectId);
}

export async function saveProjectCopilotAction(
  projectId: string,
  state: ProjectCopilotState
): Promise<ProjectCopilotState> {
  return saveProjectCopilotState(SINGLE_USER_SCOPE, projectId, state);
}
