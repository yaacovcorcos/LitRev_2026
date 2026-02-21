import { describe, it, expect, vi, beforeEach } from "vitest";
import { storeMemoryTool } from "@/lib/server/ai/tools/store-memory";
import { resolveAutonomyLevel } from "@/lib/server/ai/tools/base";

// Mock the memory services
vi.mock("@/lib/server/memory/user-memory", () => ({
    getUserMemory: vi.fn(),
    getUserMemories: vi.fn(),
}));

vi.mock("@/lib/server/memory/project-memory", () => ({
    getProjectMemories: vi.fn(),
}));

import { getUserMemory, getUserMemories } from "@/lib/server/memory/user-memory";
import { getProjectMemories } from "@/lib/server/memory/project-memory";

const mockedGetUserMemory = vi.mocked(getUserMemory);
const mockedGetUserMemories = vi.mocked(getUserMemories);
const mockedGetProjectMemories = vi.mocked(getProjectMemories);

function buildUserMemory(overrides: Partial<{
    id: string;
    userId: string;
    type: string;
    key: string;
    value: string;
    rationale: string | null;
    status: string;
    source: string;
    confidence: number;
    retrievalCount: number;
    usedInAnswerCount: number;
    acceptedCount: number;
    rejectedCount: number;
    contradictionCount: number;
    pinned: boolean;
    tags: string[];
    createdAt: Date;
    updatedAt: Date;
    archivedAt: Date | null;
}> = {}) {
    return {
        id: "mem-1",
        userId: "user-1",
        type: "preference",
        key: "citation_format",
        value: "APA 7th",
        rationale: null,
        status: "active",
        source: "explicit",
        confidence: 1,
        retrievalCount: 0,
        usedInAnswerCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        contradictionCount: 0,
        pinned: false,
        tags: [],
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        ...overrides,
    };
}

function buildProjectMemory(overrides: Partial<{
    id: string;
    projectId: string;
    type: string;
    category: string | null;
    statement: string;
    rationale: string | null;
    context: string | null;
    status: string;
    source: string;
    confidence: number;
    retrievalCount: number;
    usedInAnswerCount: number;
    acceptedCount: number;
    rejectedCount: number;
    contradictionCount: number;
    pinned: boolean;
    version: number;
    supersededBy: string | null;
    tags: string[];
    importance: string;
    createdAt: Date;
    updatedAt: Date;
    archivedAt: Date | null;
}> = {}) {
    return {
        id: "pm-1",
        projectId: "proj-1",
        type: "decision",
        category: null,
        statement: "Exclude case studies",
        rationale: null,
        context: null,
        status: "active",
        source: "decision",
        confidence: 1,
        retrievalCount: 0,
        usedInAnswerCount: 0,
        acceptedCount: 0,
        rejectedCount: 0,
        contradictionCount: 0,
        pinned: false,
        version: 1,
        supersededBy: null,
        tags: [],
        importance: "normal",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
        ...overrides,
    };
}

describe("storeMemoryTool", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedGetProjectMemories.mockResolvedValue([]);
        mockedGetUserMemories.mockResolvedValue([]);
    });

    it("has correct tool definition name", () => {
        expect(storeMemoryTool.definition.name).toBe("store_memory");
    });

    it("has hard cap of 2 in autonomy metadata", () => {
        expect(storeMemoryTool.autonomy?.hardCap).toBe(2);
        expect(storeMemoryTool.autonomy?.defaultLevel).toBe(2);
        expect(storeMemoryTool.autonomy?.allowedRange).toEqual([1, 2]);
    });

    it("returns MemoryProposalPayload for new user memory", async () => {
        mockedGetUserMemory.mockResolvedValue(null);

        const result = await storeMemoryTool.execute(
            { memoryType: "user", key: "citation_format", value: "APA 7th", rationale: "User stated preference" },
            { userId: "user-1", projectId: "proj-1" },
        );

        expect(result.result).toEqual({
            memoryType: "user",
            key: "citation_format",
            value: "APA 7th",
            rationale: "User stated preference",
        });
    });

    it("returns skipped when duplicate user memory exists", async () => {
        mockedGetUserMemory.mockResolvedValue(buildUserMemory());

        const result = await storeMemoryTool.execute(
            { memoryType: "user", key: "citation_format", value: "APA 7th" },
            { userId: "user-1", projectId: "proj-1" },
        );

        expect(result.result).toBeNull();
        expect(result.error).toBe('Already remembered: "citation_format". No action needed.');
    });

    it("allows update when value differs from existing", async () => {
        mockedGetUserMemory.mockResolvedValue(buildUserMemory({ value: "MLA" }));

        const result = await storeMemoryTool.execute(
            { memoryType: "user", key: "citation_format", value: "APA 7th" },
            { userId: "user-1", projectId: "proj-1" },
        );

        expect(result.result).toEqual(expect.objectContaining({
            memoryType: "user",
            key: "citation_format",
            value: "APA 7th",
        }));
        expect((result.result as { rationale?: string }).rationale).toContain('Deterministic conflict: currently remembered "citation_format" is "MLA".');
    });

    it("returns skipped for duplicate project memory", async () => {
        mockedGetProjectMemories.mockResolvedValue([
            buildProjectMemory(),
        ]);

        const result = await storeMemoryTool.execute(
            { memoryType: "project", key: "exclusion_rule", value: "Exclude case studies" },
            { userId: "user-1", projectId: "proj-1" },
        );

        expect(result.result).toBeNull();
        expect(result.error).toBe('Already remembered: "exclusion_rule". No action needed.');
    });

    it("defaults memoryType to user when not provided", async () => {
        mockedGetUserMemory.mockResolvedValue(null);

        const result = await storeMemoryTool.execute(
            { key: "writing_style", value: "Formal academic" },
            { userId: "user-1" },
        );

        expect(result.result).toEqual({
            memoryType: "user",
            key: "writing_style",
            value: "Formal academic",
            rationale: undefined,
        });
    });

    it("normalizes key casing and whitespace", async () => {
        mockedGetUserMemory.mockResolvedValue(null);

        const result = await storeMemoryTool.execute(
            { key: "  Citation Format  ", value: "APA 7th" },
            { userId: "user-1" },
        );

        expect(result.result).toEqual({
            memoryType: "user",
            key: "citation_format",
            value: "APA 7th",
            rationale: undefined,
        });
    });

    it("dedupes user memory by normalized value text", async () => {
        mockedGetUserMemory.mockResolvedValue(buildUserMemory({ value: "APA   7TH" }));

        const result = await storeMemoryTool.execute(
            { key: "Citation Format", value: "  apa 7th  " },
            { userId: "user-1" },
        );

        expect(result.result).toBeNull();
        expect(result.error).toBe('Already remembered: "citation_format". No action needed.');
    });

    it("dedupes project memory by normalized statement text", async () => {
        mockedGetProjectMemories.mockResolvedValue([
            buildProjectMemory({ statement: "Exclude   case studies" }),
        ]);

        const result = await storeMemoryTool.execute(
            { memoryType: "project", key: "exclusion_rule", value: " exclude case studies " },
            { userId: "user-1", projectId: "proj-1" },
        );

        expect(result.result).toBeNull();
        expect(result.error).toBe('Already remembered: "exclusion_rule". No action needed.');
    });

    it("adds conflict rationale when project memory with same key tag has different value", async () => {
        mockedGetProjectMemories.mockResolvedValue([
            buildProjectMemory({ tags: ["ai-proposed", "memory-key:exclusion_rule"] }),
        ]);

        const result = await storeMemoryTool.execute(
            { memoryType: "project", key: "exclusion_rule", value: "Exclude retrospective cohorts" },
            { userId: "user-1", projectId: "proj-1" },
        );

        expect(result.error).toBeUndefined();
        expect(result.result).toEqual(expect.objectContaining({
            memoryType: "project",
            key: "exclusion_rule",
            value: "Exclude retrospective cohorts",
        }));
        expect((result.result as { rationale?: string }).rationale).toContain('Deterministic conflict: existing project memory for "exclusion_rule" says "Exclude case studies".');
    });
});

describe("store_memory autonomy resolution", () => {
    it("respects hard cap — level 4 resolves to 2", () => {
        const resolved = resolveAutonomyLevel("store_memory", 4, storeMemoryTool.autonomy);
        expect(resolved).toBe(2);
    });

    it("allows level 1 (suggest)", () => {
        const resolved = resolveAutonomyLevel("store_memory", 1, storeMemoryTool.autonomy);
        expect(resolved).toBe(1);
    });

    it("allows level 2 (propose)", () => {
        const resolved = resolveAutonomyLevel("store_memory", 2, storeMemoryTool.autonomy);
        expect(resolved).toBe(2);
    });
});
