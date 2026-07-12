import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    findFirst: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        agentRun: { findFirst: mocks.findFirst },
    },
}));

const { pinContinuationRoutingOptions } = await import("@/lib/server/ai/continuation-routing");

describe("continuation routing", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv("OPENAI_API_KEY", "openai-key");
        vi.stubEnv("AI_MODEL_GATEWAY_ENABLED", "1");
        vi.stubEnv("AI_MODEL_GATEWAY_API_KEY", "gateway-key");
        vi.stubEnv("AI_MODEL_GATEWAY_BASE_URL", "");
        mocks.findFirst.mockResolvedValue(null);
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("pins strict continuations to the source run's requested route", async () => {
        mocks.findFirst.mockResolvedValue({
            model: "gpt-5.6-terra",
            reasoningEffort: "high",
            deliveryMode: "priority",
        });

        await expect(pinContinuationRoutingOptions({
            model: "deepseek-v4-flash",
            reasoningEffort: "fast",
            deliveryMode: "standard",
            continueFromRunId: "run-source",
        }, "conv-1")).resolves.toMatchObject({
            model: "gpt-5.6-terra",
            reasoningEffort: "high",
            deliveryMode: "priority",
        });
        expect(mocks.findFirst).toHaveBeenCalledWith({
            where: { id: "run-source", conversationId: "conv-1" },
            select: { model: true, reasoningEffort: true, deliveryMode: true },
        });
    });

    it("pins structured clarification resumes even without an explicit continuation field", async () => {
        mocks.findFirst.mockResolvedValue({
            model: "qwen3.7-plus",
            reasoningEffort: "max",
            deliveryMode: "standard",
        });

        await expect(pinContinuationRoutingOptions({
            model: "gpt-5.6-luna",
            userInputResolution: {
                sourceRunId: "run-paused",
                callId: "call-1",
                questionId: "question-1",
                resolution: "answered",
                answerText: "Proceed",
                answeredAt: "2026-07-12T12:00:00.000Z",
            },
        }, "conv-1")).resolves.toMatchObject({
            model: "qwen3.7-plus",
            reasoningEffort: "max",
            deliveryMode: "standard",
        });
    });

    it("falls back cleanly when a best-effort continuation source is unavailable", async () => {
        const options = {
            model: "gpt-5.6-luna",
            reasoningEffort: "low" as const,
            preferContinueFromRunId: "run-missing",
        };

        await expect(pinContinuationRoutingOptions(options, "conv-1")).resolves.toBe(options);
    });

    it("fails closed when a missing best-effort source leaves a non-selectable client route", async () => {
        await expect(pinContinuationRoutingOptions({
            model: "claude-haiku-4-5",
            preferContinueFromRunId: "run-missing",
        }, "conv-1")).rejects.toMatchObject({
            errorMeta: expect.objectContaining({
                code: "UNKNOWN_OR_UNSELECTABLE_MODEL",
            }),
        });
    });

    it("rejects a strict source that is not authorized for the conversation", async () => {
        await expect(pinContinuationRoutingOptions({
            model: "gpt-5.6-luna",
            continueFromRunId: "run-other-conversation",
        }, "conv-1")).rejects.toMatchObject({
            errorMeta: expect.objectContaining({
                code: "RUN_CONTINUATION_UNAVAILABLE",
            }),
        });
    });
});
