/**
 * DraftVersion Service Layer
 * Immutable per-section version history for draft content (Phase 12)
 */

import "server-only";

import { prisma } from "@/lib/server/prisma";
import { assertProjectAccess } from "@/lib/server/access";
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

  const sectionLower = input.section.toLowerCase();

  // Compute next version number
  const latest = await prisma.draftVersion.findFirst({
    where: { projectId: input.projectId, section: sectionLower },
    orderBy: { version: "desc" },
    select: { version: true },
  });
  const nextVersion = (latest?.version ?? 0) + 1;

  // Extract plain text for searchability
  const contentText = extractTextFromContent(input.content as NoteContent) || null;

  return prisma.draftVersion.create({
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
