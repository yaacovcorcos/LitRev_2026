import "server-only";

import type { Prisma } from "@prisma/client";
import {
  buildDraftCheckpointSnapshot,
  compareDraftCheckpointSnapshot,
  normalizeDraftCheckpointSnapshot,
  rebuildDraftStateFromCheckpointSnapshot,
  toDraftCheckpointRecord,
  type DraftCheckpointComparison,
  type DraftCheckpointKind,
  type DraftCheckpointRecord,
} from "@/lib/draft-checkpoints";
import { createDefaultDraftState, type DraftState, type DraftStateInput } from "@/lib/draft-storage";
import { assertProjectAccess } from "@/lib/server/access";
import { getDraft, saveDraft } from "@/lib/server/drafts";
import { prisma } from "@/lib/server/prisma";
import type { ScopeInput } from "@/lib/server/scope";

export type CreateDraftCheckpointInput = {
  projectId: string;
  label?: string;
  kind: DraftCheckpointKind;
  draftState: DraftStateInput;
  fileAssetId?: string;
  artifactId?: string;
  conversationId?: string;
};

export type RestoreDraftCheckpointResult = {
  checkpoint: DraftCheckpointRecord;
  draft: DraftState;
};

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizeOptionalText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

async function assertCheckpointLinkagesBelongToProject(
  projectId: string,
  input: Pick<CreateDraftCheckpointInput, "fileAssetId" | "artifactId" | "conversationId">,
): Promise<void> {
  const [fileAsset, artifact, conversation] = await Promise.all([
    input.fileAssetId
      ? prisma.fileAsset.findFirst({
          where: { id: input.fileAssetId, projectId },
          select: { id: true },
        })
      : Promise.resolve(null),
    input.artifactId
      ? prisma.artifact.findFirst({
          where: { id: input.artifactId, projectId },
          select: { id: true },
        })
      : Promise.resolve(null),
    input.conversationId
      ? prisma.aIConversation.findFirst({
          where: { id: input.conversationId, projectId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  if (input.fileAssetId && !fileAsset) {
    throw new Error("Checkpoint file asset not found in project.");
  }
  if (input.artifactId && !artifact) {
    throw new Error("Checkpoint artifact not found in project.");
  }
  if (input.conversationId && !conversation) {
    throw new Error("Checkpoint conversation not found in project.");
  }
}

async function getCheckpointOrThrow(projectId: string, checkpointId: string) {
  const checkpoint = await prisma.draftCheckpoint.findFirst({
    where: { id: checkpointId, projectId },
  });
  if (!checkpoint) {
    throw new Error("Draft checkpoint not found.");
  }
  return checkpoint;
}

export async function createDraftCheckpoint(
  scopeInput: ScopeInput,
  input: CreateDraftCheckpointInput,
): Promise<DraftCheckpointRecord> {
  const scope = await assertProjectAccess(scopeInput, input.projectId);
  await assertCheckpointLinkagesBelongToProject(input.projectId, input);

  const snapshot = buildDraftCheckpointSnapshot(input.draftState);
  const created = await prisma.draftCheckpoint.create({
    data: {
      projectId: input.projectId,
      workspaceId: scope.workspaceId,
      label: normalizeOptionalText(input.label),
      kind: input.kind,
      snapshot: toJsonValue(snapshot),
      fileAssetId: input.fileAssetId ?? null,
      artifactId: input.artifactId ?? null,
      conversationId: input.conversationId ?? null,
    },
  });

  return toDraftCheckpointRecord(created);
}

export async function listDraftCheckpoints(
  scopeInput: ScopeInput,
  projectId: string,
): Promise<DraftCheckpointRecord[]> {
  await assertProjectAccess(scopeInput, projectId);
  const checkpoints = await prisma.draftCheckpoint.findMany({
    where: { projectId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return checkpoints.map(toDraftCheckpointRecord);
}

export async function getDraftCheckpoint(
  scopeInput: ScopeInput,
  projectId: string,
  checkpointId: string,
): Promise<DraftCheckpointRecord> {
  await assertProjectAccess(scopeInput, projectId);
  const checkpoint = await getCheckpointOrThrow(projectId, checkpointId);
  return toDraftCheckpointRecord(checkpoint);
}

export async function compareDraftCheckpoint(
  scopeInput: ScopeInput,
  projectId: string,
  checkpointId: string,
): Promise<DraftCheckpointComparison> {
  await assertProjectAccess(scopeInput, projectId);
  const [checkpoint, currentDraft] = await Promise.all([
    getCheckpointOrThrow(projectId, checkpointId),
    getDraft(scopeInput, projectId),
  ]);

  return compareDraftCheckpointSnapshot(
    currentDraft ?? createDefaultDraftState(),
    normalizeDraftCheckpointSnapshot(checkpoint.snapshot),
    checkpoint.id,
  );
}

export async function restoreDraftCheckpoint(
  scopeInput: ScopeInput,
  projectId: string,
  checkpointId: string,
): Promise<RestoreDraftCheckpointResult> {
  await assertProjectAccess(scopeInput, projectId);
  const [checkpoint, currentDraft] = await Promise.all([
    getCheckpointOrThrow(projectId, checkpointId),
    getDraft(scopeInput, projectId),
  ]);

  const normalizedSnapshot = normalizeDraftCheckpointSnapshot(checkpoint.snapshot);
  const restoredDraft = rebuildDraftStateFromCheckpointSnapshot(normalizedSnapshot, currentDraft);
  const savedDraft = await saveDraft(scopeInput, projectId, restoredDraft);

  return {
    checkpoint: toDraftCheckpointRecord(checkpoint),
    draft: savedDraft,
  };
}
