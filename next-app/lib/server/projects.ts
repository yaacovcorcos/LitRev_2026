import "server-only";

import { prisma } from "@/lib/server/prisma";
import { requireScope, type ScopeInput } from "@/lib/server/scope";
import type { Prisma } from "@prisma/client";
import type { Project, ProjectProgress, ProjectStatus } from "@/types/project";
import { createDefaultProtocolData } from "@/types/protocol";

const PROJECT_STATUS_VALUES = new Set<ProjectStatus>(["harvesting", "ready"]);

function parseProjectStatus(value: string): ProjectStatus {
  if (PROJECT_STATUS_VALUES.has(value as ProjectStatus)) {
    return value as ProjectStatus;
  }
  throw new Error(`Invalid project status: ${value}`);
}

export type ProjectInput = Omit<Project, "id"> & { id?: string };

function toDate(value?: string | Date): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function toJsonObject(value?: ProjectProgress): Prisma.InputJsonValue | undefined {
  if (!value) return undefined;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizeProjectInput(input: ProjectInput): ProjectInput {
  const name = input.name?.trim();
  if (!name) throw new Error("Project name is required.");
  const status = input.status?.trim();
  if (!status) throw new Error("Project status is required.");
  const parsedStatus = parseProjectStatus(status);
  const statusText = input.statusText?.trim();
  if (!statusText) throw new Error("Project statusText is required.");
  return {
    ...input,
    name,
    status: parsedStatus,
    statusText,
    description: input.description?.trim() || undefined,
  };
}

function normalizeProjectUpdates(updates: Partial<ProjectInput>): Partial<ProjectInput> {
  const normalized: Partial<ProjectInput> = { ...updates };

  if (typeof updates.name !== "undefined") {
    const name = updates.name?.trim();
    if (!name) throw new Error("Project name is required.");
    normalized.name = name;
  }

  if (typeof updates.status !== "undefined") {
    const status = updates.status?.trim();
    if (!status) throw new Error("Project status is required.");
    normalized.status = parseProjectStatus(status);
  }

  if (typeof updates.statusText !== "undefined") {
    const statusText = updates.statusText?.trim();
    if (!statusText) throw new Error("Project statusText is required.");
    normalized.statusText = statusText;
  }

  if (typeof updates.description !== "undefined") {
    normalized.description = updates.description?.trim() || undefined;
  }

  return normalized;
}

function toProject(record: {
  id: string;
  name: string;
  description: string | null;
  status: string;
  statusText: string;
  papers: number | null;
  progress: unknown;
  created: Date;
  modified: Date;
}): Project {
  const status = parseProjectStatus(record.status.trim());
  return {
    id: record.id,
    name: record.name,
    description: record.description ?? undefined,
    status,
    statusText: record.statusText,
    papers: record.papers ?? undefined,
    progress: (record.progress as ProjectProgress | null) ?? undefined,
    created: record.created.toISOString(),
    modified: record.modified.toISOString(),
  };
}

export async function listProjects(scopeInput: ScopeInput): Promise<Project[]> {
  const scope = requireScope(scopeInput ?? undefined);
  const projects = await prisma.project.findMany({
    where: { workspaceId: scope.workspaceId, ownerId: scope.ownerId },
    orderBy: { modified: "desc" },
  });
  return projects.map(toProject);
}

export async function getProject(
  scopeInput: ScopeInput,
  projectId: string
): Promise<Project | null> {
  const scope = requireScope(scopeInput ?? undefined);
  const project = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: scope.workspaceId, ownerId: scope.ownerId },
  });
  return project ? toProject(project) : null;
}

export async function createProject(
  scopeInput: ScopeInput,
  input: ProjectInput
): Promise<Project> {
  const scope = requireScope(scopeInput ?? undefined);
  const normalized = normalizeProjectInput(input);
  const created = toDate(normalized.created) ?? new Date();
  const modified = toDate(normalized.modified) ?? created;
  const createdProject = await prisma.project.create({
    data: {
      id: normalized.id ?? undefined,
      workspaceId: scope.workspaceId,
      ownerId: scope.ownerId,
      name: normalized.name,
      description: normalized.description ?? undefined,
      status: normalized.status,
      statusText: normalized.statusText,
      papers: normalized.papers ?? undefined,
      progress: toJsonObject(normalized.progress),
      created,
      modified,
      protocol: {
        create: { data: createDefaultProtocolData() as unknown as Prisma.InputJsonValue },
      },
    },
  });
  return toProject(createdProject);
}

export async function updateProject(
  scopeInput: ScopeInput,
  projectId: string,
  updates: Partial<ProjectInput>
): Promise<Project> {
  const scope = requireScope(scopeInput ?? undefined);
  const existing = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: scope.workspaceId, ownerId: scope.ownerId },
  });
  if (!existing) {
    throw new Error("Project not found or access denied.");
  }
  const normalized = updates.name
    ? normalizeProjectInput({ ...existing, ...updates } as ProjectInput)
    : normalizeProjectUpdates(updates);
  const updated = await prisma.project.update({
    where: { id: projectId },
    data: {
      name: normalized.name ?? undefined,
      description: normalized.description ?? undefined,
      status: normalized.status ?? undefined,
      statusText: normalized.statusText ?? undefined,
      papers: normalized.papers ?? undefined,
      progress: toJsonObject(normalized.progress),
      modified: toDate(normalized.modified) ?? new Date(),
    },
  });
  return toProject(updated);
}

export async function deleteProject(
  scopeInput: ScopeInput,
  projectId: string
): Promise<void> {
  const scope = requireScope(scopeInput ?? undefined);
  const existing = await prisma.project.findFirst({
    where: { id: projectId, workspaceId: scope.workspaceId, ownerId: scope.ownerId },
    select: { id: true },
  });
  if (!existing) return;
  await prisma.project.delete({ where: { id: projectId } });
}
