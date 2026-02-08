/**
 * Notes Service Layer
 * CRUD + search for project notes (planC Phase 6.1)
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";

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

    return prisma.note.create({
        data: {
            projectId: input.projectId,
            userId: input.userId ?? null,
            title,
            content: input.content as object,
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
    return prisma.note.findUnique({ where: { id } });
}

export async function listNotes(projectId: string, options?: ListNotesOptions) {
    const where: Record<string, unknown> = { projectId };

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

    return prisma.note.findMany({
        where,
        orderBy: { updatedAt: "desc" },
    });
}

export async function updateNote(id: string, input: UpdateNoteInput) {
    const data: Record<string, unknown> = {};

    if (input.title !== undefined) data.title = input.title;
    if (input.content !== undefined) data.content = input.content as object;
    if (input.tags !== undefined) data.tags = input.tags;
    if (input.linkedStudyId !== undefined) data.linkedStudyId = input.linkedStudyId;
    if (input.linkedSection !== undefined) data.linkedSection = input.linkedSection;

    return prisma.note.update({ where: { id }, data });
}

export async function deleteNote(id: string) {
    return prisma.note.delete({ where: { id } });
}

/**
 * Full-text search on notes. Searches title (via DB) and content text (post-filter).
 * Returns matches ordered by updatedAt desc.
 */
export async function searchNotes(projectId: string, query: string) {
    if (!query.trim()) return listNotes(projectId);

    const lowerQuery = query.toLowerCase();

    // Fetch all notes for the project (content search requires post-filtering)
    const all = await prisma.note.findMany({
        where: { projectId },
        orderBy: { updatedAt: "desc" },
    });

    return all.filter((note) => {
        if (note.title?.toLowerCase().includes(lowerQuery)) return true;
        const text = extractTextFromContent(note.content as NoteContent);
        return text.toLowerCase().includes(lowerQuery);
    });
}
