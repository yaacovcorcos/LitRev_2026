"use server";

import { z } from "zod";
import { createProject, deleteProject, getProject, listProjects, updateProject } from "@/lib/server/projects";
import { withAction, withValidatedAction, type ActionResult } from "@/lib/server/action-utils";
import { withAuth } from "@/lib/server/auth/session";
import type { Project } from "@/types/project";
import { projectIdSchema } from "@/lib/schemas/ids";
import { projectSchema, projectUpdatesSchema } from "@/lib/schemas/project";

export async function listProjectsAction(): Promise<ActionResult<Project[]>> {
  return withAction(() =>
    withAuth(({ userId, workspaceId }) =>
      listProjects({ ownerId: userId, workspaceId }),
    ),
  );
}

export async function getProjectAction(projectId: string): Promise<ActionResult<Project | null>> {
  return withValidatedAction(projectIdSchema, projectId,
    (id) => withAuth(({ userId, workspaceId }) =>
      getProject({ ownerId: userId, workspaceId }, id),
    ),
  );
}

export async function createProjectAction(project: Project): Promise<ActionResult<Project>> {
  return withValidatedAction(projectSchema, project,
    (v) => withAuth(({ userId, workspaceId }) =>
      createProject({ ownerId: userId, workspaceId }, v as Project),
    ),
  );
}

const updateProjectInput = z.object({
  projectId: projectIdSchema,
  updates: projectUpdatesSchema,
});

export async function updateProjectAction(projectId: string, updates: Partial<Project>): Promise<ActionResult<Project>> {
  return withValidatedAction(updateProjectInput, { projectId, updates },
    (v) => withAuth(({ userId, workspaceId }) =>
      updateProject({ ownerId: userId, workspaceId }, v.projectId, v.updates as Partial<Project>),
    ),
  );
}

export async function deleteProjectAction(projectId: string): Promise<ActionResult<void>> {
  return withValidatedAction(projectIdSchema, projectId,
    (id) => withAuth(({ userId, workspaceId }) =>
      deleteProject({ ownerId: userId, workspaceId }, id),
    ),
  );
}
