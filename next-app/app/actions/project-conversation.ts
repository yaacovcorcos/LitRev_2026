"use server";

import { z } from "zod";
import type { ProjectConversationState } from "@/lib/project-conversation-storage";
import { getProjectConversationState, saveProjectConversationState } from "@/lib/server/project-conversation";
import { withValidatedAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { projectIdSchema } from "@/lib/schemas/ids";
import { projectConversationStateSchema } from "@/lib/schemas/project-conversation";

export async function getProjectConversationAction(projectId: string): Promise<ActionResult<ProjectConversationState | null>> {
  return withValidatedAction(projectIdSchema, projectId,
    (id) => withAuth(({ userId, workspaceId }) =>
      getProjectConversationState({ ownerId: userId, workspaceId }, id),
    ),
  );
}

const saveProjectConversationSchema = z.object({
  projectId: projectIdSchema,
  state: projectConversationStateSchema,
});

export async function saveProjectConversationAction(
  projectId: string,
  state: ProjectConversationState
): Promise<ActionResult<ProjectConversationState>> {
  return withValidatedAction(saveProjectConversationSchema, { projectId, state },
    (v) => withAuth(({ userId, workspaceId }) =>
      saveProjectConversationState({ ownerId: userId, workspaceId }, v.projectId, v.state as ProjectConversationState),
    ),
  );
}
