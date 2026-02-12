import { describe, it, expect, vi, beforeEach } from "vitest";
import { storeMemoryTool } from "@/lib/server/ai/tools/store-memory";
import { resolveAutonomyLevel } from "@/lib/server/ai/tools/base";

// Mock the memory services
vi.mock("@/lib/server/memory/user-memory", () => ({
    getUserMemory: vi.fn(),
}));

vi.mock("@/lib/server/memory/project-memory", () => ({
    searchProjectMemories: vi.fn(),
}));

import { getUserMemory } from "@/lib/server/memory/user-memory";
import { searchProjectMemories } from "@/lib/server/memory/project-memory";

const mockedGetUserMemory = vi.mocked(getUserMemory);
const mockedSearchProjectMemories = vi.mocked(searchProjectMemories);

describe("storeMemoryTool", () => {
    beforeEach(() => {
        vi.clearAllMocks();
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
        mockedGetUserMemory.mockResolvedValue({
            id: "mem-1",
            userId: "user-1",
            type: "preference",
            key: "citation_format",
            value: "APA 7th",
            rationale: null,
            status: "active",
            tags: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            archivedAt: null,
        });

        const result = await storeMemoryTool.execute(
            { memoryType: "user", key: "citation_format", value: "APA 7th" },
            { userId: "user-1", projectId: "proj-1" },
        );

        expect(result.result).toEqual({
            skipped: true,
            reason: 'Already remembered: "citation_format"',
        });
    });

    it("allows update when value differs from existing", async () => {
        mockedGetUserMemory.mockResolvedValue({
            id: "mem-1",
            userId: "user-1",
            type: "preference",
            key: "citation_format",
            value: "MLA",
            rationale: null,
            status: "active",
            tags: [],
            createdAt: new Date(),
            updatedAt: new Date(),
            archivedAt: null,
        });

        const result = await storeMemoryTool.execute(
            { memoryType: "user", key: "citation_format", value: "APA 7th" },
            { userId: "user-1", projectId: "proj-1" },
        );

        expect(result.result).toEqual({
            memoryType: "user",
            key: "citation_format",
            value: "APA 7th",
            rationale: undefined,
        });
    });

    it("returns skipped for duplicate project memory", async () => {
        mockedSearchProjectMemories.mockResolvedValue([
            {
                id: "pm-1",
                projectId: "proj-1",
                type: "decision",
                category: null,
                statement: "Exclude case studies",
                rationale: null,
                context: null,
                status: "active",
                version: 1,
                supersededBy: null,
                tags: [],
                importance: "normal",
                createdAt: new Date(),
                updatedAt: new Date(),
                archivedAt: null,
            },
        ]);

        const result = await storeMemoryTool.execute(
            { memoryType: "project", key: "exclusion_rule", value: "Exclude case studies" },
            { userId: "user-1", projectId: "proj-1" },
        );

        expect(result.result).toEqual({
            skipped: true,
            reason: 'Already remembered: "exclusion_rule"',
        });
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
