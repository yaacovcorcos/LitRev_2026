import "server-only";

import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import type { ServiceScope } from "@/lib/server/scope";
import type { Study } from "@/types/ledger";
import { Prisma } from "@prisma/client";

export type StudyInput = Omit<Study, "id"> & { id?: string };

type NormalizedStudy = {
  id?: string;
  title: string;
  authors: string;
  year: number;
  status: string;
  quality: string;
  details?: Record<string, unknown>;
};

function normalizeStudy(input: StudyInput): NormalizedStudy {
  const title = input.title?.trim() || "Untitled Study";
  const authors = input.authors?.trim() || "Unknown";
  const year = typeof input.year === "number" && Number.isFinite(input.year)
    ? input.year
    : new Date().getFullYear();
  const status = input.status?.toString().trim() || "pending";
  const quality = input.quality?.toString().trim() || "-";
  const details = input.details ? (input.details as Record<string, unknown>) : undefined;
  return {
    id: input.id ?? undefined,
    title,
    authors,
    year,
    status,
    quality,
    details,
  };
}

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
          details: normalized.details as Prisma.JsonObject,
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
      details: normalized.details as Prisma.JsonObject,
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
  return prisma.$transaction(async (tx) => {
    await tx.study.deleteMany({ where: { projectId } });
    await tx.study.createMany({
      data: normalized.map((study) => ({
        id: study.id ?? undefined,
        projectId,
        title: study.title,
        authors: study.authors,
        year: study.year,
        status: study.status,
        quality: study.quality,
        details: study.details ? (study.details as Prisma.JsonObject) : undefined,
      })),
    });
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
