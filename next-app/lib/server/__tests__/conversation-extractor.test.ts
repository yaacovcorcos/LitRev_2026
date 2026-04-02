import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractMemoriesFromConversation } from "../memory/conversation-extractor";
import type { AIMessage } from "@/types/ai";

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        aIMessage: { findMany: vi.fn() },
        projectMemory: { findFirst: vi.fn() },
        artifact: { findFirst: vi.fn() },
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

type ConversationMessagesResult = Awaited<ReturnType<typeof prisma.aIMessage.findMany>>;
type ArtifactLookupResult = Awaited<ReturnType<typeof prisma.artifact.findFirst>>;

const mockFindMany = vi.mocked(prisma.aIMessage.findMany);
const mockMemoryFindFirst = vi.mocked(prisma.projectMemory.findFirst);
const mockArtifactFindFirst = vi.mocked(prisma.artifact.findFirst);
const mockCreatePM = vi.mocked(createProjectMemory);
const mockCreateArtifact = vi.mocked(createArtifact);

function makeMessages(count: number) {
    return Array.from({ length: count }, (_, i) => ({
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message ${i} with enough content to pass the threshold easily`,
    }));
}

function asConversationMessagesResult(rows: unknown): ConversationMessagesResult {
    return rows as ConversationMessagesResult;
}

function asArtifactLookupResult(row: unknown): ArtifactLookupResult {
    return row as ArtifactLookupResult;
}

beforeEach(() => {
    vi.clearAllMocks();
    // Default: no prior extraction exists (dedup guard passes)
    mockMemoryFindFirst.mockResolvedValue(null);
    mockArtifactFindFirst.mockResolvedValue(null);
});

describe("extractMemoriesFromConversation", () => {
    it("returns empty when conversation has < 5 substantive messages", async () => {
        mockFindMany.mockResolvedValue(asConversationMessagesResult(makeMessages(3)));

        const result = await extractMemoriesFromConversation("conv-1", "proj-1");

        expect(result).toEqual({ decisions: [], preferences: [], facts: [] });
        expect(getAIService).not.toHaveBeenCalled();
    });

    it("calls AI with grok-4-1-fast model", async () => {
        mockFindMany.mockResolvedValue(asConversationMessagesResult(makeMessages(6)));

        await extractMemoriesFromConversation("conv-1", "proj-1");

        expect(mockChat).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({ model: "grok-4-1-fast" }),
        );
    });

    it("creates ProjectMemory for each extracted decision", async () => {
        mockFindMany.mockResolvedValue(asConversationMessagesResult(makeMessages(6)));

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
        mockFindMany.mockResolvedValue(asConversationMessagesResult(makeMessages(6)));

        await extractMemoriesFromConversation("conv-1", "proj-1");

        expect(mockCreatePM).toHaveBeenCalledWith(expect.objectContaining({
            type: "definition",
            statement: "Primary outcome is mortality",
            category: "outcome",
        }));
    });

    it("creates memory_proposal artifact for preferences when runId provided", async () => {
        mockFindMany.mockResolvedValue(asConversationMessagesResult(makeMessages(6)));

        await extractMemoriesFromConversation("conv-1", "proj-1", "run-1", "user-1");

        expect(mockCreateArtifact).toHaveBeenCalledWith(expect.objectContaining({
            type: "memory_proposal",
            title: "Preference: citation_style",
            sourceEventId: "conversation-extractor:conv-1",
            payload: expect.objectContaining({
                memoryType: "user",
                key: "citation_style",
                value: "APA",
            }),
        }));
    });

    it("skips extraction when preference artifacts already exist for the conversation", async () => {
        mockMemoryFindFirst.mockResolvedValue(null);
        mockArtifactFindFirst.mockResolvedValue(asArtifactLookupResult({ id: "art-existing" }));
        mockFindMany.mockResolvedValue(asConversationMessagesResult(makeMessages(6)));

        const result = await extractMemoriesFromConversation("conv-1", "proj-1", "run-1", "user-1");

        expect(result).toEqual({ decisions: [], preferences: [], facts: [] });
        expect(mockChat).not.toHaveBeenCalled();
        expect(mockCreatePM).not.toHaveBeenCalled();
        expect(mockCreateArtifact).not.toHaveBeenCalled();
    });

    it("handles AI returning invalid JSON gracefully", async () => {
        mockFindMany.mockResolvedValue(asConversationMessagesResult(makeMessages(6)));
        mockChat.mockResolvedValueOnce({ content: "not valid json {{{" });

        const result = await extractMemoriesFromConversation("conv-1", "proj-1");

        expect(result).toEqual({ decisions: [], preferences: [], facts: [] });
    });

    it("tags all created memories with conversation-extracted", async () => {
        mockFindMany.mockResolvedValue(asConversationMessagesResult(makeMessages(6)));

        await extractMemoriesFromConversation("conv-1", "proj-1");

        for (const call of mockCreatePM.mock.calls) {
            expect(call[0].tags).toContain("conversation-extracted");
            expect(call[0].tags).toContain("conversation:conv-1");
        }
    });

    it("strips hidden scoping and mentioned-study metadata from assistant transcript before extraction", async () => {
        mockFindMany.mockResolvedValue(asConversationMessagesResult([
            {
                role: "assistant",
                content: `Landscape summary\n\n<!-- SCOPING_REPORT: {"topic":"x","searchesRun":[],"landscape":{"majorThemes":[],"evidenceGaps":[],"methodologicalPatterns":[],"evidenceDensity":"moderate"},"recommendedQuestions":[],"nextStep":"x"} -->\n<!-- MENTIONED_STUDIES: {"studies":[{"title":"Study","doi":"10.1000/x"}]} -->`,
            },
            ...makeMessages(5),
        ]));

        await extractMemoriesFromConversation("conv-1", "proj-1");

        const lastCall = mockChat.mock.calls.at(-1);
        expect(lastCall).toBeDefined();
        const payload = (lastCall?.[0] ?? []) as AIMessage[];
        const transcriptMessage = payload.find((m) => m.role === "user")?.content || "";
        expect(transcriptMessage.includes("SCOPING_REPORT")).toBe(false);
        expect(transcriptMessage.includes("MENTIONED_STUDIES")).toBe(false);
    });

    it("applies scoping policy: keeps explicit decisions but drops transient scoping summaries/facts", async () => {
        mockFindMany.mockResolvedValue(asConversationMessagesResult([
            { role: "assistant", content: `Scoping narrative\n<scoping_report>{"topic":"x","searchesRun":[],"landscape":{"majorThemes":[],"evidenceGaps":[],"methodologicalPatterns":[],"evidenceDensity":"moderate"},"recommendedQuestions":[],"nextStep":"x"}</scoping_report>` },
            ...makeMessages(5),
        ]));
        mockChat.mockResolvedValueOnce({
            content: JSON.stringify({
                decisions: [
                    { statement: "Literature landscape: major themes include telemedicine", category: "outcome" },
                    { statement: "User chose to focus on adults over 65", category: "population", rationale: "Explicitly selected in chat" },
                ],
                preferences: [],
                facts: [{ statement: "Evidence density is moderate", category: "outcome" }],
            }),
        });

        await extractMemoriesFromConversation("conv-1", "proj-1");

        expect(mockCreatePM).toHaveBeenCalledTimes(1);
        expect(mockCreatePM).toHaveBeenCalledWith(expect.objectContaining({
            statement: "User chose to focus on adults over 65",
            category: "population",
        }));
    });
});
