"use server";

import { openOrCreateDemoProject, resetDemoProject } from "@/lib/server/demo-project";
import { withAction, withValidatedAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import { projectIdSchema } from "@/lib/schemas/ids";
import type { Project } from "@/types/project";

export async function openOrCreateDemoProjectAction(): Promise<ActionResult<Project>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      openOrCreateDemoProject({ ownerId: userId, workspaceId }),
    ),
  );
}

export async function resetDemoProjectAction(projectId: string): Promise<ActionResult<Project>> {
  return withValidatedAction(projectIdSchema, projectId,
    (id) => withAuth(({ userId, workspaceId }) =>
      resetDemoProject({ ownerId: userId, workspaceId }, id),
    ),
    "Failed to reset the sample project. Please try again.",
  );
}
