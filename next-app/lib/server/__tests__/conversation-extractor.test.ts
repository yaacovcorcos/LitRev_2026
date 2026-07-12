import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractMemoriesFromConversation } from "../memory/conversation-extractor";
import type { AIMessage } from "@/types/ai";

const { mockGetBackgroundModel } = vi.hoisted(() => ({
    mockGetBackgroundModel: vi.fn(() => "gpt-5.6-luna"),
}));

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

vi.mock("@/lib/server/ai/background-model-policy", () => ({
    getBackgroundModel: mockGetBackgroundModel,
}));

vi.mock("@/lib/server/agent/artifacts", () => ({
    createArtifact: vi.fn().mockResolvedValue({ id: "art-new" }),
}));

const { prisma } = await import("@/lib/server/prisma");
const { createArtifact } = await import("@/lib/server/agent/artifacts");
const { getAIService } = await import("@/lib/server/ai");

type ConversationMessagesResult = Awaited<ReturnType<typeof prisma.aIMessage.findMany>>;
type ArtifactLookupResult = Awaited<ReturnType<typeof prisma.artifact.findFirst>>;

const mockFindMany = vi.mocked(prisma.aIMessage.findMany);
const mockMemoryFindFirst = vi.mocked(prisma.projectMemory.findFirst);
const mockArtifactFindFirst = vi.mocked(prisma.artifact.findFirst);
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

    it("uses the background model selected for analysis work", async () => {
        mockFindMany.mockResolvedValue(asConversationMessagesResult(makeMessages(6)));

        await extractMemoriesFromConversation("conv-1", "proj-1", "run-1", "user-1");

        expect(mockGetBackgroundModel).toHaveBeenCalledWith("analysis");
        expect(mockChat).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({ model: "gpt-5.6-luna" }),
        );
    });

    it("does not persist inferred decisions or facts without a reviewable run", async () => {
        mockFindMany.mockResolvedValue(asConversationMessagesResult(makeMessages(6)));

        const result = await extractMemoriesFromConversation("conv-1", "proj-1");

        expect(result.decisions).toHaveLength(1);
        expect(result.facts).toHaveLength(1);
        expect(mockCreateArtifact).not.toHaveBeenCalled();
    });

    it("creates reviewable project-memory proposals for extracted decisions and facts", async () => {
        mockFindMany.mockResolvedValue(asConversationMessagesResult(makeMessages(6)));

        await extractMemoriesFromConversation("conv-1", "proj-1", "run-1", "user-1");

        expect(mockCreateArtifact).toHaveBeenCalledWith(expect.objectContaining({
            type: "memory_proposal",
            title: "Memory proposal: conversation decision",
            sourceEventId: expect.stringMatching(/^conversation-extractor:conv-1:decision:/),
            payload: expect.objectContaining({
                memoryType: "project",
                value: "Exclude case studies",
                rationale: "Low evidence",
                projectMemoryType: "decision",
                projectMemoryCategory: "exclusion",
                confidence: 0.65,
            }),
        }));
        expect(mockCreateArtifact).toHaveBeenCalledWith(expect.objectContaining({
            type: "memory_proposal",
            title: "Memory proposal: conversation fact",
            sourceEventId: expect.stringMatching(/^conversation-extractor:conv-1:fact:/),
            payload: expect.objectContaining({
                memoryType: "project",
                value: "Primary outcome is mortality",
                projectMemoryType: "definition",
                projectMemoryCategory: "outcome",
                confidence: 0.55,
            }),
        }));
    });

    it("creates memory_proposal artifact for preferences when runId provided", async () => {
        mockFindMany.mockResolvedValue(asConversationMessagesResult(makeMessages(6)));

        await extractMemoriesFromConversation("conv-1", "proj-1", "run-1", "user-1");

        expect(mockCreateArtifact).toHaveBeenCalledWith(expect.objectContaining({
            type: "memory_proposal",
            title: "Preference: citation_style",
            sourceEventId: expect.stringMatching(/^conversation-extractor:conv-1:preference:citation_style:/),
            payload: expect.objectContaining({
                memoryType: "user",
                key: "citation_style",
                value: "APA",
            }),
        }));
    });

    it("skips extraction when proposal artifacts already exist for the conversation", async () => {
        mockMemoryFindFirst.mockResolvedValue(null);
        mockArtifactFindFirst.mockResolvedValue(asArtifactLookupResult({ id: "art-existing" }));
        mockFindMany.mockResolvedValue(asConversationMessagesResult(makeMessages(6)));

        const result = await extractMemoriesFromConversation("conv-1", "proj-1", "run-1", "user-1");

        expect(result).toEqual({ decisions: [], preferences: [], facts: [] });
        expect(mockChat).not.toHaveBeenCalled();
        expect(mockCreateArtifact).not.toHaveBeenCalled();
    });

    it("handles AI returning invalid JSON gracefully", async () => {
        mockFindMany.mockResolvedValue(asConversationMessagesResult(makeMessages(6)));
        mockChat.mockResolvedValueOnce({ content: "not valid json {{{" });

        const result = await extractMemoriesFromConversation("conv-1", "proj-1");

        expect(result).toEqual({ decisions: [], preferences: [], facts: [] });
    });

    it("aborts a late provider result before any proposal can be written", async () => {
        mockFindMany.mockResolvedValue(asConversationMessagesResult(makeMessages(6)));
        const controller = new AbortController();
        let resolveProvider!: (value: { content: string }) => void;
        mockChat.mockImplementationOnce(() => new Promise((resolve) => {
            resolveProvider = resolve;
        }));

        const extraction = extractMemoriesFromConversation(
            "conv-1",
            "proj-1",
            "run-1",
            "user-1",
            { signal: controller.signal },
        );
        await vi.waitFor(() => expect(mockChat).toHaveBeenCalledTimes(1));

        controller.abort();
        await expect(extraction).rejects.toMatchObject({ name: "AbortError" });

        resolveProvider({
            content: JSON.stringify({
                decisions: [{ statement: "Late decision", category: "outcome" }],
                preferences: [],
                facts: [],
            }),
        });
        await Promise.resolve();
        await Promise.resolve();

        expect(mockCreateArtifact).not.toHaveBeenCalled();
    });

    it("marks all conversation-extraction proposals with the same idempotency marker", async () => {
        mockFindMany.mockResolvedValue(asConversationMessagesResult(makeMessages(6)));

        await extractMemoriesFromConversation("conv-1", "proj-1", "run-1", "user-1");

        expect(mockCreateArtifact).toHaveBeenCalled();
        for (const call of mockCreateArtifact.mock.calls) {
            expect(call[0].sourceEventId).toMatch(/^conversation-extractor:conv-1:/);
            expect(call[0].applyId).toBe(call[0].sourceEventId);
        }
    });

    it("skips only the already-created proposal when retrying a partial extraction", async () => {
        mockFindMany.mockResolvedValue(asConversationMessagesResult(makeMessages(6)));
        mockArtifactFindFirst
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce(asArtifactLookupResult({ id: "existing-decision-proposal" }))
            .mockResolvedValue(null);

        await extractMemoriesFromConversation("conv-1", "proj-1", "run-1", "user-1");

        const titles = mockCreateArtifact.mock.calls.map((call) => call[0].title);
        expect(titles).not.toContain("Memory proposal: conversation decision");
        expect(titles).toContain("Memory proposal: conversation fact");
        expect(titles).toContain("Preference: citation_style");
    });

    it("strips hidden scoping and mentioned-study metadata from assistant transcript before extraction", async () => {
        mockFindMany.mockResolvedValue(asConversationMessagesResult([
            {
                role: "assistant",
                content: `Landscape summary\n\n<!-- SCOPING_REPORT: {"topic":"x","searchesRun":[],"landscape":{"majorThemes":[],"evidenceGaps":[],"methodologicalPatterns":[],"evidenceDensity":"moderate"},"recommendedQuestions":[],"nextStep":"x"} -->\n<!-- MENTIONED_STUDIES: {"studies":[{"title":"Study","doi":"10.1000/x"}]} -->`,
            },
            ...makeMessages(5),
        ]));

        await extractMemoriesFromConversation("conv-1", "proj-1", "run-1", "user-1");

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

        await extractMemoriesFromConversation("conv-1", "proj-1", "run-1", "user-1");

        expect(mockCreateArtifact).toHaveBeenCalledTimes(1);
        expect(mockCreateArtifact).toHaveBeenCalledWith(expect.objectContaining({
            type: "memory_proposal",
            payload: expect.objectContaining({
                value: "User chose to focus on adults over 65",
                projectMemoryCategory: "population",
            }),
        }));
    });
});
