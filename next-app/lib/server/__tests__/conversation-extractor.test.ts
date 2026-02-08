import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractMemoriesFromConversation } from "../memory/conversation-extractor";

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        aIMessage: { findMany: vi.fn() },
        projectMemory: { findFirst: vi.fn() },
    },
}));

const mockChat = vi.fn().mockResolvedValue({
    content: JSON.stringify({
        decisions: [{ statement: "Exclude case studies", category: "exclusion", rationale: "Low evidence" }],
        preferences: [{ key: "citation_style", value: "APA", rationale: "User mentioned APA" }],
        facts: [{ statement: "Primary outcome is mortality", category: "outcome" }],
    }),
});

vi.mock("@/lib/server/ai", () => ({
    getAIService: vi.fn(() => ({ chat: mockChat })),
}));

vi.mock("@/lib/server/memory/project-memory", () => ({
    createProjectMemory: vi.fn().mockResolvedValue({ id: "pm-new" }),
}));

vi.mock("@/lib/server/agent/artifacts", () => ({
    createArtifact: vi.fn().mockResolvedValue({ id: "art-new" }),
}));

const { prisma } = await import("@/lib/server/prisma");
const { createProjectMemory } = await import("@/lib/server/memory/project-memory");
const { createArtifact } = await import("@/lib/server/agent/artifacts");
const { getAIService } = await import("@/lib/server/ai");

const mockFindMany = vi.mocked(prisma.aIMessage.findMany);
const mockMemoryFindFirst = vi.mocked(prisma.projectMemory.findFirst);
const mockCreatePM = vi.mocked(createProjectMemory);
const mockCreateArtifact = vi.mocked(createArtifact);

function makeMessages(count: number) {
    return Array.from({ length: count }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i} with enough content to pass the threshold easily`,
    }));
}

beforeEach(() => {
    vi.clearAllMocks();
    // Default: no prior extraction exists (dedup guard passes)
    mockMemoryFindFirst.mockResolvedValue(null);
});

describe("extractMemoriesFromConversation", () => {
    it("returns empty when conversation has < 5 substantive messages", async () => {
        mockFindMany.mockResolvedValue(makeMessages(3) as any);

        const result = await extractMemoriesFromConversation("conv-1", "proj-1");

        expect(result).toEqual({ decisions: [], preferences: [], facts: [] });
        expect(getAIService).not.toHaveBeenCalled();
    });

    it("calls AI with grok-4-1-fast model", async () => {
        mockFindMany.mockResolvedValue(makeMessages(6) as any);

        await extractMemoriesFromConversation("conv-1", "proj-1");

        expect(mockChat).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({ model: "grok-4-1-fast" }),
        );
    });

    it("creates ProjectMemory for each extracted decision", async () => {
        mockFindMany.mockResolvedValue(makeMessages(6) as any);

        await extractMemoriesFromConversation("conv-1", "proj-1");

        expect(mockCreatePM).toHaveBeenCalledWith(expect.objectContaining({
            type: "decision",
            statement: "Exclude case studies",
            category: "exclusion",
            rationale: "Low evidence",
            importance: "important",
        }));
    });

    it("creates ProjectMemory (type: definition) for each fact", async () => {
        mockFindMany.mockResolvedValue(makeMessages(6) as any);

        await extractMemoriesFromConversation("conv-1", "proj-1");

        expect(mockCreatePM).toHaveBeenCalledWith(expect.objectContaining({
            type: "definition",
            statement: "Primary outcome is mortality",
            category: "outcome",
        }));
    });

    it("creates memory_proposal artifact for preferences when runId provided", async () => {
        mockFindMany.mockResolvedValue(makeMessages(6) as any);

        await extractMemoriesFromConversation("conv-1", "proj-1", "run-1", "user-1");

        expect(mockCreateArtifact).toHaveBeenCalledWith(expect.objectContaining({
            type: "memory_proposal",
            title: "Preference: citation_style",
            payload: expect.objectContaining({
                memoryType: "user",
                key: "citation_style",
                value: "APA",
            }),
        }));
    });

    it("handles AI returning invalid JSON gracefully", async () => {
        mockFindMany.mockResolvedValue(makeMessages(6) as any);
        mockChat.mockResolvedValueOnce({ content: "not valid json {{{" });

        const result = await extractMemoriesFromConversation("conv-1", "proj-1");

        expect(result).toEqual({ decisions: [], preferences: [], facts: [] });
    });

    it("tags all created memories with conversation-extracted", async () => {
        mockFindMany.mockResolvedValue(makeMessages(6) as any);

        await extractMemoriesFromConversation("conv-1", "proj-1");

        for (const call of mockCreatePM.mock.calls) {
            expect(call[0].tags).toContain("conversation-extracted");
            expect(call[0].tags).toContain("conversation:conv-1");
        }
    });
});
