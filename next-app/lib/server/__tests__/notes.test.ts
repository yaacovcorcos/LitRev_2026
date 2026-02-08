import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const mockCreate = vi.fn();
const mockFindUnique = vi.fn();
const mockFindMany = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        note: {
            create: (...args: unknown[]) => mockCreate(...args),
            findUnique: (...args: unknown[]) => mockFindUnique(...args),
            findMany: (...args: unknown[]) => mockFindMany(...args),
            update: (...args: unknown[]) => mockUpdate(...args),
            delete: (...args: unknown[]) => mockDelete(...args),
        },
    },
}));

import {
    createNote,
    getNote,
    listNotes,
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
    tags: ["review"],
    linkedStudyId: null,
    linkedSection: null,
    source: "manual",
    sourceConversationId: null,
    sourceMessageId: null,
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
        mockFindUnique.mockResolvedValue(sampleNote);
        const result = await getNote("note-1");
        expect(mockFindUnique).toHaveBeenCalledWith({ where: { id: "note-1" } });
        expect(result).toBe(sampleNote);
    });

    it("returns null for non-existent ID", async () => {
        mockFindUnique.mockResolvedValue(null);
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
            where: { projectId: PROJECT_ID },
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
                linkedStudyId: "study-1",
            },
            orderBy: { updatedAt: "desc" },
        });
    });
});

describe("updateNote", () => {
    beforeEach(() => vi.clearAllMocks());

    it("updates only specified fields", async () => {
        mockUpdate.mockResolvedValue({ ...sampleNote, title: "Updated" });

        await updateNote("note-1", { title: "Updated" });

        expect(mockUpdate).toHaveBeenCalledWith({
            where: { id: "note-1" },
            data: { title: "Updated" },
        });
    });

    it("can set linkedStudyId to null", async () => {
        mockUpdate.mockResolvedValue(sampleNote);

        await updateNote("note-1", { linkedStudyId: null });

        expect(mockUpdate).toHaveBeenCalledWith({
            where: { id: "note-1" },
            data: { linkedStudyId: null },
        });
    });
});

describe("deleteNote", () => {
    beforeEach(() => vi.clearAllMocks());

    it("deletes the note by ID", async () => {
        mockDelete.mockResolvedValue(sampleNote);

        await deleteNote("note-1");

        expect(mockDelete).toHaveBeenCalledWith({ where: { id: "note-1" } });
    });
});

describe("searchNotes", () => {
    beforeEach(() => vi.clearAllMocks());

    it("matches on title", async () => {
        mockFindMany.mockResolvedValue([sampleNote]);

        const results = await searchNotes(PROJECT_ID, "Hello");

        expect(results).toEqual([sampleNote]);
    });

    it("matches on content text", async () => {
        const noteWithoutTitleMatch = {
            ...sampleNote,
            title: "Untitled",
        };
        mockFindMany.mockResolvedValue([noteWithoutTitleMatch]);

        const results = await searchNotes(PROJECT_ID, "paragraph");

        expect(results).toEqual([noteWithoutTitleMatch]);
    });

    it("is case-insensitive", async () => {
        mockFindMany.mockResolvedValue([sampleNote]);

        const results = await searchNotes(PROJECT_ID, "HELLO");

        expect(results).toEqual([sampleNote]);
    });

    it("returns empty array when no match", async () => {
        mockFindMany.mockResolvedValue([sampleNote]);

        const results = await searchNotes(PROJECT_ID, "nonexistent");

        expect(results).toEqual([]);
    });

    it("falls back to listNotes when query is empty", async () => {
        mockFindMany.mockResolvedValue([sampleNote]);

        const results = await searchNotes(PROJECT_ID, "  ");

        // Should call findMany with just projectId (no post-filtering)
        expect(mockFindMany).toHaveBeenCalledWith({
            where: { projectId: PROJECT_ID },
            orderBy: { updatedAt: "desc" },
        });
        expect(results).toEqual([sampleNote]);
    });
});
