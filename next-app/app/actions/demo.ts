"use server";

import { openOrCreateDemoProject, resetDemoProject } from "@/lib/server/demo-project";
import { withAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import type { Project } from "@/types/project";

export async function openOrCreateDemoProjectAction(): Promise<ActionResult<Project>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      openOrCreateDemoProject({ ownerId: userId, workspaceId }),
    ),
  );
}

export async function resetDemoProjectAction(): Promise<ActionResult<Project>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      resetDemoProject({ ownerId: userId, workspaceId }),
    ),
    "Failed to reset the sample project. Please try again.",
  );
}
