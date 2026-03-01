"use server";

import { z } from "zod";
import type { ProjectCopilotState } from "@/lib/projectCopilotStorage";
import { getProjectCopilotState, saveProjectCopilotState } from "@/lib/server/projectCopilot";
import { withValidatedAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { projectIdSchema } from "@/lib/schemas/ids";
import { projectCopilotStateSchema } from "@/lib/schemas/copilot";

export async function getProjectCopilotAction(projectId: string): Promise<ActionResult<ProjectCopilotState | null>> {
  return withValidatedAction(projectIdSchema, projectId,
    (id) => withAuth(({ userId, workspaceId }) =>
      getProjectCopilotState({ ownerId: userId, workspaceId }, id),
    ),
  );
}

const saveCopilotInput = z.object({
  projectId: projectIdSchema,
  state: projectCopilotStateSchema,
});

export async function saveProjectCopilotAction(
  projectId: string,
  state: ProjectCopilotState
): Promise<ActionResult<ProjectCopilotState>> {
  return withValidatedAction(saveCopilotInput, { projectId, state },
    (v) => withAuth(({ userId, workspaceId }) =>
      saveProjectCopilotState({ ownerId: userId, workspaceId }, v.projectId, v.state as ProjectCopilotState),
    ),
  );
}
