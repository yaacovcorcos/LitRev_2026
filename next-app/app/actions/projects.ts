"use server";

import { createProject, deleteProject, getProject, listProjects, updateProject } from "@/lib/server/projects";
import { ensureSingleUserSeed } from "@/lib/server/bootstrap";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import { withAction, type ActionResult } from "@/lib/server/action-utils";
import type { Project } from "@/types/project";

export async function listProjectsAction(): Promise<ActionResult<Project[]>> {
  return withAction(async () => {
    await ensureSingleUserSeed(SINGLE_USER_SCOPE);
    return listProjects(SINGLE_USER_SCOPE);
  });
}

export async function getProjectAction(projectId: string): Promise<ActionResult<Project | null>> {
  return withAction(async () => {
    await ensureSingleUserSeed(SINGLE_USER_SCOPE);
    return getProject(SINGLE_USER_SCOPE, projectId);
  });
}

export async function createProjectAction(project: Project): Promise<ActionResult<Project>> {
  return withAction(async () => {
    await ensureSingleUserSeed(SINGLE_USER_SCOPE);
    return createProject(SINGLE_USER_SCOPE, project);
  });
}

export async function updateProjectAction(projectId: string, updates: Partial<Project>): Promise<ActionResult<Project>> {
  return withAction(() => updateProject(SINGLE_USER_SCOPE, projectId, updates));
}

export async function deleteProjectAction(projectId: string): Promise<ActionResult<void>> {
  return withAction(() => deleteProject(SINGLE_USER_SCOPE, projectId));
}
