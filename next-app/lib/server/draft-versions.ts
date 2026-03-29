/**
 * DraftVersion Service Layer
 * Immutable per-section version history for draft content (Phase 12)
 */

import "server-only";

import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
import type { Prisma } from "@prisma/client";
import type { ScopeInput } from "@/lib/server/scope";
import { extractTextFromContent, type NoteContent } from "@/lib/server/notes";

// ── Inputs ───────────────────────────────────────────────────────────────────

export interface CreateDraftVersionInput {
  projectId: string;
  section: string;
  content: object; // TipTap JSONContent
  wordCount?: number;
  artifactId?: string;
  conversationId?: string;
}

import { sanitizePaginationLimit } from "@/lib/server/pagination";
import type { PaginationOptions } from "@/lib/server/pagination";

const MAX_VERSION_RETRIES = 3;
type DraftVersionDbClient = typeof prisma | Prisma.TransactionClient;

function isUniqueConstraintError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeCode = (error as { code?: unknown }).code;
  return maybeCode === "P2002";
}

// ── Service functions ────────────────────────────────────────────────────────

/**
 * Create an immutable draft version for a section.
 * Auto-increments the version number for (projectId, section).
 */
export async function createDraftVersion(
  scopeInput: ScopeInput,
  input: CreateDraftVersionInput,
) {
  await assertProjectAccess(scopeInput, input.projectId);
  return createDraftVersionTrusted(prisma, input);
}

export async function createDraftVersionTrusted(
  db: DraftVersionDbClient,
  input: CreateDraftVersionInput,
) {
  const sectionLower = input.section.toLowerCase();

  // Extract plain text for searchability
  const contentText = extractTextFromContent(input.content as NoteContent) || null;
  for (let attempt = 0; attempt < MAX_VERSION_RETRIES; attempt += 1) {
    const latest = await db.draftVersion.findFirst({
      where: { projectId: input.projectId, section: sectionLower },
      orderBy: { version: "desc" },
      select: { version: true },
    });
    const nextVersion = (latest?.version ?? 0) + 1;

    try {
      return await db.draftVersion.create({
        data: {
          projectId: input.projectId,
          section: sectionLower,
          content: input.content,
          contentText,
          wordCount: input.wordCount ?? 0,
          artifactId: input.artifactId ?? null,
          conversationId: input.conversationId ?? null,
          version: nextVersion,
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error) || attempt >= MAX_VERSION_RETRIES - 1) {
        throw error;
      }
    }
  }

  throw new Error("createDraftVersion: version conflict after retries");
}

/**
 * List all versions for a given project+section, newest first.
 */
export async function listDraftVersions(
  scopeInput: ScopeInput,
  projectId: string,
  section: string,
) {
  await assertProjectAccess(scopeInput, projectId);
  return prisma.draftVersion.findMany({
    where: { projectId, section: section.toLowerCase() },
    orderBy: { version: "desc" },
  });
}

export async function listDraftVersionsPaginated(
  scopeInput: ScopeInput,
  projectId: string,
  section: string,
  options?: PaginationOptions,
) {
  await assertProjectAccess(scopeInput, projectId);

  const sectionLower = section.toLowerCase();
  const limit = sanitizePaginationLimit(options?.limit);
  let where: Record<string, unknown> = { projectId, section: sectionLower };

  if (options?.cursor) {
    const cursorRow = await prisma.draftVersion.findFirst({
      where: { id: options.cursor, projectId, section: sectionLower },
      select: { id: true, version: true },
    });
    if (cursorRow) {
      where = {
        projectId,
        section: sectionLower,
        version: { lt: cursorRow.version },
      };
    }
  }

  const rows = await prisma.draftVersion.findMany({
    where,
    orderBy: { version: "desc" },
    take: limit + 1,
  });
  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  return {
    items: page,
    nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
  };
}

/**
 * Get the latest version for a section.
 */
export async function getLatestDraftVersion(
  scopeInput: ScopeInput,
  projectId: string,
  section: string,
) {
  await assertProjectAccess(scopeInput, projectId);
  return prisma.draftVersion.findFirst({
    where: { projectId, section: section.toLowerCase() },
    orderBy: { version: "desc" },
  });
}
