"use server";

import { openOrCreateDemoProject, resetDemoProject } from "@/lib/server/demo-project";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import { withAction, type ActionResult } from "@/lib/server/action-utils";
import type { Project } from "@/types/project";

export async function openOrCreateDemoProjectAction(): Promise<ActionResult<Project>> {
  return withAction(() => openOrCreateDemoProject(SINGLE_USER_SCOPE));
}

export async function resetDemoProjectAction(projectId: string): Promise<ActionResult<Project>> {
  return withAction(
    () => resetDemoProject(SINGLE_USER_SCOPE, projectId),
    "Failed to reset the sample project. Please try again.",
  );
}
