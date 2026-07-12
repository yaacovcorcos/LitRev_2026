import { describe, expect, it, vi } from "vitest";
import type { AIMessage, AIModel, AIResponse, AIStreamChunk } from "@/types/ai";

vi.mock("@/lib/server/ai/rate-limiter", () => ({
    validateRateLimits: vi.fn(async () => {}),
    recordUsage: vi.fn(async () => {}),
    reserveProviderUsageAttempt: vi.fn(async () => ({ id: "usage-reservation-1", reservedTokens: 1, status: "active" })),
    trySettleUsageReservation: vi.fn(async () => true),
    tryMarkUsageReservationReconcilable: vi.fn(async () => true),
}));

import { AIService } from "@/lib/server/ai/ai-service";
import { BaseAIProvider } from "@/lib/server/ai/providers/base";

class OversizedBatchProvider extends BaseAIProvider {
    readonly id = "oversized-batch";
    readonly name = "Oversized Batch";
    readonly models: AIModel[] = [
        { id: "oversized-model", name: "Oversized", contextWindow: 8_192, capabilities: ["chat", "tools"] },
    ];

    async chat(): Promise<AIResponse> {
        throw new Error("not used");
    }

    async *streamChat(): AsyncIterable<AIStreamChunk> {
        for (let index = 0; index < 26; index += 1) {
            yield {
                type: "tool_call",
                toolCall: {
                    id: `tc-${index}`,
                    name: "capacity_test_tool",
                    arguments: { index },
                },
            };
        }
        yield { type: "done" };
    }

    isConfigured(): boolean {
        return true;
    }
}

describe("AIService tool-call capacity", () => {
    it("does not emit or execute an oversized first batch", async () => {
        const service = new AIService();
        const provider = new OversizedBatchProvider();
        service.registerProvider(provider);
        service.setActiveProvider(provider.id);
        const executeTool = vi.spyOn(service, "executeToolWithMiddleware");
        const messages: AIMessage[] = [{
            id: "user-1",
            role: "user",
            content: "Run the tools",
            createdAt: "2026-07-12T10:00:00.000Z",
        }];
        const chunks: AIStreamChunk[] = [];

        for await (const chunk of service.streamChatWithTools(messages, {
            userId: "user-1",
            tools: [{
                name: "capacity_test_tool",
                description: "Capacity test",
                parameters: { type: "object", properties: {} },
            }],
        })) {
            chunks.push(chunk);
        }

        expect(executeTool).not.toHaveBeenCalled();
        expect(chunks.some((chunk) => chunk.type === "tool_call")).toBe(false);
        expect(chunks.at(-1)).toMatchObject({
            type: "done",
            stopReason: "max_tool_calls",
        });
    });
});
