import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AIMessage, AIModel, AIResponse, AIStreamChunk, ChatOptions } from "@/types/ai";
const mocks = vi.hoisted(() => ({
  validateRateLimits: vi.fn(async () => {}),
  recordUsage: vi.fn(async () => {}),
}));
vi.mock("@/lib/server/ai/rate-limiter", () => ({
  validateRateLimits: mocks.validateRateLimits,
  recordUsage: mocks.recordUsage,
}));
import { AIService } from "@/lib/server/ai/ai-service";
import { BaseAIProvider } from "@/lib/server/ai/providers/base";

class MockReasoningProvider extends BaseAIProvider {
  readonly id = "openai";
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
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it("persists usage when a consumer closes immediately after the provider done chunk", async () => {
    const service = new AIService();
    const provider = new MockReasoningProvider();
    service.registerProvider(provider);
    service.setActiveProvider(provider.id);
    const iterator = service.streamChat([userMessage("hello")], {
      model: "gpt-5.6-luna",
      conversationId: "conv-1",
    })[Symbol.asyncIterator]();

    const first = await iterator.next();
    expect(first.value?.type).toBe("done");
    await iterator.return?.(undefined);

    expect(mocks.recordUsage).toHaveBeenCalledTimes(1);
    expect(mocks.recordUsage).toHaveBeenCalledWith(
      null,
      "gpt-5.6-luna",
      2,
      3,
      expect.objectContaining({
        conversationId: "conv-1",
        requestedModel: "gpt-5.6-luna",
        requestedDeliveryMode: "standard",
        actualDeliveryMode: undefined,
      }),
    );
  });
});
