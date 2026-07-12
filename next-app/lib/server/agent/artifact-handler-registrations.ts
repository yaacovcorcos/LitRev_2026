import "server-only";

import { Prisma } from "@prisma/client";
import { isDeepStrictEqual } from "node:util";
import type {
    ArtifactType,
    CriteriaCardPayload,
    DraftDiffPayload,
    EvidenceTablePayload,
    MemoryForgetProposalPayload,
    MemoryProposalPayload,
    ProtocolSuggestionPayload,
    ScreeningBatchPayload,
  StudyDeletionPayload,
    StudyProposalPayload,
    StudyUpdatePayload,
} from "@/types/artifacts";
import type { StudyDetails, StudySource, StudyType } from "@/types/ledger";
import { validateFieldValue, isValidFieldPath } from "@/lib/protocol-fields";
import {
    createProjectMemoryWithDb,
    getProjectMemories,
    getUserMemories,
    setUserMemoryWithDb,
} from "@/lib/server/memory";
import {
  normalizedMemoryKey,
  normalizedMemoryValue,
} from "@/lib/server/memory/conflict-policy";
import {
  createNoteTrusted,
  listNotesTrusted,
  textToTipTapDoc,
  updateNoteTrusted,
} from "@/lib/server/notes";
import { upsertStudyTrusted, updateStudyTrusted } from "@/lib/server/ledger";
import {
  ensureProtocolWithDb,
  saveProtocolTrusted,
} from "@/lib/server/protocols";
import { createDraftVersionTrusted } from "@/lib/server/draft-versions";
import { getDraftTrusted, saveDraftTrusted } from "@/lib/server/drafts";
import { buildDraftCheckpointSnapshot } from "@/lib/draft-checkpoints";
import { logServerWarn } from "@/lib/server/logging";
import { ArtifactError } from "./artifact-errors";
import type {
    AppliedStateReader,
    ApplyFunction,
    ArtifactExecutionContext,
    RestoreFunction,
    SnapshotReader,
} from "./artifact-execution";
import { parseArtifactUndoSnapshotEnvelope } from "./artifact-execution";

type ArtifactHandlerMaps = {
    applyFunctions: Map<ArtifactType, ApplyFunction>;
    snapshotReaders: Map<ArtifactType, SnapshotReader>;
    appliedStateReaders: Map<ArtifactType, AppliedStateReader>;
    restoreFunctions: Map<ArtifactType, RestoreFunction>;
};

export const ARTIFACT_UNDO_SUPPORTED_TYPES = [
  "criteria_card",
  "draft_diff",
  "protocol_suggestion",
  "study_proposal",
  "study_update",
  "study_deletion",
] as const satisfies readonly ArtifactType[];

export type ArtifactUndoSupportedType =
  (typeof ARTIFACT_UNDO_SUPPORTED_TYPES)[number];

const ARTIFACT_UNDO_SUPPORTED_TYPE_SET = new Set<ArtifactType>(
  ARTIFACT_UNDO_SUPPORTED_TYPES,
);

export function isArtifactUndoSupportedType(
  type: string,
): type is ArtifactUndoSupportedType {
  return ARTIFACT_UNDO_SUPPORTED_TYPE_SET.has(type as ArtifactType);
}

function setNestedValue(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
) {
    const keys = path.split(".");
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]] as Record<string, unknown>;
        if (!current) return;
    }
    current[keys[keys.length - 1]] = value;
}

function escapeMarkdownCell(value: unknown): string {
    return String(value ?? "")
        .replace(/\|/g, "\\|")
        .replace(/\r?\n/g, " ")
        .trim();
}

export function buildEvidenceTableMarkdown(
  payload: EvidenceTablePayload,
): string {
  const explicitColumns = payload.columns
    .map((column) => String(column).trim())
    .filter(Boolean);
  const inferredColumns = payload.rows.flatMap((row) =>
    Object.keys(row)
      .map((key) => key.trim())
      .filter(Boolean),
  );
  const columns =
    explicitColumns.length > 0
        ? explicitColumns
        : Array.from(new Set(inferredColumns));

    if (columns.length === 0) {
        return "## Evidence Table\n\n_No structured evidence rows were generated._";
    }

    const header = `| ${columns.map(escapeMarkdownCell).join(" | ")} |`;
    const separator = `| ${columns.map(() => "---").join(" | ")} |`;
    const lines = [header, separator];

    for (const row of payload.rows) {
    const values = columns.map((column) =>
      escapeMarkdownCell(row[column] ?? ""),
    );
        lines.push(`| ${values.join(" | ")} |`);
    }

    return `## Evidence Table\n\n${lines.join("\n")}`;
}

function resolveDraftDiffSectionKey(payload: DraftDiffPayload): string {
  if (
    typeof payload.sectionKey === "string" &&
    payload.sectionKey.trim().length > 0
  ) {
        return payload.sectionKey.trim().toLowerCase();
    }

    return payload.section.toLowerCase();
}

function serializeDraftSectionContent(value: unknown): string {
    return JSON.stringify(value ?? null);
}

type SnapshotValue = {
  exists: boolean;
  value: unknown | null;
};

type StudyUpdateUndoState = {
  id: string;
  version: string | null;
  top: Record<string, SnapshotValue>;
  details: Record<string, SnapshotValue>;
  detailsContainerWasNull: boolean;
};

type StudyDeletionUndoState = {
  id: string;
  version: string | null;
  deletedAt: string | null;
};

type StudyProposalUndoState = {
  id: string;
  version: string | null;
  title: string;
  authors: string;
  year: number;
  status: string;
  quality: string;
  details: unknown | null;
  deletedAt: string | null;
};

type ProtocolFieldUndoState = {
  version: string | null;
  field: string;
  value: SnapshotValue;
};

type CriteriaUndoState = {
  version: string | null;
  eligibility: {
    inclusion: string[];
    exclusion: string[];
  };
};

type DraftSectionUndoState = {
  version: string | null;
  sectionKey: string;
  content: SnapshotValue;
};

function snapshotVersion(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "string") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function snapshotValue(record: Record<string, unknown>, key: string): SnapshotValue {
  const exists = Object.prototype.hasOwnProperty.call(record, key);
  return {
    exists,
    value: exists ? (record[key] ?? null) : null,
  };
}

function nestedSnapshotValue(record: Record<string, unknown>, path: string): SnapshotValue {
  const keys = path.split(".");
  let current = record;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const next = current[keys[index]!];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      return { exists: false, value: null };
    }
    current = next as Record<string, unknown>;
  }
  return snapshotValue(current, keys[keys.length - 1]!);
}

function applyNestedSnapshot(
  obj: Record<string, unknown>,
  path: string,
  snapshot: SnapshotValue,
) {
  const keys = path.split(".");
  let current = obj;
  for (let index = 0; index < keys.length - 1; index += 1) {
    const key = keys[index]!;
    const next = current[key];
    if (!next || typeof next !== "object" || Array.isArray(next)) {
      if (!snapshot.exists) return;
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  const leaf = keys[keys.length - 1]!;
  if (snapshot.exists) {
    current[leaf] = snapshot.value;
  } else {
    delete current[leaf];
  }
}

function requireUndoEnvelope(artifact: Parameters<RestoreFunction>[1]) {
  const envelope = parseArtifactUndoSnapshotEnvelope(artifact.snapshot);
  if (!envelope) {
    throw new ArtifactError(
      "ARTIFACT_UNDO_CONFLICT",
      "Undo cannot be verified because the applied-state snapshot is missing.",
    );
  }
  return envelope;
}

function throwUndoConflict(message: string): never {
  throw new ArtifactError("ARTIFACT_UNDO_CONFLICT", message);
}

function normalizedCriterion(value: string): string {
  return value.toLowerCase().trim();
}

function findCriterionIndex(values: string[], criterion: string): number {
  const normalized = normalizedCriterion(criterion);
  return values.findIndex((value) => normalizedCriterion(value) === normalized);
}

async function lockStudyForUndo(
  ctx: ArtifactExecutionContext,
  studyId: string,
): Promise<void> {
  await ctx.db.$queryRaw`
    SELECT "id" FROM "Study"
    WHERE "id" = ${studyId} AND "projectId" = ${ctx.projectId}
    FOR UPDATE
  `;
}

async function lockProtocolForUndo(ctx: ArtifactExecutionContext): Promise<void> {
  await ctx.db.$queryRaw`
    SELECT "id" FROM "Protocol"
    WHERE "projectId" = ${ctx.projectId}
    FOR UPDATE
  `;
}

async function lockDraftForUndo(ctx: ArtifactExecutionContext): Promise<void> {
  await ctx.db.$queryRaw`
    SELECT "id" FROM "Draft"
    WHERE "projectId" = ${ctx.projectId}
    FOR UPDATE
  `;
}

function captureStudyUpdateState(
  row: {
    id: string;
    updatedAt?: Date | string;
    details: unknown;
    [key: string]: unknown;
  },
  payload: StudyUpdatePayload,
): StudyUpdateUndoState {
  const top: Record<string, SnapshotValue> = {};
  for (const key of Object.keys(payload.patch.top ?? {})) {
    top[key] = snapshotValue(row, key);
  }
  const detailRecord = row.details && typeof row.details === "object" && !Array.isArray(row.details)
    ? row.details as Record<string, unknown>
    : {};
  const details: Record<string, SnapshotValue> = {};
  for (const key of Object.keys(payload.patch.details ?? {})) {
    details[key] = snapshotValue(detailRecord, key);
  }
  return {
    id: row.id,
    version: snapshotVersion(row.updatedAt),
    top,
    details,
    detailsContainerWasNull: row.details == null,
  };
}

function studyUpdateTargetMatches(
  current: StudyUpdateUndoState,
  applied: StudyUpdateUndoState,
): boolean {
  return current.id === applied.id
    && isDeepStrictEqual(current.top, applied.top)
    && isDeepStrictEqual(current.details, applied.details);
}

function captureStudyProposalState(row: {
  id: string;
  updatedAt?: Date | string;
  title: string;
  authors: string;
  year: number;
  status: string;
  quality: string;
  details: unknown;
  deletedAt?: Date | string | null;
}): StudyProposalUndoState {
  return {
    id: row.id,
    version: snapshotVersion(row.updatedAt),
    title: row.title,
    authors: row.authors,
    year: row.year,
    status: row.status,
    quality: row.quality,
    details: row.details ?? null,
    deletedAt: snapshotVersion(row.deletedAt),
  };
}

function studyProposalTargetMatches(
  current: StudyProposalUndoState,
  applied: StudyProposalUndoState,
): boolean {
  return isDeepStrictEqual(
    { ...current, version: null },
    { ...applied, version: null },
  );
}

async function createDraftApplyCheckpoint(
    ctx: ArtifactExecutionContext,
    artifactId: string,
    conversationId: string | null,
    sectionLabel: string,
    draftState: Parameters<typeof buildDraftCheckpointSnapshot>[0],
): Promise<void> {
    await ctx.db.draftCheckpoint.create({
        data: {
            projectId: ctx.projectId,
            workspaceId: ctx.workspaceId,
            label: `Accepted AI draft proposal: ${sectionLabel}`,
            kind: "ai_apply",
            snapshot: buildDraftCheckpointSnapshot(draftState),
            artifactId,
            conversationId: conversationId ?? null,
        },
    });
}

async function applyCriteriaCard(
  ctx: ArtifactExecutionContext,
  payload: CriteriaCardPayload,
) {
    const data = await ensureProtocolWithDb(ctx.db, ctx.projectId);
  if (payload.mutation) {
    const { action, type, criterion } = payload.mutation;
    const list = data.eligibility[type];
    const normalizedCriterion = criterion.toLowerCase().trim();
    const index = list.findIndex(
      (entry) => entry.toLowerCase().trim() === normalizedCriterion,
    );
    if (action === "add" && index === -1) {
      list.push(criterion.trim());
    } else if (action === "remove" && index >= 0) {
      list.splice(index, 1);
    } else if (action === "remove") {
      throw new ArtifactError(
        "ARTIFACT_APPLY_FAILED",
        `The criterion changed after this proposal was created: ${criterion}`,
      );
    }
  } else {
    // Backward compatibility for already-persisted legacy criteria cards.
    data.eligibility.inclusion = payload.inclusion;
    data.eligibility.exclusion = payload.exclusion;
  }
    await saveProtocolTrusted(ctx.db, ctx.projectId, data);
    return {
    postCommitTasks: [
      {
            kind: "sync_protocol_to_memory" as const,
            projectId: ctx.projectId,
            protocolData: data,
      },
    ],
    };
}

async function applyProtocolSuggestion(
  ctx: ArtifactExecutionContext,
  payload: ProtocolSuggestionPayload,
) {
    if (!isValidFieldPath(payload.field)) {
    throw new ArtifactError(
      "ARTIFACT_INVALID_PAYLOAD",
      `Invalid protocol field: "${payload.field}"`,
    );
    }
    const fieldCheck = validateFieldValue(payload.field, payload.value);
    if (!fieldCheck.valid) {
    throw new ArtifactError(
      "ARTIFACT_INVALID_PAYLOAD",
      `Cannot apply protocol_suggestion: ${fieldCheck.error}`,
    );
    }

    const data = await ensureProtocolWithDb(ctx.db, ctx.projectId);
  setNestedValue(
    data as unknown as Record<string, unknown>,
    payload.field,
    fieldCheck.value,
  );
    await saveProtocolTrusted(ctx.db, ctx.projectId, data);
    return {
    postCommitTasks: [
      {
            kind: "sync_protocol_to_memory" as const,
            projectId: ctx.projectId,
            protocolData: data,
      },
    ],
    };
}

async function applyMemoryProposal(
    ctx: ArtifactExecutionContext,
    payload: MemoryProposalPayload,
    conversationId: string | null,
) {
    if (payload.memoryType === "user") {
        const userId = ctx.effectiveActorUserId;
        if (!userId) {
      throw new ArtifactError(
        "ARTIFACT_CONTEXT_MISSING",
        "User memory proposals require an acting user.",
      );
        }
        const key = normalizedMemoryKey(payload.key || `auto_${Date.now()}`);
        const keyTag = `memory-key:${key}`;
        const incomingValue = normalizedMemoryValue(payload.value);
    const activeUserMemories = await getUserMemories(
      userId,
      { status: "active" },
      ctx.db,
    );
    const sameLogicalKey = activeUserMemories.filter(
      (memory) => normalizedMemoryKey(memory.key) === key,
    );
    const hasConflict = sameLogicalKey.some(
      (memory) => normalizedMemoryValue(memory.value) !== incomingValue,
    );
        const variantIds = sameLogicalKey
            .filter((memory) => memory.key !== key)
            .map((memory) => memory.id);

        if (variantIds.length > 0) {
            await ctx.db.memoryEmbedding.deleteMany({
                where: { memoryType: "user", memoryId: { in: variantIds } },
            });
            await ctx.db.userMemory.updateMany({
                where: {
                    id: { in: variantIds },
                    userId,
                    status: "active",
                },
                data: {
                    status: "archived",
                    archivedAt: new Date(),
                    embeddingStatus: "pending",
                },
            });
        }

        await setUserMemoryWithDb(ctx.db, {
            userId,
            type: "preference",
            key,
            value: payload.value,
            rationale: payload.rationale,
            source: "artifact_accept",
            authority: "confirmed",
            tags: ["ai-proposed", keyTag],
        });
        await ctx.db.$executeRaw`
            UPDATE "UserMemory"
            SET "acceptedCount" = "acceptedCount" + 1,
                "contradictionCount" = "contradictionCount" + ${hasConflict ? 1 : 0}
            WHERE "userId" = ${userId}
              AND "key" = ${key}
        `;
        return;
    }

    if (payload.memoryType === "project") {
        const normalizedKey = payload.key ? normalizedMemoryKey(payload.key) : "";
        const keyTag = normalizedKey ? `memory-key:${normalizedKey}` : null;
        const normalizedValue = normalizedMemoryValue(payload.value);
        const memoryType = payload.projectMemoryType ?? "decision";
        let conflictCount = 0;

        if (keyTag) {
      const existing = await getProjectMemories(
        ctx.projectId,
        { status: "active", tags: [keyTag] },
        ctx.db,
      );
      const exact = existing.find(
        (memory) => normalizedMemoryValue(memory.statement) === normalizedValue,
      );
            if (exact) {
                await ctx.db.projectMemory.update({
                    where: { id: exact.id },
                    data: {
                        rationale: payload.rationale ?? exact.rationale,
                        embeddingStatus: "pending",
                    },
                });
                await ctx.db.$executeRaw`
                    UPDATE "ProjectMemory"
                    SET "acceptedCount" = "acceptedCount" + 1
                    WHERE "id" = ${exact.id}
                `;
                return;
            }

            const conflictingIds = existing
        .filter(
          (memory) =>
            normalizedMemoryValue(memory.statement) !== normalizedValue,
        )
                .map((memory) => memory.id);
            conflictCount = conflictingIds.length;
            if (conflictingIds.length > 0) {
                await ctx.db.memoryEmbedding.deleteMany({
                    where: { memoryType: "project", memoryId: { in: conflictingIds } },
                });
                await ctx.db.projectMemory.updateMany({
                    where: { id: { in: conflictingIds } },
                    data: {
                        status: "archived",
                        archivedAt: new Date(),
                        embeddingStatus: "pending",
                    },
                });
                const idValues = conflictingIds.map((id) => Prisma.sql`${id}`);
                await ctx.db.$executeRaw`
                    UPDATE "ProjectMemory"
                    SET "contradictionCount" = "contradictionCount" + 1
                    WHERE "id" IN (${Prisma.join(idValues)})
                `;
            }
        }

        const created = await createProjectMemoryWithDb(ctx.db, {
            projectId: ctx.projectId,
            type: memoryType,
            key: normalizedKey || undefined,
            category: payload.projectMemoryCategory,
            statement: payload.value,
            rationale: payload.rationale,
            importance: "normal",
            source: "artifact_accept",
            authority: "confirmed",
            polarity: payload.polarity ?? "affirming",
            sourceRefType: conversationId ? "conversation" : undefined,
            sourceRefId: conversationId ?? undefined,
            confidence: payload.confidence,
            tags: keyTag ? ["ai-proposed", keyTag] : ["ai-proposed"],
        });
        await ctx.db.$executeRaw`
            UPDATE "ProjectMemory"
            SET "acceptedCount" = "acceptedCount" + 1,
                "contradictionCount" = "contradictionCount" + ${conflictCount > 0 ? 1 : 0}
            WHERE "id" = ${created.id}
        `;
        return;
    }

    await createNoteTrusted(ctx.db, {
        projectId: ctx.projectId,
        title: payload.key || undefined,
        content: textToTipTapDoc(payload.value),
        source: "conversation",
        sourceConversationId: conversationId ?? undefined,
        tags: ["ai-proposed"],
    });
}

async function applyMemoryForgetProposal(
  ctx: ArtifactExecutionContext,
  payload: MemoryForgetProposalPayload,
) {
    const matchIds = payload.matches.map((match) => match.id);
    if (matchIds.length === 0) return;

    if (payload.memoryType === "user") {
        const userId = ctx.effectiveActorUserId;
        if (!userId) {
      throw new ArtifactError(
        "ARTIFACT_CONTEXT_MISSING",
        "User memory forget proposals require an acting user.",
      );
        }
        const scopedMatches = await ctx.db.userMemory.findMany({
            where: {
                id: { in: matchIds },
                userId,
                status: "active",
            },
            select: { id: true },
        });
        const scopedIds = scopedMatches.map((memory) => memory.id);
        if (scopedIds.length === 0) return;
        await ctx.db.memoryEmbedding.deleteMany({
            where: { memoryType: "user", memoryId: { in: scopedIds } },
        });
        await ctx.db.userMemory.updateMany({
            where: {
                id: { in: scopedIds },
                userId,
                status: "active",
            },
            data: {
                status: "archived",
                archivedAt: new Date(),
                embeddingStatus: "pending",
            },
        });
        const idValues = scopedIds.map((id) => Prisma.sql`${id}`);
        await ctx.db.$executeRaw`
            UPDATE "UserMemory"
            SET "rejectedCount" = "rejectedCount" + 1
            WHERE "id" IN (${Prisma.join(idValues)})
        `;
        return;
    }

    const scopedMatches = await ctx.db.projectMemory.findMany({
        where: {
            id: { in: matchIds },
            projectId: ctx.projectId,
            status: "active",
        },
        select: { id: true },
    });
    const scopedIds = scopedMatches.map((memory) => memory.id);
    if (scopedIds.length === 0) return;
    await ctx.db.memoryEmbedding.deleteMany({
        where: { memoryType: "project", memoryId: { in: scopedIds } },
    });
    await ctx.db.projectMemory.updateMany({
        where: {
            id: { in: scopedIds },
            projectId: ctx.projectId,
            status: "active",
        },
        data: {
            status: "archived",
            archivedAt: new Date(),
            embeddingStatus: "pending",
        },
    });
    const idValues = scopedIds.map((id) => Prisma.sql`${id}`);
    await ctx.db.$executeRaw`
        UPDATE "ProjectMemory"
        SET "rejectedCount" = "rejectedCount" + 1
        WHERE "id" IN (${Prisma.join(idValues)})
    `;
}

async function applyStudyProposal(
  ctx: ArtifactExecutionContext,
  payload: StudyProposalPayload,
) {
  const mappedStatus =
    payload.recommendation === "exclude"
        ? "excluded"
        : payload.recommendation === "keep"
            ? "active"
            : "pending";

  const normalizedSource: StudySource | undefined =
    payload.source === "manual" ||
    payload.source === "pdf-import" ||
    payload.source === "pubmed" ||
    payload.source === "semantic-scholar" ||
    payload.source === "copilot"
        ? payload.source
        : payload.source
            ? "copilot"
            : undefined;

    const detailPatch: Partial<StudyDetails> = {
        triageDecision: payload.recommendation,
    };
  if (payload.matchRationale)
    detailPatch.matchRationale = payload.matchRationale;
    if (normalizedSource) detailPatch.source = normalizedSource;
    if (payload.sourceUrl) detailPatch.sourceUrl = payload.sourceUrl;
    if (payload.doi) detailPatch.doi = payload.doi;
    if (payload.pmid) detailPatch.pmid = payload.pmid;
    if (payload.abstract) detailPatch.abstract = payload.abstract;
    if (payload.journal) detailPatch.journal = payload.journal;
    if (payload.studyType) detailPatch.studyType = payload.studyType as StudyType;
  if (typeof payload.sampleSize === "number")
    detailPatch.sampleSize = payload.sampleSize;

    if (payload.studyId) {
        const existing = await ctx.db.study.findFirst({
            where: { id: payload.studyId, projectId: ctx.projectId, deletedAt: null },
            select: { id: true },
        });
        if (existing) {
      return updateStudyTrusted(
        ctx.db,
        ctx.projectId,
        ctx.workspaceId,
        existing.id,
        {
                status: mappedStatus,
                details: detailPatch,
        },
      );
        }
    }

    return upsertStudyTrusted(ctx.db, ctx.projectId, ctx.workspaceId, {
        id: payload.studyId,
        title: payload.title,
        authors: payload.authors,
        year: payload.year,
        status: mappedStatus,
        quality: "-",
        details: detailPatch,
    });
}

async function applyStudyDeletion(
  ctx: ArtifactExecutionContext,
  payload: StudyDeletionPayload,
) {
  const deleted = await ctx.db.study.updateMany({
    where: {
      id: payload.studyId,
      projectId: ctx.projectId,
      deletedAt: null,
    },
    data: { deletedAt: new Date() },
  });
  if (deleted.count !== 1) {
    throw new ArtifactError(
      "ARTIFACT_APPLY_FAILED",
      `Active study not found: ${payload.studyId}`,
    );
  }
}

async function applyStudyUpdate(
  ctx: ArtifactExecutionContext,
  artifactId: string,
  payload: StudyUpdatePayload,
) {
    const existingArtifact = await ctx.db.artifact.findUnique({
        where: { id: artifactId },
        select: { appliedAt: true },
    });
    if (existingArtifact?.appliedAt) return;

    const currentStudy = await ctx.db.study.findFirst({
        where: { id: payload.studyId, projectId: ctx.projectId, deletedAt: null },
        select: { updatedAt: true },
    });
    if (!currentStudy) {
    throw new ArtifactError(
      "ARTIFACT_APPLY_FAILED",
      `Study not found: ${payload.studyId}`,
    );
    }

    const snapshotMs = new Date(payload.snapshotAt).getTime();
    const currentMs = new Date(currentStudy.updatedAt).getTime();
    if (Number.isFinite(snapshotMs) && currentMs > snapshotMs) {
    logServerWarn(
      "study_update",
      "concurrency warning; applying accepted patch",
      {
            studyId: payload.studyId,
            snapshotAt: payload.snapshotAt,
            currentUpdatedAt: currentStudy.updatedAt.toISOString(),
      },
    );
    }

  await updateStudyTrusted(
    ctx.db,
    ctx.projectId,
    ctx.workspaceId,
    payload.studyId,
    {
        ...(payload.patch.top ?? {}),
      ...(payload.patch.details
        ? { details: payload.patch.details as Partial<StudyDetails> }
        : {}),
    },
  );
}

async function applyDraftDiff(
  ctx: ArtifactExecutionContext,
  payload: DraftDiffPayload,
  artifactId: string,
  conversationId: string | null,
) {
    const tipTapContent = textToTipTapDoc(payload.content);
    const currentDraft = await getDraftTrusted(ctx.db, ctx.projectId);
    const sectionKey = resolveDraftDiffSectionKey(payload);
  const currentSectionContent =
    currentDraft?.contentBySection?.[sectionKey] ?? null;
  const baseSectionContent = Object.prototype.hasOwnProperty.call(
    payload,
    "baseSectionContent",
  )
    ? (payload.baseSectionContent ?? null)
        : currentSectionContent;

  if (
    serializeDraftSectionContent(currentSectionContent) !==
    serializeDraftSectionContent(baseSectionContent)
  ) {
    logServerWarn(
      "draft_diff",
      "rejected stale draft proposal apply because the target section changed",
      {
            artifactId,
            projectId: ctx.projectId,
            section: payload.section,
            sectionKey,
      },
    );
        throw new ArtifactError(
            "ARTIFACT_APPLY_FAILED",
            `Draft section "${payload.section}" changed after this proposal was created. Re-run the draft proposal from the latest text.`,
        );
    }

    await createDraftVersionTrusted(ctx.db, {
        projectId: ctx.projectId,
        section: payload.section,
        content: tipTapContent as object,
        wordCount: payload.wordCount,
        artifactId,
        conversationId: conversationId ?? undefined,
    });

    const { createDefaultDraftState } = await import("@/lib/draft-storage");
    const draftState = currentDraft ?? createDefaultDraftState();
  draftState.contentBySection[sectionKey] =
    tipTapContent as (typeof draftState.contentBySection)[string];

    await saveDraftTrusted(ctx.db, ctx.projectId, draftState);
  await createDraftApplyCheckpoint(
    ctx,
    artifactId,
    conversationId,
    payload.section,
    draftState,
  );
}

async function applyEvidenceTable(
  ctx: ArtifactExecutionContext,
  payload: EvidenceTablePayload,
  conversationId: string | null,
) {
    const content = textToTipTapDoc(buildEvidenceTableMarkdown(payload));
    const existing = await listNotesTrusted(ctx.db, ctx.projectId);
  const evidenceNote = existing.find(
    (note) =>
      note.title?.toLowerCase() === "evidence table" ||
      note.linkedSection?.toLowerCase() === "evidence table" ||
      note.tags?.some((tag) => tag.toLowerCase() === "evidence-table"),
    );

    if (evidenceNote) {
        await updateNoteTrusted(ctx.db, evidenceNote.id, {
            title: "Evidence Table",
            linkedSection: "Evidence Table",
            content,
      tags: Array.from(
        new Set([...(evidenceNote.tags ?? []), "evidence-table"]),
      ),
        });
        return;
    }

    await createNoteTrusted(ctx.db, {
        projectId: ctx.projectId,
        title: "Evidence Table",
        linkedSection: "Evidence Table",
        content,
        source: "conversation",
        sourceConversationId: conversationId ?? undefined,
        tags: ["evidence-table"],
    });
}

async function applyScreeningBatch(
  ctx: ArtifactExecutionContext,
  payload: ScreeningBatchPayload,
) {
    for (const study of payload.studies) {
        let existing: { id: string; details: unknown } | null = null;

        if (study.studyId) {
            existing = await ctx.db.study.findFirst({
                where: { id: study.studyId, projectId: ctx.projectId, deletedAt: null },
                select: { id: true, details: true },
            });
            if (!existing) {
        logServerWarn(
          "screening_batch",
          "skipping study update because study was not found",
          {
                    studyId: study.studyId,
                    projectId: ctx.projectId,
          },
        );
                continue;
            }
        } else {
            existing = await ctx.db.study.findFirst({
        where: {
          projectId: ctx.projectId,
          title: study.title,
          deletedAt: null,
        },
                select: { id: true, details: true },
            });
        }

        if (!existing) continue;

        const screenedAtIso = new Date().toISOString();
        const details = (existing.details as Record<string, unknown>) ?? {};
        await ctx.db.study.update({
            where: { id: existing.id },
            data: {
        status:
          study.recommendation === "exclude"
                    ? "excluded"
                    : study.recommendation === "keep"
                        ? "active"
                        : "pending",
                details: {
                    ...details,
                    triageDecision: study.recommendation,
                    matchRationale: study.matchRationale,
                    screenedAt: screenedAtIso,
                    screeningMeta: {
                        tier: study.screeningTier ?? "ai",
                        modelConfidence: study.confidence,
                        reasons: study.matchRationale ? [study.matchRationale] : [],
                        screenedAt: screenedAtIso,
                        modelUsed: study.modelUsed,
                    },
                },
            },
        });
    }
}

export function registerArtifactHandlers({
    applyFunctions,
    snapshotReaders,
    appliedStateReaders,
    restoreFunctions,
}: ArtifactHandlerMaps) {
    applyFunctions.set("criteria_card", async (ctx, artifact) => {
    return applyCriteriaCard(
      ctx,
      artifact.payload as unknown as CriteriaCardPayload,
    );
    });

    applyFunctions.set("protocol_suggestion", async (ctx, artifact) => {
    return applyProtocolSuggestion(
      ctx,
      artifact.payload as unknown as ProtocolSuggestionPayload,
    );
    });

    applyFunctions.set("memory_proposal", async (ctx, artifact) => {
    await applyMemoryProposal(
      ctx,
      artifact.payload as unknown as MemoryProposalPayload,
      artifact.conversationId,
    );
    });

    applyFunctions.set("memory_forget_proposal", async (ctx, artifact) => {
    await applyMemoryForgetProposal(
      ctx,
      artifact.payload as unknown as MemoryForgetProposalPayload,
    );
    });

    applyFunctions.set("study_proposal", async (ctx, artifact) => {
    const study = await applyStudyProposal(
      ctx,
      artifact.payload as unknown as StudyProposalPayload,
    );
    return { undoStateHint: { studyId: study.id } };
    });

    applyFunctions.set("study_update", async (ctx, artifact) => {
    await applyStudyUpdate(
      ctx,
      artifact.id,
      artifact.payload as unknown as StudyUpdatePayload,
    );
  });

  applyFunctions.set("study_deletion", async (ctx, artifact) => {
    await applyStudyDeletion(
      ctx,
      artifact.payload as unknown as StudyDeletionPayload,
    );
    });

    applyFunctions.set("draft_diff", async (ctx, artifact) => {
    await applyDraftDiff(
      ctx,
      artifact.payload as unknown as DraftDiffPayload,
      artifact.id,
      artifact.conversationId,
    );
    });

    applyFunctions.set("evidence_table", async (ctx, artifact) => {
    await applyEvidenceTable(
      ctx,
      artifact.payload as unknown as EvidenceTablePayload,
      artifact.conversationId,
    );
    });

    applyFunctions.set("screening_batch", async (ctx, artifact) => {
    await applyScreeningBatch(
      ctx,
      artifact.payload as unknown as ScreeningBatchPayload,
    );
    });

    snapshotReaders.set("study_update", async (ctx, artifact) => {
        const payload = artifact.payload as unknown as StudyUpdatePayload;
        const row = await ctx.db.study.findFirst({
            where: { id: payload.studyId, projectId: ctx.projectId, deletedAt: null },
            select: {
                id: true,
                title: true,
                authors: true,
                year: true,
                status: true,
                quality: true,
                details: true,
                updatedAt: true,
            },
        });
        return row ? captureStudyUpdateState(row, payload) : null;
    });

    appliedStateReaders.set("study_update", async (ctx, artifact) => {
        const payload = artifact.payload as unknown as StudyUpdatePayload;
        const row = await ctx.db.study.findFirst({
            where: { id: payload.studyId, projectId: ctx.projectId, deletedAt: null },
            select: {
                id: true,
                title: true,
                authors: true,
                year: true,
                status: true,
                quality: true,
                details: true,
                updatedAt: true,
            },
        });
        return row ? captureStudyUpdateState(row, payload) : null;
    });

    snapshotReaders.set("study_deletion", async (ctx, artifact) => {
        const payload = artifact.payload as unknown as StudyDeletionPayload;
        const row = await ctx.db.study.findFirst({
            where: { id: payload.studyId, projectId: ctx.projectId, deletedAt: null },
            select: { id: true, deletedAt: true, updatedAt: true },
        });
        return row ? {
            id: row.id,
            version: snapshotVersion(row.updatedAt),
            deletedAt: snapshotVersion(row.deletedAt),
        } satisfies StudyDeletionUndoState : null;
    });

    appliedStateReaders.set("study_deletion", async (ctx, artifact) => {
        const payload = artifact.payload as unknown as StudyDeletionPayload;
        const row = await ctx.db.study.findFirst({
            where: { id: payload.studyId, projectId: ctx.projectId },
            select: { id: true, deletedAt: true, updatedAt: true },
        });
        return row ? {
            id: row.id,
            version: snapshotVersion(row.updatedAt),
            deletedAt: snapshotVersion(row.deletedAt),
        } satisfies StudyDeletionUndoState : null;
    });

    snapshotReaders.set("study_proposal", async (ctx, artifact) => {
        const payload = artifact.payload as unknown as StudyProposalPayload;
        // Proposals without an explicit study id always create a new row. A
        // title lookup is ambiguous and could snapshot an unrelated duplicate.
        if (!payload.studyId) return null;
        const row = await ctx.db.study.findFirst({
            where: { id: payload.studyId, projectId: ctx.projectId, deletedAt: null },
            select: {
                id: true,
                title: true,
                authors: true,
                year: true,
                status: true,
                quality: true,
                details: true,
                deletedAt: true,
                updatedAt: true,
            },
        });
        return row ? captureStudyProposalState(row) : null;
    });

    appliedStateReaders.set("study_proposal", async (ctx, artifact, applyResult) => {
        const payload = artifact.payload as unknown as StudyProposalPayload;
        const hintedStudyId = applyResult?.undoStateHint
            && typeof applyResult.undoStateHint === "object"
            && !Array.isArray(applyResult.undoStateHint)
            && typeof (applyResult.undoStateHint as { studyId?: unknown }).studyId === "string"
            ? (applyResult.undoStateHint as { studyId: string }).studyId
            : null;
        const targetStudyId = hintedStudyId ?? payload.studyId;
        if (!targetStudyId) return null;
        const row = await ctx.db.study.findFirst({
            where: { id: targetStudyId, projectId: ctx.projectId },
            select: {
                id: true,
                title: true,
                authors: true,
                year: true,
                status: true,
                quality: true,
                details: true,
                deletedAt: true,
                updatedAt: true,
            },
        });
        return row ? captureStudyProposalState(row) : null;
    });

    snapshotReaders.set("protocol_suggestion", async (ctx, artifact) => {
        const payload = artifact.payload as unknown as ProtocolSuggestionPayload;
        const protocol = await ctx.db.protocol.findUnique({
            where: { projectId: ctx.projectId },
            select: { data: true, updatedAt: true },
        });
        if (!protocol) return null;
        return {
            version: snapshotVersion(protocol.updatedAt),
            field: payload.field,
            value: nestedSnapshotValue(protocol.data as Record<string, unknown>, payload.field),
        } satisfies ProtocolFieldUndoState;
    });

    appliedStateReaders.set("protocol_suggestion", async (ctx, artifact) => {
        const payload = artifact.payload as unknown as ProtocolSuggestionPayload;
        const protocol = await ctx.db.protocol.findUnique({
            where: { projectId: ctx.projectId },
            select: { data: true, updatedAt: true },
        });
        if (!protocol) return null;
        return {
            version: snapshotVersion(protocol.updatedAt),
            field: payload.field,
            value: nestedSnapshotValue(protocol.data as Record<string, unknown>, payload.field),
        } satisfies ProtocolFieldUndoState;
    });

    const readCriteriaState: SnapshotReader = async (ctx) => {
        const protocol = await ctx.db.protocol.findUnique({
            where: { projectId: ctx.projectId },
            select: { data: true, updatedAt: true },
        });
        if (!protocol) return null;
        const eligibility = (protocol.data as { eligibility?: CriteriaUndoState["eligibility"] }).eligibility;
        if (!eligibility) return null;
        return {
            version: snapshotVersion(protocol.updatedAt),
            eligibility: {
                inclusion: [...eligibility.inclusion],
                exclusion: [...eligibility.exclusion],
            },
        } satisfies CriteriaUndoState;
    };
    snapshotReaders.set("criteria_card", readCriteriaState);
    appliedStateReaders.set("criteria_card", readCriteriaState);

    const readDraftSectionState: SnapshotReader = async (ctx, artifact) => {
        const payload = artifact.payload as unknown as DraftDiffPayload;
        const row = await ctx.db.draft.findUnique({
            where: { projectId: ctx.projectId },
            select: { state: true, updatedAt: true },
        });
        const sectionKey = resolveDraftDiffSectionKey(payload);
        const contentBySection = row?.state && typeof row.state === "object" && !Array.isArray(row.state)
            ? ((row.state as { contentBySection?: Record<string, unknown> }).contentBySection ?? {})
            : {};
        return {
            version: snapshotVersion(row?.updatedAt),
            sectionKey,
            content: snapshotValue(contentBySection, sectionKey),
        } satisfies DraftSectionUndoState;
    };
    snapshotReaders.set("draft_diff", readDraftSectionState);
    appliedStateReaders.set("draft_diff", readDraftSectionState);

    restoreFunctions.set("study_update", async (ctx, artifact) => {
        const payload = artifact.payload as unknown as StudyUpdatePayload;
        const envelope = requireUndoEnvelope(artifact);
        const before = envelope.before as StudyUpdateUndoState | null;
        const applied = envelope.applied as StudyUpdateUndoState | null;
        if (!before || !applied) {
            throwUndoConflict("Undo cannot verify the study update's applied state.");
        }

        await lockStudyForUndo(ctx, payload.studyId);
        const row = await ctx.db.study.findFirst({
            where: { id: payload.studyId, projectId: ctx.projectId, deletedAt: null },
            select: {
                id: true,
                title: true,
                authors: true,
                year: true,
                status: true,
                quality: true,
                details: true,
                updatedAt: true,
            },
        });
        if (!row) throwUndoConflict("The study changed or was deleted after this update was applied.");
        const current = captureStudyUpdateState(row, payload);
        if (!studyUpdateTargetMatches(current, applied)) {
            throwUndoConflict("The study fields changed after this update was applied.");
        }

        const data: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(before.top)) {
            if (!value.exists) {
                throwUndoConflict(`The original study field "${key}" cannot be restored safely.`);
            }
            data[key] = value.value;
        }
        if (Object.keys(before.details).length > 0) {
            const details = row.details && typeof row.details === "object" && !Array.isArray(row.details)
                ? { ...(row.details as Record<string, unknown>) }
                : {};
            for (const [key, value] of Object.entries(before.details)) {
                if (value.exists) details[key] = value.value;
                else delete details[key];
            }
            data.details = before.detailsContainerWasNull && Object.keys(details).length === 0
                ? Prisma.DbNull
                : details;
        }
        await ctx.db.study.update({ where: { id: before.id }, data: data as never });
    });

  restoreFunctions.set("study_deletion", async (ctx, artifact) => {
    const envelope = requireUndoEnvelope(artifact);
    const before = envelope.before as StudyDeletionUndoState | null;
    const applied = envelope.applied as StudyDeletionUndoState | null;
    if (!before || !applied) {
      throwUndoConflict("Undo cannot verify the study deletion's applied state.");
    }
    await lockStudyForUndo(ctx, before.id);
    const currentRow = await ctx.db.study.findFirst({
      where: { id: before.id, projectId: ctx.projectId },
      select: { id: true, deletedAt: true, updatedAt: true },
    });
    const current = currentRow ? {
      id: currentRow.id,
      version: snapshotVersion(currentRow.updatedAt),
      deletedAt: snapshotVersion(currentRow.deletedAt),
    } satisfies StudyDeletionUndoState : null;
    if (!current || current.deletedAt !== applied.deletedAt) {
      throwUndoConflict("The study deletion state changed after this artifact was applied.");
    }
    const restored = await ctx.db.study.updateMany({
      where: { id: before.id, projectId: ctx.projectId },
      data: {
        deletedAt: before.deletedAt ? new Date(before.deletedAt) : null,
      },
    });
    if (restored.count !== 1) {
      throwUndoConflict(`Study changed during undo: ${before.id}`);
    }
  });

    restoreFunctions.set("study_proposal", async (ctx, artifact) => {
        const envelope = requireUndoEnvelope(artifact);
        const before = envelope.before as StudyProposalUndoState | null;
        const applied = envelope.applied as StudyProposalUndoState | null;
        if (!applied) throwUndoConflict("Undo cannot identify the applied study proposal.");

        await lockStudyForUndo(ctx, applied.id);
        const row = await ctx.db.study.findFirst({
            where: { id: applied.id, projectId: ctx.projectId },
            select: {
                id: true,
                title: true,
                authors: true,
                year: true,
                status: true,
                quality: true,
                details: true,
                deletedAt: true,
                updatedAt: true,
            },
        });
        const current = row ? captureStudyProposalState(row) : null;
        if (!current || !studyProposalTargetMatches(current, applied)) {
            throwUndoConflict("The study changed after this proposal was applied.");
        }

        if (!before) {
            await ctx.db.study.update({
                where: { id: applied.id },
                data: { deletedAt: new Date() },
            });
            return;
        }
        await ctx.db.study.update({
            where: { id: applied.id },
            data: {
                title: before.title,
                authors: before.authors,
                year: before.year,
                status: before.status,
                quality: before.quality,
                details: (before.details as object) ?? Prisma.DbNull,
                deletedAt: before.deletedAt ? new Date(before.deletedAt) : null,
            },
        });
    });

    restoreFunctions.set("protocol_suggestion", async (ctx, artifact) => {
    const envelope = requireUndoEnvelope(artifact);
    const before = envelope.before as ProtocolFieldUndoState | null;
    const applied = envelope.applied as ProtocolFieldUndoState | null;
    if (!before || !applied || before.field !== applied.field) {
      throwUndoConflict("Undo cannot verify the protocol field's applied state.");
    }
        await lockProtocolForUndo(ctx);
        const data = await ensureProtocolWithDb(ctx.db, ctx.projectId);
    const currentValue = nestedSnapshotValue(
      data as unknown as Record<string, unknown>,
      applied.field,
    );
    if (!isDeepStrictEqual(currentValue, applied.value)) {
      throwUndoConflict(`Protocol field "${applied.field}" changed after this artifact was applied.`);
    }
    applyNestedSnapshot(data as unknown as Record<string, unknown>, before.field, before.value);
        await saveProtocolTrusted(ctx.db, ctx.projectId, data);
    return {
      postCommitTasks: [
        {
          kind: "sync_protocol_to_memory" as const,
          projectId: ctx.projectId,
          protocolData: data,
        },
      ],
    };
    });

    restoreFunctions.set("criteria_card", async (ctx, artifact) => {
    const envelope = requireUndoEnvelope(artifact);
    const before = envelope.before as CriteriaUndoState | null;
    const applied = envelope.applied as CriteriaUndoState | null;
    if (!before || !applied) {
      throwUndoConflict("Undo cannot verify the criteria artifact's applied state.");
    }
        await lockProtocolForUndo(ctx);
        const data = await ensureProtocolWithDb(ctx.db, ctx.projectId);
        const payload = artifact.payload as unknown as CriteriaCardPayload;
        if (payload.mutation) {
          const { action, type, criterion } = payload.mutation;
          const currentList = data.eligibility[type];
          const beforeList = before.eligibility[type];
          const appliedList = applied.eligibility[type];
          const beforeIndex = findCriterionIndex(beforeList, criterion);
          const appliedIndex = findCriterionIndex(appliedList, criterion);
          const currentIndex = findCriterionIndex(currentList, criterion);

          if (action === "add") {
            const artifactAddedCriterion = beforeIndex < 0 && appliedIndex >= 0;
            if (artifactAddedCriterion) {
              if (
                currentIndex < 0
                || currentList[currentIndex] !== appliedList[appliedIndex]
              ) {
                throwUndoConflict(`Criterion "${criterion}" changed after this artifact was applied.`);
              }
              currentList.splice(currentIndex, 1);
            }
          } else {
            const artifactRemovedCriterion = beforeIndex >= 0 && appliedIndex < 0;
            if (artifactRemovedCriterion) {
              if (currentIndex >= 0) {
                throwUndoConflict(`Criterion "${criterion}" changed after this artifact was applied.`);
              }
              currentList.splice(Math.min(beforeIndex, currentList.length), 0, beforeList[beforeIndex]!);
            }
          }
        } else {
          if (!isDeepStrictEqual(data.eligibility, applied.eligibility)) {
            throwUndoConflict("Eligibility criteria changed after this legacy artifact was applied.");
          }
          data.eligibility.inclusion = [...before.eligibility.inclusion];
          data.eligibility.exclusion = [...before.eligibility.exclusion];
        }
        await saveProtocolTrusted(ctx.db, ctx.projectId, data);
    return {
      postCommitTasks: [
        {
          kind: "sync_protocol_to_memory" as const,
          projectId: ctx.projectId,
          protocolData: data,
        },
      ],
    };
    });

    restoreFunctions.set("draft_diff", async (ctx, artifact) => {
        const payload = artifact.payload as unknown as DraftDiffPayload;
        const { createDefaultDraftState } = await import("@/lib/draft-storage");
        const sectionKey = resolveDraftDiffSectionKey(payload);

        const envelope = requireUndoEnvelope(artifact);
        const before = envelope.before as DraftSectionUndoState | null;
        const applied = envelope.applied as DraftSectionUndoState | null;
        if (!before || !applied || before.sectionKey !== sectionKey || applied.sectionKey !== sectionKey) {
            throwUndoConflict("Undo cannot verify the draft section's applied state.");
        }

        await lockDraftForUndo(ctx);
        const currentDraft = await getDraftTrusted(ctx.db, ctx.projectId);
        const draftState = currentDraft ?? createDefaultDraftState();
        const currentContent = snapshotValue(
            draftState.contentBySection as Record<string, unknown>,
            sectionKey,
        );
        if (!isDeepStrictEqual(currentContent, applied.content)) {
            throwUndoConflict(`Draft section "${payload.section}" changed after this artifact was applied.`);
        }
        if (before.content.exists) {
            draftState.contentBySection[sectionKey] =
                before.content.value as (typeof draftState.contentBySection)[string];
        } else {
            delete draftState.contentBySection[sectionKey];
        }

        await saveDraftTrusted(ctx.db, ctx.projectId, draftState);
    });
}
