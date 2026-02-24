"use server";

import type { ProjectCopilotState } from "@/lib/projectCopilotStorage";
import { getProjectCopilotState, saveProjectCopilotState } from "@/lib/server/projectCopilot";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import { withAction, type ActionResult } from "@/lib/server/action-utils";

export async function getProjectCopilotAction(projectId: string): Promise<ActionResult<ProjectCopilotState | null>> {
  return withAction(() => getProjectCopilotState(SINGLE_USER_SCOPE, projectId));
}

export async function saveProjectCopilotAction(
  projectId: string,
  state: ProjectCopilotState
): Promise<ActionResult<ProjectCopilotState>> {
  return withAction(() => saveProjectCopilotState(SINGLE_USER_SCOPE, projectId, state));
}
