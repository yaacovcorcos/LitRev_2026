import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    chat: vi.fn(),
}));

vi.mock("@/lib/server/ai/ai-service", () => ({
    getAIService: () => ({ chat: mocks.chat }),
}));

vi.mock("@/lib/server/pdf-extraction-config", () => ({
    getPdfExtractionModelConfig: () => ({
        quickExtractModel: "quick-model",
        deepAnalysisModel: "deep-model",
    }),
}));

const {
    deepAnalyzeWithAI,
    quickExtractWithAI,
} = await import("@/lib/server/pdf-extraction");

describe("PDF extraction provider deadlines", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("ends quick extraction at 30 seconds even when the provider ignores abort", async () => {
        let providerSignal: AbortSignal | undefined;
        mocks.chat.mockImplementationOnce(async (_messages, options) => {
            providerSignal = options.signal;
            return new Promise(() => {});
        });

        const extraction = quickExtractWithAI("paper text", {}, "project-1");
        const rejection = expect(extraction).rejects.toMatchObject({
            name: "ExtractionError",
            code: "AI_FAILED",
            message: "AI extraction timed out",
        });

        await vi.advanceTimersByTimeAsync(30_000);

        await rejection;
        expect(providerSignal).toBeDefined();
        expect(providerSignal?.aborted).toBe(true);
    });

    it("ends deep analysis at 30 seconds even when the provider ignores abort", async () => {
        let providerSignal: AbortSignal | undefined;
        mocks.chat.mockImplementationOnce(async (_messages, options) => {
            providerSignal = options.signal;
            return new Promise(() => {});
        });

        const analysis = deepAnalyzeWithAI(
            "paper text",
            { title: "Study", authors: "Researcher" },
            "project-1",
        );

        await vi.advanceTimersByTimeAsync(30_000);

        await expect(analysis).resolves.toEqual({
            success: false,
            details: {},
            error: "Deep analysis timed out",
            errorCode: "AI_FAILED",
        });
        expect(providerSignal).toBeDefined();
        expect(providerSignal?.aborted).toBe(true);
    });

    it("links caller cancellation into the provider signal", async () => {
        const caller = new AbortController();
        let providerSignal: AbortSignal | undefined;
        mocks.chat.mockImplementationOnce(async (_messages, options) => {
            providerSignal = options.signal;
            return new Promise(() => {});
        });

        const extraction = quickExtractWithAI(
            "paper text",
            {},
            "project-1",
            { signal: caller.signal },
        );
        const rejection = expect(extraction).rejects.toMatchObject({ name: "AbortError" });

        caller.abort();

        await rejection;
        expect(providerSignal).toBeDefined();
        expect(providerSignal?.aborted).toBe(true);
        expect(vi.getTimerCount()).toBe(0);
    });

    it("does not start provider work for a pre-cancelled extraction", async () => {
        const caller = new AbortController();
        caller.abort();

        await expect(quickExtractWithAI(
            "paper text",
            {},
            "project-1",
            { signal: caller.signal },
        )).rejects.toMatchObject({ name: "AbortError" });

        expect(mocks.chat).not.toHaveBeenCalled();
        expect(vi.getTimerCount()).toBe(0);
    });
});
