import "server-only";

import { createHash } from "crypto";
import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import { mergeDetails } from "@/lib/utils/merge";
import { normalizeStudy, type StudyInput } from "@/lib/utils/normalize";
import type { ServiceScope } from "@/lib/server/scope";
import type { Study, StudyDetails } from "@/types/ledger";

export type { StudyInput };

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

export async function listStudies(
  scopeInput: Partial<ServiceScope> | null | undefined,
  projectId: string
): Promise<Study[]> {
  await assertProjectAccess(scopeInput, projectId);
  const studies = await prisma.study.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
  });
  return studies.map(toStudy);
}

export async function upsertStudy(
  scopeInput: Partial<ServiceScope> | null | undefined,
  projectId: string,
  study: StudyInput
): Promise<Study> {
  await assertProjectAccess(scopeInput, projectId);
  const normalized = normalizeStudy(study);
  if (normalized.id) {
    const existing = await prisma.study.findFirst({ where: { id: normalized.id, projectId } });
    if (existing) {
      const updated = await prisma.study.update({
        where: { id: normalized.id },
        data: {
          title: normalized.title,
          authors: normalized.authors,
          year: normalized.year,
          status: normalized.status,
          quality: normalized.quality,
          details: normalized.details as any,
        },
      });
      return toStudy(updated);
    }
  }
  const created = await prisma.study.create({
    data: {
      id: normalized.id ?? undefined,
      projectId,
      title: normalized.title,
      authors: normalized.authors,
      year: normalized.year,
      status: normalized.status,
      quality: normalized.quality,
      details: normalized.details as any,
    },
  });
  return toStudy(created);
}

export async function replaceStudies(
  scopeInput: Partial<ServiceScope> | null | undefined,
  projectId: string,
  studies: StudyInput[]
): Promise<Study[]> {
  await assertProjectAccess(scopeInput, projectId);
  const normalized = studies.map(normalizeStudy);
  return prisma.$transaction(async (tx: any) => {
    const incomingIds = normalized
      .map((s) => s.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0);

    // Sync semantics: delete only studies missing from the incoming list, then upsert the incoming rows.
    // This avoids destructive "delete all + recreate" behavior which can cascade-delete attached FileAssets.
    if (incomingIds.length === 0) {
      await tx.study.deleteMany({ where: { projectId } });
    } else {
      await tx.study.deleteMany({
        where: {
          projectId,
          id: { notIn: incomingIds },
        },
      });
    }

    for (const study of normalized) {
      if (study.id) {
        const existing = await tx.study.findFirst({
          where: { id: study.id, projectId },
          select: { id: true },
        });
        if (existing) {
          await tx.study.update({
            where: { id: study.id },
            data: {
              title: study.title,
              authors: study.authors,
              year: study.year,
              status: study.status,
              quality: study.quality,
              details: study.details as any,
            },
          });
          continue;
        }
      }

      await tx.study.create({
        data: {
          id: study.id ?? undefined,
          projectId,
          title: study.title,
          authors: study.authors,
          year: study.year,
          status: study.status,
          quality: study.quality,
          details: study.details as any,
        },
      });
    }
    const saved = await tx.study.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });
    return saved.map(toStudy);
  });
}

export async function deleteStudy(
  scopeInput: Partial<ServiceScope> | null | undefined,
  projectId: string,
  studyId: string
): Promise<void> {
  await assertProjectAccess(scopeInput, projectId);
  await prisma.study.deleteMany({ where: { id: studyId, projectId } });
}

export async function deleteStudies(
  scopeInput: Partial<ServiceScope> | null | undefined,
  projectId: string,
  studyIds: string[]
): Promise<void> {
  if (!studyIds.length) return;
  await assertProjectAccess(scopeInput, projectId);
  await prisma.study.deleteMany({ where: { id: { in: studyIds }, projectId } });
}

/**
 * Get a single study by ID.
 */
export async function getStudy(
  scopeInput: Partial<ServiceScope> | null | undefined,
  projectId: string,
  studyId: string
): Promise<Study | null> {
  await assertProjectAccess(scopeInput, projectId);
  const study = await prisma.study.findFirst({
    where: { id: studyId, projectId },
  });
  return study ? toStudy(study) : null;
}

/**
 * Partial update for a study. Preserves existing details by merging.
 */
export async function updateStudy(
  scopeInput: Partial<ServiceScope> | null | undefined,
  projectId: string,
  studyId: string,
  updates: Partial<StudyInput>
): Promise<Study> {
  await assertProjectAccess(scopeInput, projectId);

  const existing = await prisma.study.findFirst({
    where: { id: studyId, projectId },
  });
  if (!existing) {
    throw new Error("Study not found or access denied.");
  }

  // Deep merge details to preserve existing nested fields
  const existingDetails = (existing.details as Record<string, unknown>) ?? {};
  const incomingDetails = (updates.details as Record<string, unknown>) ?? {};
  const mergedDetails = mergeDetails(existingDetails, incomingDetails);

  const data: Record<string, unknown> = {};
  if (typeof updates.title !== "undefined") data.title = updates.title.trim() || existing.title;
  if (typeof updates.authors !== "undefined") data.authors = updates.authors.trim() || existing.authors;
  if (typeof updates.year !== "undefined") data.year = updates.year;
  if (typeof updates.status !== "undefined") data.status = updates.status;
  if (typeof updates.quality !== "undefined") data.quality = updates.quality;
  if (typeof updates.details !== "undefined") data.details = mergedDetails;

  const updated = await prisma.study.update({
    where: { id: studyId },
    data: data as any,
  });

  return toStudy(updated);
}

export async function addMentionedStudy(
  scopeInput: Partial<ServiceScope> | null | undefined,
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
    where: { projectId },
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
      where: { id, projectId },
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
