import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const mockCreate = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockQueryRaw = vi.fn();

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        $queryRaw: (...args: unknown[]) => mockQueryRaw(...args),
        note: {
            create: (...args: unknown[]) => mockCreate(...args),
            findFirst: (...args: unknown[]) => mockFindFirst(...args),
            findMany: (...args: unknown[]) => mockFindMany(...args),
            update: (...args: unknown[]) => mockUpdate(...args),
        },
    },
}));

import {
    createNote,
    getNote,
    listNotes,
    listNotesPaginated,
    updateNote,
    deleteNote,
    searchNotes,
    extractTextFromContent,
    textToTipTapDoc,
    type NoteContent,
} from "../notes";

// ── Test fixtures ────────────────────────────────────────────────────────────

const PROJECT_ID = "proj-1";

const sampleDoc: NoteContent = {
    type: "doc",
    content: [
        {
            type: "paragraph",
            content: [{ type: "text", text: "Hello world" }],
        },
        {
            type: "paragraph",
            content: [
                { type: "text", text: "Second " },
                { type: "text", text: "paragraph", marks: [{ type: "bold" }] },
            ],
        },
    ],
};

const sampleNote = {
    id: "note-1",
    projectId: PROJECT_ID,
    userId: null,
    title: "Hello world",
    content: sampleDoc,
    contentText: "Hello world Second paragraph",
    tags: ["review"],
    linkedStudyId: null,
    linkedSection: null,
    source: "manual",
    sourceConversationId: null,
    sourceMessageId: null,
    deletedAt: null,
    createdAt: new Date("2026-01-15"),
    updatedAt: new Date("2026-01-15"),
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("extractTextFromContent", () => {
    it("extracts text from a flat paragraph", () => {
        const doc: NoteContent = {
            type: "doc",
            content: [
                { type: "paragraph", content: [{ type: "text", text: "Hello" }] },
            ],
        };
        expect(extractTextFromContent(doc)).toBe("Hello");
    });

    it("extracts text from nested structure with marks", () => {
        expect(extractTextFromContent(sampleDoc)).toBe("Hello world Second paragraph");
    });

    it("returns empty string for empty doc", () => {
        expect(extractTextFromContent({ type: "doc" })).toBe("");
    });

    it("handles text node directly", () => {
        expect(extractTextFromContent({ type: "text", text: "Direct" })).toBe("Direct");
    });
});

describe("textToTipTapDoc", () => {
    it("wraps plain text in doc structure", () => {
        const doc = textToTipTapDoc("Hello world");
        expect(doc.type).toBe("doc");
        expect(doc.content).toHaveLength(1);
        expect(doc.content![0].type).toBe("paragraph");
        expect(doc.content![0].content![0].text).toBe("Hello world");
    });

    it("splits on double newline into multiple paragraphs", () => {
        const doc = textToTipTapDoc("First\n\nSecond");
        expect(doc.content).toHaveLength(2);
        expect(doc.content![0].content![0].text).toBe("First");
        expect(doc.content![1].content![0].text).toBe("Second");
    });

    it("handles empty string with a single empty paragraph", () => {
        const doc = textToTipTapDoc("");
        expect(doc.type).toBe("doc");
        expect(doc.content).toHaveLength(1);
        expect(doc.content![0].content![0].text).toBe("");
    });
});

describe("createNote", () => {
    beforeEach(() => vi.clearAllMocks());

    it("creates a note with correct fields", async () => {
        mockCreate.mockResolvedValue(sampleNote);

        const result = await createNote({
            projectId: PROJECT_ID,
            title: "My Note",
            content: sampleDoc,
            tags: ["review"],
            source: "manual",
        });

        expect(mockCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                projectId: PROJECT_ID,
                title: "My Note",
                content: sampleDoc,
                contentText: "Hello world Second paragraph",
                tags: ["review"],
                source: "manual",
            }),
        });
        expect(result).toBe(sampleNote);
    });

    it("auto-generates title from content when title not provided", async () => {
        mockCreate.mockResolvedValue(sampleNote);

        await createNote({
            projectId: PROJECT_ID,
            content: sampleDoc,
        });

        expect(mockCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                title: "Hello world Second paragraph",
            }),
        });
    });

    it("truncates auto-generated title at 50 chars", async () => {
        mockCreate.mockResolvedValue(sampleNote);

        const longDoc: NoteContent = {
            type: "doc",
            content: [{
                type: "paragraph",
                content: [{ type: "text", text: "A".repeat(100) }],
            }],
        };

        await createNote({ projectId: PROJECT_ID, content: longDoc });

        expect(mockCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                title: "A".repeat(50) + "…",
            }),
        });
    });

    it("defaults source to manual and nullifies optional fields", async () => {
        mockCreate.mockResolvedValue(sampleNote);

        await createNote({ projectId: PROJECT_ID, content: sampleDoc });

        expect(mockCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                source: "manual",
                userId: null,
                linkedStudyId: null,
                linkedSection: null,
                sourceConversationId: null,
                sourceMessageId: null,
                tags: [],
            }),
        });
    });
});

describe("getNote", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns the note when found", async () => {
        mockFindFirst.mockResolvedValue(sampleNote);
        const result = await getNote("note-1");
        expect(mockFindFirst).toHaveBeenCalledWith({ where: { id: "note-1", deletedAt: null } });
        expect(result).toBe(sampleNote);
    });

    it("returns null for non-existent ID", async () => {
        mockFindFirst.mockResolvedValue(null);
        const result = await getNote("nonexistent");
        expect(result).toBeNull();
    });
});

describe("listNotes", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns notes ordered by updatedAt desc", async () => {
        mockFindMany.mockResolvedValue([sampleNote]);

        const result = await listNotes(PROJECT_ID);

        expect(mockFindMany).toHaveBeenCalledWith({
            where: { projectId: PROJECT_ID, deletedAt: null },
            orderBy: { updatedAt: "desc" },
        });
        expect(result).toEqual([sampleNote]);
    });

    it("filters by tags with hasSome", async () => {
        mockFindMany.mockResolvedValue([]);

        await listNotes(PROJECT_ID, { tags: ["review", "important"] });

        expect(mockFindMany).toHaveBeenCalledWith({
            where: {
                projectId: PROJECT_ID,
                deletedAt: null,
                tags: { hasSome: ["review", "important"] },
            },
            orderBy: { updatedAt: "desc" },
        });
    });

    it("filters by source", async () => {
        mockFindMany.mockResolvedValue([]);

        await listNotes(PROJECT_ID, { source: "conversation" });

        expect(mockFindMany).toHaveBeenCalledWith({
            where: {
                projectId: PROJECT_ID,
                deletedAt: null,
                source: "conversation",
            },
            orderBy: { updatedAt: "desc" },
        });
    });

    it("filters by search on title (case-insensitive)", async () => {
        mockFindMany.mockResolvedValue([]);

        await listNotes(PROJECT_ID, { search: "hello" });

        expect(mockFindMany).toHaveBeenCalledWith({
            where: {
                projectId: PROJECT_ID,
                deletedAt: null,
                title: { contains: "hello", mode: "insensitive" },
            },
            orderBy: { updatedAt: "desc" },
        });
    });

    it("filters by linkedStudyId", async () => {
        mockFindMany.mockResolvedValue([]);

        await listNotes(PROJECT_ID, { linkedStudyId: "study-1" });

        expect(mockFindMany).toHaveBeenCalledWith({
            where: {
                projectId: PROJECT_ID,
                deletedAt: null,
                linkedStudyId: "study-1",
            },
            orderBy: { updatedAt: "desc" },
        });
    });
});

describe("listNotesPaginated", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns a nextCursor when there are more rows than limit", async () => {
        const notes = [
            { ...sampleNote, id: "note-3", updatedAt: new Date("2026-01-17") },
            { ...sampleNote, id: "note-2", updatedAt: new Date("2026-01-16") },
            { ...sampleNote, id: "note-1", updatedAt: new Date("2026-01-15") },
        ];
        mockFindMany.mockResolvedValue(notes);

        const result = await listNotesPaginated(PROJECT_ID, { limit: 2 });

        expect(result.items).toHaveLength(2);
        expect(result.nextCursor).toBe("note-2");
        expect(mockFindMany).toHaveBeenCalledWith({
            where: { projectId: PROJECT_ID, deletedAt: null },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: 3,
        });
    });

    it("applies cursor filtering based on updatedAt and id", async () => {
        mockFindFirst.mockResolvedValue({
            id: "note-cursor",
            updatedAt: new Date("2026-01-18"),
        });
        mockFindMany.mockResolvedValue([sampleNote]);

        await listNotesPaginated(PROJECT_ID, { cursor: "note-cursor", limit: 2 });

        expect(mockFindFirst).toHaveBeenCalledWith({
            where: { id: "note-cursor", projectId: PROJECT_ID, deletedAt: null },
            select: { id: true, updatedAt: true },
        });
        expect(mockFindMany).toHaveBeenCalledWith({
            where: {
                projectId: PROJECT_ID,
                deletedAt: null,
                OR: [
                    { updatedAt: { lt: new Date("2026-01-18") } },
                    { updatedAt: { equals: new Date("2026-01-18") }, id: { lt: "note-cursor" } },
                ],
            },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: 3,
        });
    });
});

describe("updateNote", () => {
    beforeEach(() => vi.clearAllMocks());

    it("updates only specified fields", async () => {
        mockFindFirst.mockResolvedValue({ id: "note-1" });
        mockUpdate.mockResolvedValue({ ...sampleNote, title: "Updated" });

        await updateNote("note-1", { title: "Updated" });

        expect(mockFindFirst).toHaveBeenCalledWith({
            where: { id: "note-1", deletedAt: null },
            select: { id: true },
        });
        expect(mockUpdate).toHaveBeenCalledWith({
            where: { id: "note-1" },
            data: { title: "Updated" },
        });
    });

    it("can set linkedStudyId to null", async () => {
        mockFindFirst.mockResolvedValue({ id: "note-1" });
        mockUpdate.mockResolvedValue(sampleNote);

        await updateNote("note-1", { linkedStudyId: null });

        expect(mockUpdate).toHaveBeenCalledWith({
            where: { id: "note-1" },
            data: { linkedStudyId: null },
        });
    });

    it("updates contentText when content changes", async () => {
        mockFindFirst.mockResolvedValue({ id: "note-1" });
        mockUpdate.mockResolvedValue(sampleNote);

        await updateNote("note-1", { content: sampleDoc });

        expect(mockUpdate).toHaveBeenCalledWith({
            where: { id: "note-1" },
            data: {
                content: sampleDoc,
                contentText: "Hello world Second paragraph",
            },
        });
    });

    it("throws when updating a deleted or missing note", async () => {
        mockFindFirst.mockResolvedValue(null);

        await expect(updateNote("note-1", { title: "Updated" })).rejects.toThrow("Note not found");
        expect(mockUpdate).not.toHaveBeenCalled();
    });
});

describe("deleteNote", () => {
    beforeEach(() => vi.clearAllMocks());

    it("soft-deletes the note by setting deletedAt", async () => {
        mockFindFirst.mockResolvedValue({ id: "note-1" });
        mockUpdate.mockResolvedValue(sampleNote);

        await deleteNote("note-1");

        expect(mockFindFirst).toHaveBeenCalledWith({
            where: { id: "note-1", deletedAt: null },
            select: { id: true },
        });
        expect(mockUpdate).toHaveBeenCalledWith({
            where: { id: "note-1" },
            data: { deletedAt: expect.any(Date) },
        });
    });

    it("throws when deleting an already-deleted or missing note", async () => {
        mockFindFirst.mockResolvedValue(null);

        await expect(deleteNote("note-1")).rejects.toThrow("Note not found");
        expect(mockUpdate).not.toHaveBeenCalled();
    });
});

describe("searchNotes", () => {
    beforeEach(() => vi.clearAllMocks());

    it("uses FTS query + ranked hydration for non-empty queries", async () => {
        mockQueryRaw.mockResolvedValue([{ id: "note-1" }]);
        mockFindMany.mockResolvedValue([sampleNote]);

        const results = await searchNotes(PROJECT_ID, "hello");

        expect(results).toEqual([sampleNote]);
        expect(mockQueryRaw).toHaveBeenCalledTimes(1);
        expect(mockFindMany).toHaveBeenCalledWith({
            where: {
                projectId: PROJECT_ID,
                deletedAt: null,
                id: { in: ["note-1"] },
            },
        });
    });

    it("falls back to ILIKE scan when FTS query fails", async () => {
        mockQueryRaw.mockRejectedValue(new Error("fts unavailable"));
        mockFindMany.mockResolvedValue([sampleNote]);
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        const results = await searchNotes(PROJECT_ID, "hello");

        expect(results).toEqual([sampleNote]);
        expect(warnSpy).toHaveBeenCalledWith(
            "[notes.search] fts query failed, falling back to ilike scan",
            {
                projectId: PROJECT_ID,
                reason: "fts unavailable",
            },
        );
        expect(mockFindMany).toHaveBeenCalledWith({
            where: {
                projectId: PROJECT_ID,
                deletedAt: null,
                OR: [
                    { title: { contains: "hello", mode: "insensitive" } },
                    { contentText: { contains: "hello", mode: "insensitive" } },
                ],
            },
            orderBy: { updatedAt: "desc" },
        });
        warnSpy.mockRestore();
    });

    it("falls back to listNotes when query is empty", async () => {
        mockFindMany.mockResolvedValue([sampleNote]);

        const results = await searchNotes(PROJECT_ID, "  ");

        expect(mockQueryRaw).not.toHaveBeenCalled();
        // Should call findMany with just projectId (no post-filtering)
        expect(mockFindMany).toHaveBeenCalledWith({
            where: { projectId: PROJECT_ID, deletedAt: null },
            orderBy: { updatedAt: "desc" },
        });
        expect(results).toEqual([sampleNote]);
    });
});
