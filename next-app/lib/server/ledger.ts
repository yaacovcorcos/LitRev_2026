import "server-only";

import { createHash } from "crypto";
import type { JSONContent } from "@tiptap/core";
import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import { mergeDetails } from "@/lib/utils/merge";
import { normalizeStudy, type StudyInput } from "@/lib/utils/normalize";
import { attachProcessingToStudies } from "@/lib/server/study-processing";
import {
  buildStudyDuplicateClusters,
  type StudyDuplicateCluster,
  type StudyDuplicatePairConfidence,
} from "@/lib/server/search/dedup";
import { rewriteCitationStudyIdsInContentBySection } from "@/lib/citation-compiler";
import { normalizeDraftState } from "@/lib/draft-storage";
import type { ScopeInput } from "@/lib/server/scope";
import type { DraftSectionId } from "@/types/draft";
import type { Study, StudyDetails } from "@/types/ledger";
import type { Prisma } from "@prisma/client";

export type { StudyInput };

export type ReplaceStudiesOptions = {
  emptyBehavior?: "reject" | "clear_all";
};

export type MentionedStudyInput = {
  title?: string;
  authors?: string;
  year?: number;
  doi?: string;
  pmid?: string;
  s2PaperId?: string;
  sourceUrl?: string;
};

export type MentionedStudyUpsertResult = {
  study: Study;
  created: boolean;
  matchedBy?: "doi" | "pmid" | "s2PaperId" | "titleYear";
};

export type DedupeMergeClusterResult = {
  cluster: StudyDuplicateCluster;
  merged: boolean;
  canonicalStudyId?: string;
  mergedStudyIds: string[];
  skippedReason?: "cluster_not_found" | "insufficient_active_studies" | "single_active_study";
};

export type DedupeMergeRunResult = {
  scannedClusters: number;
  mergedClusters: number;
  mergedStudies: number;
  results: DedupeMergeClusterResult[];
};

export type { PaginationOptions, PaginatedResult } from "@/lib/server/pagination";
import { sanitizePaginationLimit } from "@/lib/server/pagination";
import type { PaginationOptions, PaginatedResult } from "@/lib/server/pagination";

type LedgerDbClient = typeof prisma | Prisma.TransactionClient;

function toStudy(record: {
  id: string;
  title: string;
  authors: string;
  year: number;
  status: string;
  quality: string;
  details: unknown | null;
}): Study {
  return {
    id: record.id,
    title: record.title,
    authors: record.authors,
    year: record.year,
    status: record.status as Study["status"],
    quality: record.quality as Study["quality"],
    details: (record.details as Study["details"]) ?? undefined,
  };
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function normalizeDoi(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi\s*:\s*/i, "")
    .replace(/[),.;:\]]+$/g, "")
    .trim()
    .toLowerCase();

  if (!/^10\.\d{4,9}\/.+/.test(normalized)) return undefined;
  return normalized;
}

function normalizePmid(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 9) return undefined;
  return digits;
}

function normalizeTitle(value: string | undefined): string {
  return (value ?? "").trim();
}

function stableMentionStudyId(projectId: string, input: {
  doi?: string;
  pmid?: string;
  s2PaperId?: string;
  title: string;
  year: number;
}): string {
  const key = input.doi
    ? `doi:${input.doi}`
    : input.pmid
      ? `pmid:${input.pmid}`
      : input.s2PaperId
        ? `s2:${input.s2PaperId}`
        : `title-year:${input.title.toLowerCase()}|${input.year}`;

  const digest = createHash("sha1").update(`${projectId}|${key}`).digest("hex");
  return `study_${digest.slice(0, 16)}`;
}

function asDetailsObject(details: unknown): Record<string, unknown> {
  return (details as Record<string, unknown> | null) ?? {};
}

function getMergedIntoStudyId(details: unknown): string | undefined {
  const value = asDetailsObject(details).mergedIntoStudyId;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function hasManualReviewSignal(study: {
  status: string;
  quality: string;
  details: unknown;
}): boolean {
  const details = asDetailsObject(study.details);
  return (
    study.status === "active" ||
    study.status === "excluded" ||
    study.quality !== "-" ||
    typeof details.triageDecision === "string" ||
    typeof details.screeningMeta === "object"
  );
}

function metadataRichness(study: {
  title: string;
  authors: string;
  details: unknown;
}): number {
  const details = asDetailsObject(study.details);
  let score = 0;
  if (study.title.trim().length > 0 && study.title !== "Untitled Study") score += 1;
  if (study.authors.trim().length > 0 && study.authors !== "Unknown") score += 1;
  if (typeof details.doi === "string" && details.doi.trim().length > 0) score += 2;
  if (typeof details.pmid === "string" && details.pmid.trim().length > 0) score += 2;
  if (typeof details.s2PaperId === "string" && details.s2PaperId.trim().length > 0) score += 2;
  if (typeof details.abstract === "string" && details.abstract.trim().length > 0) score += 1;
  if (Array.isArray(details.keywords) && details.keywords.length > 0) score += 1;
  if (typeof details.studyType === "string" && details.studyType.trim().length > 0) score += 1;
  if (typeof details.sourceUrl === "string" && details.sourceUrl.trim().length > 0) score += 1;
  return score;
}

function pickCanonicalStudyId(
  studies: Array<{
    id: string;
    title: string;
    authors: string;
    status: string;
    quality: string;
    details: unknown;
    updatedAt: Date;
  }>,
  fileCountByStudyId: Map<string, number>,
): string {
  const sorted = [...studies].sort((left, right) => {
    const leftReviewed = hasManualReviewSignal(left) ? 1 : 0;
    const rightReviewed = hasManualReviewSignal(right) ? 1 : 0;
    if (leftReviewed !== rightReviewed) return rightReviewed - leftReviewed;

    const leftMeta = metadataRichness(left);
    const rightMeta = metadataRichness(right);
    if (leftMeta !== rightMeta) return rightMeta - leftMeta;

    const leftFiles = fileCountByStudyId.get(left.id) ?? 0;
    const rightFiles = fileCountByStudyId.get(right.id) ?? 0;
    if (leftFiles !== rightFiles) return rightFiles - leftFiles;

    if (left.updatedAt.getTime() !== right.updatedAt.getTime()) {
      return right.updatedAt.getTime() - left.updatedAt.getTime();
    }

    return left.id.localeCompare(right.id);
  });

  return sorted[0]?.id ?? studies[0].id;
}

function mergeStudyDetailsForCanonical(
  canonicalDetails: unknown,
  duplicateRows: Array<{ id: string; details: unknown }>,
  confidence: StudyDuplicatePairConfidence,
): Record<string, unknown> {
  const now = new Date().toISOString();
  const merged = { ...asDetailsObject(canonicalDetails) };
  const mergedFrom = new Set<string>(
    Array.isArray(merged.mergedFromStudyIds)
      ? (merged.mergedFromStudyIds as unknown[]).filter((id): id is string => typeof id === "string")
      : [],
  );

  for (const row of duplicateRows) {
    mergedFrom.add(row.id);
    const details = asDetailsObject(row.details);

    if (!merged.doi && typeof details.doi === "string" && details.doi.trim().length > 0) {
      merged.doi = details.doi;
    }
    if (!merged.pmid && typeof details.pmid === "string" && details.pmid.trim().length > 0) {
      merged.pmid = details.pmid;
    }
    if (!merged.s2PaperId && typeof details.s2PaperId === "string" && details.s2PaperId.trim().length > 0) {
      merged.s2PaperId = details.s2PaperId;
    }
    if (!merged.abstract && typeof details.abstract === "string" && details.abstract.trim().length > 0) {
      merged.abstract = details.abstract;
    } else if (typeof merged.abstract === "string" && typeof details.abstract === "string") {
      if (details.abstract.trim().length > merged.abstract.trim().length) {
        merged.abstract = details.abstract;
      }
    }

    if (!merged.triageDecision && typeof details.triageDecision === "string") {
      merged.triageDecision = details.triageDecision;
    }
    if (!merged.screeningMeta && typeof details.screeningMeta === "object" && details.screeningMeta !== null) {
      merged.screeningMeta = details.screeningMeta;
    }

    const mergedKeywords = Array.isArray(merged.keywords) ? merged.keywords : [];
    const incomingKeywords = Array.isArray(details.keywords) ? details.keywords : [];
    if (incomingKeywords.length > 0) {
      merged.keywords = Array.from(
        new Set(
          [...mergedKeywords, ...incomingKeywords].filter(
            (value): value is string => typeof value === "string" && value.trim().length > 0
          ),
        ),
      );
    }
  }

  merged.mergedFromStudyIds = Array.from(mergedFrom);
  merged.mergeReason = "dedupe_v2_cluster";
  merged.mergeConfidence = confidence;
  merged.mergedAt = now;
  return merged;
}

async function rewriteDraftCitationsForMergedStudies(
  tx: {
    draft: {
      findUnique: typeof prisma.draft.findUnique;
      update: typeof prisma.draft.update;
    };
  },
  projectId: string,
  replacements: Record<string, string>,
): Promise<void> {
  const draft = await tx.draft.findUnique({
    where: { projectId },
    select: { projectId: true, state: true },
  });
  if (!draft || typeof draft.state !== "object" || draft.state === null) return;

  const normalizedState = normalizeDraftState(draft.state);
  const contentBySection = normalizedState.contentBySection as Record<string, unknown> | undefined;
  if (!contentBySection || typeof contentBySection !== "object") return;

  const rewritten = rewriteCitationStudyIdsInContentBySection(
    contentBySection as Record<DraftSectionId, JSONContent>,
    replacements,
  );
  if (rewritten.changedCount === 0) return;

  await tx.draft.update({
    where: { projectId },
    data: {
      state: normalizeDraftState({
        ...normalizedState,
        contentBySection: rewritten.contentBySection,
      }) as Prisma.InputJsonValue,
    },
  });
}

export async function listStudies(
  scopeInput: ScopeInput,
  projectId: string
): Promise<Study[]> {
  await assertProjectAccess(scopeInput, projectId);
  const studies = await prisma.study.findMany({
    where: { projectId, deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  return attachProcessingToStudies(studies.map(toStudy));
}

export async function listStudiesPaginated(
  scopeInput: ScopeInput,
  projectId: string,
  options?: PaginationOptions,
): Promise<PaginatedResult<Study>> {
  await assertProjectAccess(scopeInput, projectId);

  const limit = sanitizePaginationLimit(options?.limit);
  let where: Record<string, unknown> = { projectId, deletedAt: null };

  if (options?.cursor) {
    const cursorStudy = await prisma.study.findFirst({
      where: { id: options.cursor, projectId, deletedAt: null },
      select: { id: true, createdAt: true },
    });
    if (cursorStudy) {
      where = {
        projectId,
        deletedAt: null,
        OR: [
          { createdAt: { gt: cursorStudy.createdAt } },
          { createdAt: { equals: cursorStudy.createdAt }, id: { gt: cursorStudy.id } },
        ],
      };
    }
  }

  const rows = await prisma.study.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: await attachProcessingToStudies(page.map(toStudy)),
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}

export async function upsertStudy(
  scopeInput: ScopeInput,
  projectId: string,
  study: StudyInput
): Promise<Study> {
  const scope = await assertProjectAccess(scopeInput, projectId);
  return upsertStudyTrusted(prisma, projectId, scope.workspaceId, study);
}

export async function upsertStudyTrusted(
  db: LedgerDbClient,
  projectId: string,
  workspaceId: string,
  study: StudyInput,
): Promise<Study> {
  const normalized = normalizeStudy(study);
  if (normalized.id) {
    const existing = await db.study.findFirst({ where: { id: normalized.id, projectId } });
    if (existing) {
      const updated = await db.study.update({
        where: { id: normalized.id },
        data: {
          workspaceId,
          title: normalized.title,
          authors: normalized.authors,
          year: normalized.year,
          status: normalized.status,
          quality: normalized.quality,
          details: toInputJsonValue(normalized.details),
          deletedAt: null,
        },
      });
      return (await attachProcessingToStudies([toStudy(updated)]))[0];
    }
  }
  const created = await db.study.create({
    data: {
      id: normalized.id ?? undefined,
      projectId,
      workspaceId,
      title: normalized.title,
      authors: normalized.authors,
      year: normalized.year,
      status: normalized.status,
      quality: normalized.quality,
      details: toInputJsonValue(normalized.details),
    },
  });
  return (await attachProcessingToStudies([toStudy(created)]))[0];
}

export async function replaceStudies(
  scopeInput: ScopeInput,
  projectId: string,
  studies: StudyInput[],
  options: ReplaceStudiesOptions = {},
): Promise<Study[]> {
  const scope = await assertProjectAccess(scopeInput, projectId);
  const normalized = studies.map(normalizeStudy);
  const emptyBehavior = options.emptyBehavior ?? "reject";
  const incomingIds = normalized
    .map((s) => s.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  if (normalized.length === 0 && emptyBehavior !== "clear_all") {
    throw new Error('replaceStudies rejected empty payload; pass emptyBehavior="clear_all" to clear all studies.');
  }

  if (normalized.length > 0 && incomingIds.length !== normalized.length) {
    throw new Error("replaceStudies requires an id for every incoming study.");
  }

  const savedStudies = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    if (normalized.length === 0) {
      await tx.study.updateMany({
        where: { projectId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      const saved = await tx.study.findMany({
        where: { projectId, deletedAt: null },
        orderBy: { createdAt: "asc" },
      });
      return saved.map(toStudy);
    }

    // Sync semantics: soft-delete studies missing from incoming list, then upsert incoming rows.
    // This avoids destructive hard-delete behavior and preserves related records for recovery.
    await tx.study.updateMany({
      where: {
        projectId,
        deletedAt: null,
        id: { notIn: incomingIds },
      },
      data: { deletedAt: new Date() },
    });

    for (const study of normalized) {
      const studyId = study.id;
      if (!studyId) {
        throw new Error("replaceStudies requires an id for every incoming study.");
      }
      const existing = await tx.study.findFirst({
        where: { id: studyId, projectId },
        select: { id: true },
      });
      if (existing) {
        await tx.study.update({
          where: { id: studyId },
          data: {
            workspaceId: scope.workspaceId,
            title: study.title,
            authors: study.authors,
            year: study.year,
            status: study.status,
            quality: study.quality,
            details: toInputJsonValue(study.details),
            deletedAt: null,
          },
        });
        continue;
      }

      await tx.study.create({
        data: {
          id: studyId,
          projectId,
          workspaceId: scope.workspaceId,
          title: study.title,
          authors: study.authors,
          year: study.year,
          status: study.status,
          quality: study.quality,
          details: toInputJsonValue(study.details),
        },
      });
    }
    const saved = await tx.study.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    return saved.map(toStudy);
  });
  return attachProcessingToStudies(savedStudies);
}

export async function deleteStudy(
  scopeInput: ScopeInput,
  projectId: string,
  studyId: string
): Promise<void> {
  await assertProjectAccess(scopeInput, projectId);
  await prisma.study.updateMany({
    where: { id: studyId, projectId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

export async function deleteStudies(
  scopeInput: ScopeInput,
  projectId: string,
  studyIds: string[]
): Promise<void> {
  if (!studyIds.length) return;
  await assertProjectAccess(scopeInput, projectId);
  await prisma.study.updateMany({
    where: { id: { in: studyIds }, projectId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
}

/**
 * Get a single study by ID.
 */
export async function getStudy(
  scopeInput: ScopeInput,
  projectId: string,
  studyId: string
): Promise<Study | null> {
  const canonicalStudyId = await resolveCanonicalStudyId(scopeInput, projectId, studyId);
  if (!canonicalStudyId) return null;

  const study = await prisma.study.findFirst({
    where: { id: canonicalStudyId, projectId, deletedAt: null },
  });
  if (!study) return null;
  return (await attachProcessingToStudies([toStudy(study)]))[0];
}

/**
 * Partial update for a study. Preserves existing details by merging.
 */
export async function updateStudy(
  scopeInput: ScopeInput,
  projectId: string,
  studyId: string,
  updates: Partial<StudyInput>
): Promise<Study> {
  const scope = await assertProjectAccess(scopeInput, projectId);
  return updateStudyTrusted(prisma, projectId, scope.workspaceId, studyId, updates);
}

export async function resolveCanonicalStudyIdTrusted(
  db: LedgerDbClient,
  projectId: string,
  studyId: string,
): Promise<string | null> {
  let currentId = studyId;
  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const row = await db.study.findFirst({
      where: { id: currentId, projectId },
      select: { id: true, deletedAt: true, details: true },
    });
    if (!row) return null;
    if (!row.deletedAt) return row.id;
    const mergedInto = getMergedIntoStudyId(row.details);
    if (!mergedInto) return null;
    currentId = mergedInto;
  }

  return null;
}

export async function updateStudyTrusted(
  db: LedgerDbClient,
  projectId: string,
  workspaceId: string,
  studyId: string,
  updates: Partial<StudyInput>
): Promise<Study> {
  const canonicalStudyId = await resolveCanonicalStudyIdTrusted(db, projectId, studyId);
  if (!canonicalStudyId) {
    throw new Error("Study not found or access denied.");
  }

  const existing = await db.study.findFirst({
    where: { id: canonicalStudyId, projectId, deletedAt: null },
  });
  if (!existing) {
    throw new Error("Study not found or access denied.");
  }

  // Deep merge details to preserve existing nested fields
  const existingDetails = (existing.details as Record<string, unknown>) ?? {};
  const incomingDetails = (updates.details as Record<string, unknown>) ?? {};
  const mergedDetails = mergeDetails(existingDetails, incomingDetails);

  const data: Record<string, unknown> = {};
  data.workspaceId = workspaceId;
  if (typeof updates.title !== "undefined") data.title = updates.title.trim() || existing.title;
  if (typeof updates.authors !== "undefined") data.authors = updates.authors.trim() || existing.authors;
  if (typeof updates.year !== "undefined") data.year = updates.year;
  if (typeof updates.status !== "undefined") data.status = updates.status;
  if (typeof updates.quality !== "undefined") data.quality = updates.quality;
  if (typeof updates.details !== "undefined") data.details = mergedDetails;

  const updated = await db.study.update({
    where: { id: canonicalStudyId },
    data: data as Prisma.StudyUpdateInput,
  });

  return (await attachProcessingToStudies([toStudy(updated)]))[0];
}

export async function resolveCanonicalStudyId(
  scopeInput: ScopeInput,
  projectId: string,
  studyId: string,
): Promise<string | null> {
  await assertProjectAccess(scopeInput, projectId);
  return resolveCanonicalStudyIdTrusted(prisma, projectId, studyId);
}

export async function listStudyDuplicateClusters(
  scopeInput: ScopeInput,
  projectId: string,
): Promise<StudyDuplicateCluster[]> {
  await assertProjectAccess(scopeInput, projectId);
  const rows = await prisma.study.findMany({
    where: { projectId, deletedAt: null },
    select: {
      id: true,
      title: true,
      authors: true,
      year: true,
      status: true,
      quality: true,
      details: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return buildStudyDuplicateClusters(rows.map(toStudy));
}

export async function mergeStudyDuplicateCluster(
  scopeInput: ScopeInput,
  projectId: string,
  cluster: StudyDuplicateCluster,
): Promise<DedupeMergeClusterResult> {
  await assertProjectAccess(scopeInput, projectId);

  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const activeRows = await tx.study.findMany({
      where: {
        projectId,
        id: { in: cluster.studyIds },
        deletedAt: null,
      },
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

    if (activeRows.length === 0) {
      return {
        cluster,
        merged: false,
        mergedStudyIds: [],
        skippedReason: "cluster_not_found" as const,
      };
    }

    if (activeRows.length === 1) {
      return {
        cluster,
        merged: false,
        canonicalStudyId: activeRows[0].id,
        mergedStudyIds: [],
        skippedReason: "single_active_study" as const,
      };
    }

    const fileRows = await tx.fileAsset.findMany({
      where: { projectId, studyId: { in: activeRows.map((row) => row.id) } },
      select: { studyId: true },
    });
    const fileCountByStudyId = new Map<string, number>();
    for (const file of fileRows) {
      if (!file.studyId) continue;
      fileCountByStudyId.set(file.studyId, (fileCountByStudyId.get(file.studyId) ?? 0) + 1);
    }

    const canonicalStudyId = pickCanonicalStudyId(activeRows, fileCountByStudyId);
    const duplicateRows = activeRows.filter((row) => row.id !== canonicalStudyId);
    if (duplicateRows.length === 0) {
      return {
        cluster,
        merged: false,
        canonicalStudyId,
        mergedStudyIds: [],
        skippedReason: "insufficient_active_studies" as const,
      };
    }

    const duplicateStudyIds = duplicateRows.map((row) => row.id);
    const replacements = Object.fromEntries(duplicateStudyIds.map((id) => [id, canonicalStudyId]));
    const now = new Date();
    const nowIso = now.toISOString();

    await tx.fileAsset.updateMany({
      where: { projectId, studyId: { in: duplicateStudyIds } },
      data: { studyId: canonicalStudyId },
    });

    await tx.studyMemory.updateMany({
      where: { projectId, studyId: { in: duplicateStudyIds } },
      data: { studyId: canonicalStudyId },
    });

    await tx.memoryEmbedding.updateMany({
      where: { projectId, studyId: { in: duplicateStudyIds } },
      data: { studyId: canonicalStudyId },
    });

    await tx.note.updateMany({
      where: { projectId, linkedStudyId: { in: duplicateStudyIds }, deletedAt: null },
      data: { linkedStudyId: canonicalStudyId },
    });

    await tx.aIConversation.updateMany({
      where: { projectId, studyId: { in: duplicateStudyIds } },
      data: { studyId: canonicalStudyId },
    });

    await rewriteDraftCitationsForMergedStudies(tx, projectId, replacements);

    const canonicalRow = activeRows.find((row) => row.id === canonicalStudyId)!;
    const mergedCanonicalDetails = mergeStudyDetailsForCanonical(
      canonicalRow.details,
      duplicateRows.map((row) => ({ id: row.id, details: row.details })),
      cluster.confidence,
    );

    await tx.study.update({
      where: { id: canonicalStudyId },
      data: { details: toInputJsonValue(mergedCanonicalDetails) },
    });

    for (const row of duplicateRows) {
      const details = asDetailsObject(row.details);
      await tx.study.update({
        where: { id: row.id },
        data: {
          deletedAt: now,
          details: toInputJsonValue({
            ...details,
            mergedIntoStudyId: canonicalStudyId,
            mergeReason: "dedupe_v2_cluster",
            mergeConfidence: cluster.confidence,
            mergedAt: nowIso,
          }),
        },
      });
    }

    return {
      cluster,
      merged: true,
      canonicalStudyId,
      mergedStudyIds: duplicateStudyIds,
    };
  });
}

export async function autoMergeStudyDuplicates(
  scopeInput: ScopeInput,
  projectId: string,
  options?: {
    includeMediumConfidence?: boolean;
    maxClusters?: number;
  },
): Promise<DedupeMergeRunResult> {
  const clusters = await listStudyDuplicateClusters(scopeInput, projectId);
  const includeMediumConfidence = options?.includeMediumConfidence === true;
  const eligible = clusters.filter(
    (cluster) => includeMediumConfidence || cluster.confidence === "high",
  );
  const selected = typeof options?.maxClusters === "number"
    ? eligible.slice(0, Math.max(0, options.maxClusters))
    : eligible;

  const results: DedupeMergeClusterResult[] = [];
  for (const cluster of selected) {
    const result = await mergeStudyDuplicateCluster(scopeInput, projectId, cluster);
    results.push(result);
  }

  return {
    scannedClusters: clusters.length,
    mergedClusters: results.filter((result) => result.merged).length,
    mergedStudies: results.reduce((count, result) => count + result.mergedStudyIds.length, 0),
    results,
  };
}

export async function addMentionedStudy(
  scopeInput: ScopeInput,
  projectId: string,
  mention: MentionedStudyInput
): Promise<MentionedStudyUpsertResult> {
  await assertProjectAccess(scopeInput, projectId);

  const doi = normalizeDoi(mention.doi);
  const pmid = normalizePmid(mention.pmid);
  const s2PaperId = mention.s2PaperId?.trim() || undefined;
  const title = normalizeTitle(mention.title) || doi || (pmid ? `PMID ${pmid}` : undefined) || "Untitled Study";
  const authors = normalizeTitle(mention.authors) || "Unknown";
  const year = Number.isFinite(mention.year) ? Number(mention.year) : new Date().getFullYear();
  const normalizedTitleForMatch = title.toLowerCase();

  const existingStudies = await prisma.study.findMany({
    where: { projectId, deletedAt: null },
    select: {
      id: true,
      title: true,
      authors: true,
      year: true,
      status: true,
      quality: true,
      details: true,
    },
  });

  for (const row of existingStudies) {
    const details = (row.details as Record<string, unknown> | null) ?? {};
    const rowDoi = normalizeDoi(typeof details.doi === "string" ? details.doi : undefined);
    const rowPmid = normalizePmid(typeof details.pmid === "string" ? details.pmid : undefined);
    const rowS2 = typeof details.s2PaperId === "string" ? details.s2PaperId.trim() : undefined;

    if (doi && rowDoi && doi === rowDoi) {
      return { study: toStudy(row), created: false, matchedBy: "doi" };
    }
    if (pmid && rowPmid && pmid === rowPmid) {
      return { study: toStudy(row), created: false, matchedBy: "pmid" };
    }
    if (s2PaperId && rowS2 && s2PaperId === rowS2) {
      return { study: toStudy(row), created: false, matchedBy: "s2PaperId" };
    }
    if (row.title.trim().toLowerCase() === normalizedTitleForMatch && row.year === year) {
      return { study: toStudy(row), created: false, matchedBy: "titleYear" };
    }
  }

  const id = stableMentionStudyId(projectId, { doi, pmid, s2PaperId, title, year });
  const details: StudyDetails = {
    doi,
    pmid,
    s2PaperId,
    sourceUrl: mention.sourceUrl?.trim() || undefined,
    source: "copilot",
    addedVia: "chat_mention",
    addedAt: new Date().toISOString(),
  };

  try {
    const created = await upsertStudy(scopeInput, projectId, {
      id,
      title,
      authors,
      year,
      status: "pending",
      quality: "-",
      details,
    });
    return { study: created, created: true };
  } catch (error) {
    // Concurrency-safe retry path: if another request won the race on deterministic ID,
    // treat this call as idempotent and return the persisted row.
    const raced = await prisma.study.findFirst({
      where: { id, projectId, deletedAt: null },
      select: {
        id: true,
        title: true,
        authors: true,
        year: true,
        status: true,
        quality: true,
        details: true,
      },
    });
    if (raced) {
      return {
        study: toStudy(raced),
        created: false,
        matchedBy: doi ? "doi" : pmid ? "pmid" : s2PaperId ? "s2PaperId" : "titleYear",
      };
    }
    throw error;
  }
}
