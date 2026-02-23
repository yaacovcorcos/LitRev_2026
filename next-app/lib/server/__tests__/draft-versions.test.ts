import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Prisma ──────────────────────────────────────────────────────────────

const mockCreate = vi.fn();
const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        draftVersion: {
            create: (...args: unknown[]) => mockCreate(...args),
            findFirst: (...args: unknown[]) => mockFindFirst(...args),
            findMany: (...args: unknown[]) => mockFindMany(...args),
        },
    },
}));

vi.mock("@/lib/server/access", () => ({
    assertProjectAccess: vi.fn().mockResolvedValue(undefined),
}));

import {
    createDraftVersion,
    listDraftVersions,
    getLatestDraftVersion,
} from "../draft-versions";

// ── Test fixtures ────────────────────────────────────────────────────────────

const PROJECT_ID = "proj-1";
const SCOPE = { userId: "user-1", workspaceId: "ws-1" };

const sampleContent = {
    type: "doc",
    content: [
        { type: "paragraph", content: [{ type: "text", text: "Hello world" }] },
    ],
};

const sampleVersion = {
    id: "dv-1",
    projectId: PROJECT_ID,
    section: "introduction",
    content: sampleContent,
    contentText: "Hello world",
    wordCount: 2,
    artifactId: "art-1",
    conversationId: "conv-1",
    version: 1,
    createdAt: new Date("2026-02-22"),
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("createDraftVersion", () => {
    beforeEach(() => vi.clearAllMocks());

    it("assigns version=1 for the first entry", async () => {
        mockFindFirst.mockResolvedValue(null);
        mockCreate.mockResolvedValue(sampleVersion);

        await createDraftVersion(SCOPE, {
            projectId: PROJECT_ID,
            section: "Introduction",
            content: sampleContent,
            wordCount: 2,
            artifactId: "art-1",
            conversationId: "conv-1",
        });

        expect(mockCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                projectId: PROJECT_ID,
                section: "introduction",
                version: 1,
                wordCount: 2,
                artifactId: "art-1",
                conversationId: "conv-1",
            }),
        });
    });

    it("increments version for same project+section", async () => {
        mockFindFirst.mockResolvedValue({ version: 3 });
        mockCreate.mockResolvedValue({ ...sampleVersion, version: 4 });

        await createDraftVersion(SCOPE, {
            projectId: PROJECT_ID,
            section: "Introduction",
            content: sampleContent,
        });

        expect(mockCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                version: 4,
            }),
        });
    });

    it("lowercases the section name", async () => {
        mockFindFirst.mockResolvedValue(null);
        mockCreate.mockResolvedValue(sampleVersion);

        await createDraftVersion(SCOPE, {
            projectId: PROJECT_ID,
            section: "Methods",
            content: sampleContent,
        });

        expect(mockFindFirst).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { projectId: PROJECT_ID, section: "methods" },
            }),
        );
        expect(mockCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({ section: "methods" }),
        });
    });

    it("extracts contentText from TipTap JSON", async () => {
        mockFindFirst.mockResolvedValue(null);
        mockCreate.mockResolvedValue(sampleVersion);

        await createDraftVersion(SCOPE, {
            projectId: PROJECT_ID,
            section: "introduction",
            content: sampleContent,
        });

        expect(mockCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                contentText: "Hello world",
            }),
        });
    });

    it("defaults wordCount to 0 and optional fields to null", async () => {
        mockFindFirst.mockResolvedValue(null);
        mockCreate.mockResolvedValue(sampleVersion);

        await createDraftVersion(SCOPE, {
            projectId: PROJECT_ID,
            section: "introduction",
            content: sampleContent,
        });

        expect(mockCreate).toHaveBeenCalledWith({
            data: expect.objectContaining({
                wordCount: 0,
                artifactId: null,
                conversationId: null,
            }),
        });
    });
});

describe("listDraftVersions", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns versions ordered by version desc", async () => {
        const versions = [
            { ...sampleVersion, version: 3 },
            { ...sampleVersion, version: 2 },
            { ...sampleVersion, version: 1 },
        ];
        mockFindMany.mockResolvedValue(versions);

        const result = await listDraftVersions(SCOPE, PROJECT_ID, "Introduction");

        expect(mockFindMany).toHaveBeenCalledWith({
            where: { projectId: PROJECT_ID, section: "introduction" },
            orderBy: { version: "desc" },
        });
        expect(result).toEqual(versions);
    });
});

describe("getLatestDraftVersion", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns the highest version entry", async () => {
        mockFindFirst.mockResolvedValue({ ...sampleVersion, version: 5 });

        const result = await getLatestDraftVersion(SCOPE, PROJECT_ID, "introduction");

        expect(mockFindFirst).toHaveBeenCalledWith({
            where: { projectId: PROJECT_ID, section: "introduction" },
            orderBy: { version: "desc" },
        });
        expect(result?.version).toBe(5);
    });

    it("returns null when no versions exist", async () => {
        mockFindFirst.mockResolvedValue(null);

        const result = await getLatestDraftVersion(SCOPE, PROJECT_ID, "introduction");

        expect(result).toBeNull();
    });
});
