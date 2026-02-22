"use server";

import { openOrCreateDemoProject, resetDemoProject } from "@/lib/server/demo-project";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import type { Project } from "@/types/project";

export async function openOrCreateDemoProjectAction(): Promise<Project> {
  return openOrCreateDemoProject(SINGLE_USER_SCOPE);
}

export async function resetDemoProjectAction(projectId: string): Promise<Project> {
  return resetDemoProject(SINGLE_USER_SCOPE, projectId);
}
