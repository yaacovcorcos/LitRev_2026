import { describe, expect, it, vi } from "vitest";
import type { AIMessage, AIModel, AIResponse, AIStreamChunk, ChatOptions } from "@/types/ai";
vi.mock("@/lib/server/ai/rate-limiter", () => ({
  validateRateLimits: vi.fn(async () => {}),
  recordUsage: vi.fn(async () => {}),
  reserveProviderUsageAttempt: vi.fn(async () => ({ id: "usage-reservation-1", reservedTokens: 1, status: "active" })),
  trySettleUsageReservation: vi.fn(async () => true),
  tryMarkUsageReservationReconcilable: vi.fn(async () => true),
}));
import { AIService } from "@/lib/server/ai/ai-service";
import { BaseAIProvider } from "@/lib/server/ai/providers/base";

class MockReasoningProvider extends BaseAIProvider {
  readonly id = "mock-reasoning";
  readonly name = "Mock Reasoning";
  readonly models: AIModel[] = [
    { id: "mock-model", name: "Mock", contextWindow: 8_192, capabilities: ["chat", "tools"] },
  ];
  public lastOptions: ChatOptions | undefined;

  async chat(): Promise<AIResponse> {
    return {
      id: "resp-1",
      content: "ok",
      model: "mock-model",
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
    };
  }

  async *streamChat(_messages: AIMessage[], options?: ChatOptions): AsyncIterable<AIStreamChunk> {
    this.lastOptions = options;
    yield {
      type: "done",
      usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
    };
  }

  isConfigured(): boolean {
    return true;
  }
}

function userMessage(content: string): AIMessage {
  return {
    id: "msg-1",
    role: "user",
    content,
    createdAt: new Date().toISOString(),
  };
}

describe("AIService reasoning policy", () => {
  it("keeps summary mode provider-independent", async () => {
    const service = new AIService();
    const provider = new MockReasoningProvider();
    service.registerProvider(provider);
    service.setActiveProvider(provider.id);

    for await (const chunk of service.streamChat([userMessage("hello")], { reasoningMode: "summary" })) {
      void chunk;
    }

    expect(provider.lastOptions?.includeReasoning).toBe(false);
    expect(provider.lastOptions?.reasoningMode).toBe("summary");
  });

  it("requests provider-native reasoning only in full mode", async () => {
    const service = new AIService();
    const provider = new MockReasoningProvider();
    service.registerProvider(provider);
    service.setActiveProvider(provider.id);

    for await (const chunk of service.streamChat([userMessage("hello")], { reasoningMode: "full" })) {
      void chunk;
    }

    expect(provider.lastOptions?.includeReasoning).toBe(true);
    expect(provider.lastOptions?.reasoningMode).toBe("full");
  });

  it("disables reasoning when reasoning mode is off", async () => {
    const service = new AIService();
    const provider = new MockReasoningProvider();
    service.registerProvider(provider);
    service.setActiveProvider(provider.id);

    for await (const chunk of service.streamChat([userMessage("hello")], { reasoningMode: "off" })) {
      void chunk;
    }

    expect(provider.lastOptions?.includeReasoning).toBe(false);
    expect(provider.lastOptions?.reasoningMode).toBe("off");
  });
});
