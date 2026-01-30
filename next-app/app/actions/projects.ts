"use server";

import { createProject, deleteProject, getProject, listProjects, updateProject } from "@/lib/server/projects";
import { ensureSingleUserSeed } from "@/lib/server/bootstrap";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import type { Project } from "@/types/project";

export async function listProjectsAction(): Promise<Project[]> {
  await ensureSingleUserSeed(SINGLE_USER_SCOPE);
  return listProjects(SINGLE_USER_SCOPE);
}

export async function getProjectAction(projectId: string): Promise<Project | null> {
  await ensureSingleUserSeed(SINGLE_USER_SCOPE);
  return getProject(SINGLE_USER_SCOPE, projectId);
}

export async function createProjectAction(project: Project): Promise<Project> {
  await ensureSingleUserSeed(SINGLE_USER_SCOPE);
  return createProject(SINGLE_USER_SCOPE, project);
}

export async function updateProjectAction(projectId: string, updates: Partial<Project>): Promise<Project> {
  return updateProject(SINGLE_USER_SCOPE, projectId, updates);
}

export async function deleteProjectAction(projectId: string): Promise<void> {
  return deleteProject(SINGLE_USER_SCOPE, projectId);
}
