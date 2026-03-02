/**
 * Notes Service Layer
 * CRUD + search for project notes (planC Phase 6.1)
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";
import type { Note } from "@prisma/client";

// TipTap JSONContent-compatible type (avoid direct @tiptap/core dep in server code)
export interface NoteContent {
    type?: string;
    attrs?: Record<string, unknown>;
    content?: NoteContent[];
    marks?: { type: string; attrs?: Record<string, unknown> }[];
    text?: string;
}

// ── Inputs ───────────────────────────────────────────────────────────────────

export interface CreateNoteInput {
    projectId: string;
    userId?: string;
    title?: string;
    content: NoteContent;
    tags?: string[];
    linkedStudyId?: string;
    linkedSection?: string;
    source?: "manual" | "conversation";
    sourceConversationId?: string;
    sourceMessageId?: string;
}

export interface UpdateNoteInput {
    title?: string;
    content?: NoteContent;
    tags?: string[];
    linkedStudyId?: string | null;
    linkedSection?: string | null;
}

export interface ListNotesOptions {
    tags?: string[];
    source?: "manual" | "conversation";
    search?: string;
    linkedStudyId?: string;
}

export type { PaginationOptions, PaginatedResult } from "@/lib/server/pagination";
import { sanitizePaginationLimit } from "@/lib/server/pagination";
import type { PaginationOptions, PaginatedResult } from "@/lib/server/pagination";

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Recursively extract plain text from TipTap JSONContent.
 */
export function extractTextFromContent(content: NoteContent): string {
    if (content.text) return content.text;
    if (!content.content) return "";
    return content.content.map(extractTextFromContent).join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Wrap plain text into a minimal TipTap doc structure.
 */
export function textToTipTapDoc(text: string): NoteContent {
    const paragraphs = text.split(/\n\n|\n/).filter(Boolean);
    return {
        type: "doc",
        content: paragraphs.length > 0
            ? paragraphs.map((p) => ({
                type: "paragraph",
                content: [{ type: "text", text: p }],
            }))
            : [{ type: "paragraph", content: [{ type: "text", text: "" }] }],
    };
}

/**
 * Auto-generate a title from content (first ~50 chars of text).
 */
function autoTitle(content: NoteContent): string {
    const text = extractTextFromContent(content).trim();
    if (!text) return "Untitled";
    return text.length <= 50 ? text : text.slice(0, 50) + "…";
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export async function createNote(input: CreateNoteInput) {
    const title = input.title?.trim() || autoTitle(input.content);
    const contentText = extractTextFromContent(input.content) || null;

    return prisma.note.create({
        data: {
            projectId: input.projectId,
            userId: input.userId ?? null,
            title,
            content: input.content as object,
            contentText,
            tags: input.tags ?? [],
            linkedStudyId: input.linkedStudyId ?? null,
            linkedSection: input.linkedSection ?? null,
            source: input.source ?? "manual",
            sourceConversationId: input.sourceConversationId ?? null,
            sourceMessageId: input.sourceMessageId ?? null,
        },
    });
}

export async function getNote(id: string) {
    return prisma.note.findFirst({ where: { id, deletedAt: null } });
}

function buildListNotesWhere(projectId: string, options?: ListNotesOptions): Record<string, unknown> {
    const where: Record<string, unknown> = { projectId, deletedAt: null };

    if (options?.tags && options.tags.length > 0) {
        where.tags = { hasSome: options.tags };
    }
    if (options?.source) {
        where.source = options.source;
    }
    if (options?.search) {
        where.title = { contains: options.search, mode: "insensitive" };
    }
    if (options?.linkedStudyId) {
        where.linkedStudyId = options.linkedStudyId;
    }
    return where;
}

export async function listNotes(projectId: string, options?: ListNotesOptions) {
    const where = buildListNotesWhere(projectId, options);

    return prisma.note.findMany({
        where,
        orderBy: { updatedAt: "desc" },
    });
}

/** Lightweight index — metadata only, no content payload. */
export async function listNotesIndex(projectId: string) {
    return prisma.note.findMany({
        where: { projectId, deletedAt: null },
        select: { id: true, title: true, tags: true, source: true, updatedAt: true },
        orderBy: { updatedAt: "desc" },
    });
}

export type NoteIndexItem = Awaited<ReturnType<typeof listNotesIndex>>[number];

export async function listNotesPaginated(
    projectId: string,
    options?: ListNotesOptions & PaginationOptions,
): Promise<PaginatedResult<Note>> {
    const where = buildListNotesWhere(projectId, options);
    const limit = sanitizePaginationLimit(options?.limit);
    let paginatedWhere: Record<string, unknown> = where;

    if (options?.cursor) {
        const cursorNote = await prisma.note.findFirst({
            where: { id: options.cursor, projectId, deletedAt: null },
            select: { id: true, updatedAt: true },
        });
        if (cursorNote) {
            paginatedWhere = {
                ...where,
                OR: [
                    { updatedAt: { lt: cursorNote.updatedAt } },
                    { updatedAt: { equals: cursorNote.updatedAt }, id: { lt: cursorNote.id } },
                ],
            };
        }
    }

    const rows = await prisma.note.findMany({
        where: paginatedWhere,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    return {
        items: page,
        nextCursor: hasMore ? page[page.length - 1]?.id ?? null : null,
    };
}

export async function updateNote(id: string, input: UpdateNoteInput) {
    const data: Record<string, unknown> = {};

    if (input.title !== undefined) data.title = input.title;
    if (input.content !== undefined) {
        data.content = input.content as object;
        data.contentText = extractTextFromContent(input.content) || null;
    }
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.linkedStudyId !== undefined) data.linkedStudyId = input.linkedStudyId;
    if (input.linkedSection !== undefined) data.linkedSection = input.linkedSection;

    const existing = await prisma.note.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
    });
    if (!existing) {
        throw new Error("Note not found");
    }

    return prisma.note.update({ where: { id }, data });
}

export async function deleteNote(id: string) {
    const existing = await prisma.note.findFirst({
        where: { id, deletedAt: null },
        select: { id: true },
    });
    if (!existing) {
        throw new Error("Note not found");
    }
    return prisma.note.update({
        where: { id },
        data: { deletedAt: new Date() },
    });
}

/**
 * Search notes in the database by title/content text.
 * Returns matches ordered by updatedAt desc.
 */
export async function searchNotes(projectId: string, query: string) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) return listNotes(projectId);

    const titleLike = `%${trimmedQuery}%`;
    try {
        const rankedMatches = await prisma.$queryRaw<Array<{ id: string }>>`
            SELECT m.id
            FROM (
                SELECT n.id, n."updatedAt"
                FROM "Note" n
                WHERE n."projectId" = ${projectId}
                  AND n."deletedAt" IS NULL
                  AND to_tsvector('english', COALESCE(n."contentText", ''))
                      @@ websearch_to_tsquery('english', ${trimmedQuery})

                UNION

                SELECT n.id, n."updatedAt"
                FROM "Note" n
                WHERE n."projectId" = ${projectId}
                  AND n."deletedAt" IS NULL
                  AND COALESCE(n."title", '') ILIKE ${titleLike}
            ) AS m
            ORDER BY m."updatedAt" DESC, m.id DESC
        `;

        if (rankedMatches.length === 0) return [];

        const rankedIds = rankedMatches.map((row) => row.id);
        const notes = await prisma.note.findMany({
            where: {
                projectId,
                deletedAt: null,
                id: { in: rankedIds },
            },
        });

        const rank = new Map(rankedIds.map((id, idx) => [id, idx]));
        notes.sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
        return notes;
    } catch (error) {
        const reason = error instanceof Error ? error.message : "unknown error";
        console.warn(`[notes.search] FTS query failed, falling back to ILIKE scan: ${reason}`);
        return prisma.note.findMany({
            where: {
                projectId,
                deletedAt: null,
                OR: [
                    { title: { contains: trimmedQuery, mode: "insensitive" } },
                    { contentText: { contains: trimmedQuery, mode: "insensitive" } },
                ],
            },
            orderBy: { updatedAt: "desc" },
        });
    }
}
