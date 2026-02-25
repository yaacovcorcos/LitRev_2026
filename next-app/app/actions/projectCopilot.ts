"use server";

import type { ProjectCopilotState } from "@/lib/projectCopilotStorage";
import { getProjectCopilotState, saveProjectCopilotState } from "@/lib/server/projectCopilot";
import { withAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";

export async function getProjectCopilotAction(projectId: string): Promise<ActionResult<ProjectCopilotState | null>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      getProjectCopilotState({ ownerId: userId, workspaceId }, projectId),
    ),
  );
}

export async function saveProjectCopilotAction(
  projectId: string,
  state: ProjectCopilotState
): Promise<ActionResult<ProjectCopilotState>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      saveProjectCopilotState({ ownerId: userId, workspaceId }, projectId, state),
    ),
  );
}
