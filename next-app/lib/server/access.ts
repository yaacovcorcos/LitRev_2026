import "server-only";

import { prisma } from "@/lib/server/prisma";
import { requireScope, type ServiceScope, type ScopeInput } from "@/lib/server/scope";
import type { ConversationContext } from "@/types/ai";

function normalizeRequiredId(value: string, label: string): string {
  const id = value?.trim();
  if (!id) {
    throw new Error(`${label} is required.`);
  }
  return id;
}

function normalizeOptionalId(value: string | null | undefined): string | null {
  const id = value?.trim();
  return id ? id : null;
}

export async function assertProjectAccess(
  scopeInput: ScopeInput,
  projectId: string
): Promise<ServiceScope> {
  const id = normalizeRequiredId(projectId, "Project ID");
  const scope = requireScope(scopeInput ?? undefined);
  const project = await prisma.project.findFirst({
    where: {
      id,
      workspaceId: scope.workspaceId,
      ownerId: scope.ownerId,
    },
    select: { id: true },
  });
  if (!project) {
    throw new Error("Project not found or access denied.");
  }
  return scope;
}

export async function assertStudyAccess(
  scopeInput: ScopeInput,
  studyId: string,
  expectedProjectId?: string | null,
): Promise<ServiceScope & { projectId: string; studyId: string }> {
  const id = normalizeRequiredId(studyId, "Study ID");
  const projectId = normalizeOptionalId(expectedProjectId);
  const scope = requireScope(scopeInput ?? undefined);
  const study = await prisma.study.findFirst({
    where: {
      id,
      ...(projectId ? { projectId } : {}),
      project: {
        workspaceId: scope.workspaceId,
        ownerId: scope.ownerId,
      },
    },
    select: {
      id: true,
      projectId: true,
    },
  });
  if (!study) {
    throw new Error("Study not found or access denied.");
  }
  return {
    ...scope,
    projectId: study.projectId,
    studyId: study.id,
  };
}

export type OwnedConversationScope = ServiceScope & {
  projectId: string | null;
  studyId: string | null;
  context: ConversationContext;
};

export async function resolveOwnedConversationScope(
  scopeInput: ScopeInput,
  input: {
    projectId?: string | null;
    studyId?: string | null;
  },
): Promise<OwnedConversationScope> {
  const projectId = normalizeOptionalId(input.projectId);
  const studyId = normalizeOptionalId(input.studyId);

  if (studyId) {
    const resolved = await assertStudyAccess(scopeInput, studyId, projectId);
    return {
      ...resolved,
      context: "study",
    };
  }

  if (projectId) {
    const scope = await assertProjectAccess(scopeInput, projectId);
    return {
      ...scope,
      projectId,
      studyId: null,
      context: "project",
    };
  }

  const scope = requireScope(scopeInput ?? undefined);
  return {
    ...scope,
    projectId: null,
    studyId: null,
    context: "global",
  };
}
