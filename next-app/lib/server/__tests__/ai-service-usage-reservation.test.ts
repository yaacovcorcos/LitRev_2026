import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIMessage, AIModel, AIResponse, AIStreamChunk } from "@/types/ai";
import { AIErrorWithEnvelope } from "@/lib/ai/error-envelope";

const mocks = vi.hoisted(() => ({
    after: vi.fn(),
    reserveProviderUsageAttempt: vi.fn(),
    trySettleUsageReservation: vi.fn(),
    tryMarkUsageReservationReconcilable: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));

vi.mock("@/lib/server/ai/rate-limiter", () => ({
    reserveProviderUsageAttempt: mocks.reserveProviderUsageAttempt,
    trySettleUsageReservation: mocks.trySettleUsageReservation,
    tryMarkUsageReservationReconcilable:
        mocks.tryMarkUsageReservationReconcilable,
}));

vi.mock("@/lib/ai/config", () => ({
    // defaultMaxTokens is intentionally absent to prove estimation remains finite
    // in tests and partial configuration mocks.
    AI_CONFIG: {
        defaultProvider: "mock",
        defaultModel: "mock-model",
    },
    AVAILABLE_MODELS: {
        openai: [],
        anthropic: [],
        xai: [],
        google: [],
        gateway: [],
    },
    getModelCapabilityRecord: vi.fn((modelId: string) => modelId === "mock-model" ? ({
        id: "mock-model",
        providerModelId: "mock-model",
        provider: "openai",
        providerDialect: "openai",
        contextWindow: 8_192,
        maxOutputTokens: 2_048,
        capabilities: ["chat"],
        reasoningSupport: "explicit",
        reasoningVisibilitySupport: "none",
        reasoningEfforts: ["fast", "low", "medium", "high", "max"],
        defaultReasoningEffort: "medium",
        temperatureSupport: "full",
        deliveryModes: ["standard"],
        selectable: true,
    }) : undefined),
    getProviderModelId: vi.fn((modelId: string) => modelId),
    getDefaultReasoningEffort: vi.fn(() => "medium"),
    getProviderForModel: vi.fn((modelId: string) => modelId === "mock-model" ? "usage-provider" : undefined),
    getContextBudget: vi.fn(() => 8_192),
}));

vi.mock("@/lib/server/utils/retry", () => ({
    parseRetryAfterHeaderMs: vi.fn(() => undefined),
    sleep: vi.fn(async () => {}),
    retryAsync: vi.fn(async <T>(
        operation: () => Promise<T>,
        options?: {
            attempts?: number;
            shouldRetry?: (error: unknown, attempt: number) => boolean;
        },
    ) => {
        const attempts = options?.attempts ?? 1;
        let lastError: unknown;
        for (let attempt = 1; attempt <= attempts; attempt += 1) {
            try {
                return await operation();
            } catch (error) {
                lastError = error;
                if (attempt >= attempts || !options?.shouldRetry?.(error, attempt)) {
                    throw error;
                }
            }
        }
        throw lastError;
    }),
}));

const { AIService } = await import("@/lib/server/ai/ai-service");
const { BaseAIProvider } = await import("@/lib/server/ai/providers/base");

class UsageProvider extends BaseAIProvider {
    readonly id = "usage-provider";
    readonly name = "Usage Provider";
    readonly models: AIModel[] = [{
        id: "mock-model",
        name: "Mock",
        contextWindow: 8_192,
        capabilities: ["chat"],
    }];
    chatCalls = 0;
    streamCalls = 0;
    failChatAttempts = 0;

    async chat(): Promise<AIResponse> {
        this.chatCalls += 1;
        if (this.chatCalls <= this.failChatAttempts) {
            throw Object.assign(new Error("temporary upstream failure"), {
                status: 503,
                code: "UPSTREAM_503",
            });
        }
        return {
            id: `response-${this.chatCalls}`,
            content: "ok",
            model: "mock-model",
            usage: {
                inputTokens: 20,
                outputTokens: 5,
                totalTokens: 25,
            },
        };
    }

    async *streamChat(): AsyncIterable<AIStreamChunk> {
        this.streamCalls += 1;
        yield { type: "content", content: "ok" };
        yield {
            type: "done",
            actualModel: "mock-model",
            usage: {
                inputTokens: 20,
                outputTokens: 5,
                totalTokens: 25,
            },
        };
    }

    isConfigured(): boolean {
        return true;
    }
}

const messages: AIMessage[] = [{
    id: "message-1",
    role: "user",
    content: "hello",
    createdAt: "2026-07-12T08:00:00.000Z",
}];

async function collect(stream: AsyncIterable<AIStreamChunk>): Promise<AIStreamChunk[]> {
    const chunks: AIStreamChunk[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
}

function serviceWithProvider() {
    const service = new AIService();
    const provider = new UsageProvider();
    service.registerProvider(provider);
    service.setActiveProvider(provider.id);
    return { service, provider };
}

describe("AIService durable provider-attempt accounting", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.reserveProviderUsageAttempt.mockImplementation(async () => ({
            id: "reservation-default",
            reservedTokens: 2_048,
            status: "active",
        }));
        mocks.trySettleUsageReservation.mockResolvedValue(true);
        mocks.tryMarkUsageReservationReconcilable.mockResolvedValue(true);
    });

    it("never calls the provider when durable admission times out", async () => {
        mocks.reserveProviderUsageAttempt.mockRejectedValue(new AIErrorWithEnvelope({
            kind: "runtime",
            code: "AI_USAGE_ADMISSION_TIMEOUT",
            retryable: true,
            source: "usage_reservation",
            status: 503,
            message: "Usage admission timed out before the provider was called.",
        }));
        const { service, provider } = serviceWithProvider();

        await expect(service.chat(messages)).rejects.toMatchObject({
            errorCode: "AI_USAGE_ADMISSION_TIMEOUT",
        });
        expect(mocks.reserveProviderUsageAttempt).toHaveBeenCalledTimes(3);
        const attemptKeys = mocks.reserveProviderUsageAttempt.mock.calls.map(
            ([input]) => input.attemptKey,
        );
        expect(new Set(attemptKeys)).toHaveProperty("size", 1);
        expect(provider.chatCalls).toBe(0);
    });

    it("returns a known local quota denial without in-request retries or provider delay", async () => {
        mocks.reserveProviderUsageAttempt.mockRejectedValue(new AIErrorWithEnvelope({
            kind: "provider_request",
            code: "AI_RATE_LIMIT_EXCEEDED",
            retryable: true,
            source: "usage_reservation",
            status: 429,
            headers: { "retry-after": "60" },
            message: "Local provider-attempt cap reached.",
        }));
        const { service, provider } = serviceWithProvider();

        await expect(service.chat(messages)).rejects.toMatchObject({
            errorCode: "AI_RATE_LIMIT_EXCEEDED",
        });

        expect(mocks.reserveProviderUsageAttempt).toHaveBeenCalledTimes(1);
        expect(provider.chatCalls).toBe(0);
    });

    it("creates and accounts a distinct reservation for every retried provider attempt", async () => {
        const { service, provider } = serviceWithProvider();
        provider.failChatAttempts = 1;
        mocks.reserveProviderUsageAttempt
            .mockResolvedValueOnce({ id: "reservation-1", reservedTokens: 2_048, status: "active" })
            .mockResolvedValueOnce({ id: "reservation-2", reservedTokens: 2_048, status: "active" });

        await expect(service.chat(messages)).resolves.toMatchObject({ content: "ok" });

        expect(provider.chatCalls).toBe(2);
        expect(mocks.reserveProviderUsageAttempt).toHaveBeenCalledTimes(2);
        const attemptKeys = mocks.reserveProviderUsageAttempt.mock.calls.map(
            ([input]) => input.attemptKey,
        );
        expect(new Set(attemptKeys)).toHaveProperty("size", 2);
        expect(mocks.tryMarkUsageReservationReconcilable).toHaveBeenCalledWith(
            "reservation-1",
            "failed",
            "UPSTREAM_503",
        );
        expect(mocks.trySettleUsageReservation).toHaveBeenCalledWith(expect.objectContaining({
            reservationId: "reservation-2",
            model: "mock-model",
            provider: "usage-provider",
            requestedModel: "mock-model",
            requestedProvider: "usage-provider",
            inputTokens: 20,
            outputTokens: 5,
            cachedInputTokens: undefined,
        }));
    });

    it("returns a successful chat response when settlement rejects and does not retry the provider", async () => {
        const { service, provider } = serviceWithProvider();
        mocks.trySettleUsageReservation.mockRejectedValueOnce(
            new Error("settlement rejected"),
        );

        await expect(service.chat(messages)).resolves.toMatchObject({ content: "ok" });

        expect(provider.chatCalls).toBe(1);
        expect(mocks.after).toHaveBeenCalledTimes(1);
    });

    it("preserves the streamed done chunk when bounded settlement defers", async () => {
        const { service, provider } = serviceWithProvider();
        mocks.trySettleUsageReservation.mockResolvedValueOnce(false);

        const chunks = await collect(service.streamChat(messages));

        expect(provider.streamCalls).toBe(1);
        expect(chunks.at(-1)).toMatchObject({
            type: "done",
            usage: { inputTokens: 20, outputTokens: 5 },
        });
        expect(mocks.after).toHaveBeenCalledTimes(1);
    });

    it("gives concurrent streams distinct reservations even when they share one options object", async () => {
        const { service, provider } = serviceWithProvider();
        const options = { model: "mock-model" };
        mocks.reserveProviderUsageAttempt
            .mockResolvedValueOnce({ id: "reservation-1", reservedTokens: 2_048, status: "active" })
            .mockResolvedValueOnce({ id: "reservation-2", reservedTokens: 2_048, status: "active" });

        const [firstChunks, secondChunks] = await Promise.all([
            collect(service.streamChat(messages, options)),
            collect(service.streamChat(messages, options)),
        ]);

        const attemptKeys = mocks.reserveProviderUsageAttempt.mock.calls.map(
            ([input]) => input.attemptKey,
        );
        expect(new Set(attemptKeys)).toHaveProperty("size", 2);
        expect(firstChunks).toHaveLength(2);
        expect(secondChunks).toHaveLength(2);
        expect(provider.streamCalls).toBe(2);
        expect(mocks.trySettleUsageReservation).toHaveBeenCalledTimes(2);
        expect(mocks.trySettleUsageReservation).toHaveBeenCalledWith(
            expect.objectContaining({ reservationId: "reservation-1" }),
        );
        expect(mocks.trySettleUsageReservation).toHaveBeenCalledWith(
            expect.objectContaining({ reservationId: "reservation-2" }),
        );
    });

    it("queues a bounded retry when provider-failure reconciliation returns false", async () => {
        const { service, provider } = serviceWithProvider();
        provider.failChatAttempts = 1;
        mocks.tryMarkUsageReservationReconcilable.mockResolvedValueOnce(false);

        await expect(service.chat(messages)).resolves.toMatchObject({ content: "ok" });

        expect(mocks.after).toHaveBeenCalledTimes(1);
        expect(provider.chatCalls).toBe(2);
    });

    it("passes a finite conservative estimate even without a configured default output limit", async () => {
        const { service } = serviceWithProvider();

        await service.chat(messages);

        expect(mocks.reserveProviderUsageAttempt).toHaveBeenCalledWith(
            expect.objectContaining({
                attemptKey: expect.any(String),
                estimatedTokens: expect.any(Number),
            }),
        );
        const estimate = mocks.reserveProviderUsageAttempt.mock.calls[0][0].estimatedTokens;
        expect(Number.isFinite(estimate)).toBe(true);
        expect(estimate).toBeGreaterThanOrEqual(2_048);
    });
});
