"use server";

import { createProject, deleteProject, getProject, listProjects, updateProject } from "@/lib/server/projects";
import { withAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import type { Project } from "@/types/project";

export async function listProjectsAction(): Promise<ActionResult<Project[]>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      listProjects({ ownerId: userId, workspaceId }),
    ),
  );
}

export async function getProjectAction(projectId: string): Promise<ActionResult<Project | null>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      getProject({ ownerId: userId, workspaceId }, projectId),
    ),
  );
}

export async function createProjectAction(project: Project): Promise<ActionResult<Project>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      createProject({ ownerId: userId, workspaceId }, project),
    ),
  );
}

export async function updateProjectAction(projectId: string, updates: Partial<Project>): Promise<ActionResult<Project>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      updateProject({ ownerId: userId, workspaceId }, projectId, updates),
    ),
  );
}

export async function deleteProjectAction(projectId: string): Promise<ActionResult<void>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      deleteProject({ ownerId: userId, workspaceId }, projectId),
    ),
  );
}
