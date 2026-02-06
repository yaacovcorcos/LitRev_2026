import "server-only";

import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import { mergeDetails } from "@/lib/utils/merge";
import { normalizeStudy, type StudyInput } from "@/lib/utils/normalize";
import type { ServiceScope } from "@/lib/server/scope";
import type { Study } from "@/types/ledger";

export type { StudyInput };

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
