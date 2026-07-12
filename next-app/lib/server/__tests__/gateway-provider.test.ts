import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AIMessage, AIStreamChunk, ToolDefinition } from "@/types/ai";
import { normalizeStreamChunk } from "@/lib/server/chat-runtime/events";
import { GatewayProvider } from "@/lib/server/ai/providers/gateway";

function userMessage(content: string): AIMessage {
    return { id: "user-1", role: "user", content, createdAt: new Date().toISOString() };
}

function makeStream(chunks: unknown[]): AsyncIterable<unknown> {
    return {
        async *[Symbol.asyncIterator]() {
            for (const chunk of chunks) yield chunk;
        },
    };
}

async function collectChunks(stream: AsyncIterable<AIStreamChunk>): Promise<AIStreamChunk[]> {
    const chunks: AIStreamChunk[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
}

const tools: ToolDefinition[] = [{
    name: "search_pubmed",
    description: "Search PubMed",
    parameters: { type: "object", properties: { query: { type: "string" } } },
}];

function attachClient(provider: GatewayProvider, create: ReturnType<typeof vi.fn>): void {
    (provider as unknown as { client: unknown }).client = { chat: { completions: { create } } };
}

afterEach(() => {
    vi.unstubAllEnvs();
});

beforeEach(() => {
    vi.stubEnv("AI_MODEL_GATEWAY_ENABLED", "1");
});

describe("GatewayProvider", () => {
    it("rebuilds the client when a short-lived Vercel OIDC credential rotates", () => {
        vi.stubEnv("AI_MODEL_GATEWAY_API_KEY", "");
        vi.stubEnv("AI_GATEWAY_API_KEY", "");
        vi.stubEnv("AI_MODEL_GATEWAY_BASE_URL", "");
        vi.stubEnv("VERCEL_OIDC_TOKEN", "oidc-token-1");
        const provider = new GatewayProvider();
        const getClient = (provider as unknown as {
            getClient(modelId: string): unknown;
        }).getClient.bind(provider);

        const firstClient = getClient("deepseek-v4-pro");
        vi.stubEnv("VERCEL_OIDC_TOKEN", "oidc-token-2");
        const secondClient = getClient("deepseek-v4-pro");

        expect(secondClient).not.toBe(firstClient);
    });

    it("uses verified Vercel slugs and normalized DeepSeek effort by default", async () => {
        vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
        vi.stubEnv("AI_MODEL_GATEWAY_BASE_URL", "");
        const create = vi.fn().mockResolvedValue({
            id: "resp-1",
            model: "deepseek/deepseek-v4-pro",
            choices: [{ message: { content: "ok", tool_calls: [] } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
        const provider = new GatewayProvider();
        attachClient(provider, create);

        const response = await provider.chat([userMessage("hello")], {
            model: "deepseek-v4-pro",
            reasoningEffort: "max",
            includeReasoning: false,
        });

        expect(create.mock.calls[0][0]).toMatchObject({
            model: "deepseek/deepseek-v4-pro",
            max_tokens: 65_536,
            providerOptions: { gateway: { order: ["deepseek"], only: ["deepseek"] } },
            reasoning: { enabled: true, effort: "xhigh", exclude: true },
        });
        expect(create.mock.calls[0][0]).not.toHaveProperty("thinking");
        expect(create.mock.calls[0][0]).not.toHaveProperty("temperature");
        expect(response.actualProvider).toBeUndefined();
    });

    it("restricts Vercel failover to the explicitly approved provider list", async () => {
        vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
        vi.stubEnv("AI_MODEL_GATEWAY_BASE_URL", "");
        vi.stubEnv("AI_GATEWAY_DEEPSEEK_PROVIDERS", "deepseek,fireworks");
        const create = vi.fn().mockResolvedValue({
            id: "resp-approved-fallbacks",
            model: "deepseek/deepseek-v4-pro",
            choices: [{ message: { content: "ok", tool_calls: [] } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
        const provider = new GatewayProvider();
        attachClient(provider, create);

        await provider.chat([userMessage("hello")], { model: "deepseek-v4-pro" });

        expect(create.mock.calls[0][0].providerOptions).toEqual({
            gateway: {
                order: ["deepseek", "fireworks"],
                only: ["deepseek", "fireworks"],
            },
        });
    });

    it("maps Qwen thinking to a bounded budget and sends images to the latest user turn", async () => {
        vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
        const create = vi.fn().mockResolvedValue({
            id: "resp-qwen",
            model: "alibaba/qwen3.7-plus",
            choices: [{ message: { content: "ok", tool_calls: [] } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
        const provider = new GatewayProvider();
        attachClient(provider, create);

        await provider.chat([userMessage("inspect")], {
            model: "qwen3.7-plus",
            reasoningEffort: "high",
            imageInputs: [{
                fileAssetId: "asset-1",
                filename: "chart.webp",
                mimeType: "image/webp",
                dataUrl: "data:image/webp;base64,AAAA",
            }],
        });

        const request = create.mock.calls[0][0];
        expect(request).toMatchObject({
            model: "alibaba/qwen3.7-plus",
            max_tokens: 32_768,
            providerOptions: { gateway: { order: ["alibaba"], only: ["alibaba"] } },
            reasoning: { enabled: true, max_tokens: 16_384, exclude: true },
        });
        expect(request.messages[0].content).toEqual([
            { type: "text", text: "inspect" },
            {
                type: "image_url",
                image_url: { url: "data:image/webp;base64,AAAA", detail: "auto" },
            },
        ]);
    });

    it("records the provider selected by the gateway for non-streaming responses", async () => {
        vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
        const create = vi.fn().mockResolvedValue({
            id: "resp-routed",
            model: "deepseek/deepseek-v4-pro",
            provider: "DeepSeek",
            choices: [{ message: { content: "ok", tool_calls: [] } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
        const provider = new GatewayProvider();
        attachClient(provider, create);

        const response = await provider.chat([userMessage("hello")], {
            model: "deepseek-v4-pro",
        });

        expect(response.actualProvider).toBe("DeepSeek");
    });

    it("records provider metadata emitted on streamed choice deltas", async () => {
        vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
        const create = vi.fn().mockResolvedValue(makeStream([{
            model: "deepseek/deepseek-v4-pro",
            choices: [{
                delta: {
                    content: "ok",
                    provider_metadata: { gateway: { routing: { provider: "DeepSeek" } } },
                },
                finish_reason: "stop",
            }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }]));
        const provider = new GatewayProvider();
        attachClient(provider, create);

        const chunks = await collectChunks(provider.streamChat([userMessage("hello")], {
            model: "deepseek-v4-pro",
        }));

        expect(chunks.find((chunk) => chunk.type === "done")?.actualProvider).toBe("DeepSeek");
    });

    it("preserves Vercel reasoning details privately across a tool continuation", async () => {
        vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
        vi.stubEnv("AI_MODEL_GATEWAY_BASE_URL", "");
        const create = vi.fn()
            .mockResolvedValueOnce(makeStream([
                {
                    model: "deepseek/deepseek-v4-pro",
                    choices: [{
                        delta: {
                            reasoning: "private thought",
                            reasoning_details: [{ type: "reasoning.text", text: "private thought" }],
                        },
                        finish_reason: null,
                    }],
                },
                {
                    model: "deepseek/deepseek-v4-pro",
                    choices: [{
                        delta: {
                            tool_calls: [{
                                index: 0,
                                id: "call-vercel",
                                type: "function",
                                function: { name: "search_pubmed", arguments: "{\"query\":\"x\"}" },
                            }],
                        },
                        finish_reason: "tool_calls",
                    }],
                    usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
                },
            ]))
            .mockResolvedValueOnce({
                id: "resp-followup",
                model: "deepseek/deepseek-v4-pro",
                choices: [{ message: { content: "done", tool_calls: [] } }],
                usage: { prompt_tokens: 12, completion_tokens: 2, total_tokens: 14 },
            });
        const provider = new GatewayProvider();
        attachClient(provider, create);

        const chunks = await collectChunks(provider.streamChat([userMessage("find evidence")], {
            model: "deepseek-v4-pro",
            reasoningEffort: "high",
            includeReasoning: false,
            tools,
        }));
        const toolChunk = chunks.find((chunk) => chunk.type === "tool_call")!;

        expect(toolChunk.providerReasoningContent).toContain("vercel-reasoning-v1:");
        expect(normalizeStreamChunk(toolChunk)).not.toHaveProperty("providerReasoningContent");

        await provider.chat([
            userMessage("find evidence"),
            {
                id: "assistant-tool",
                role: "assistant",
                content: "",
                toolCalls: [toolChunk.toolCall!],
                providerReasoningContent: toolChunk.providerReasoningContent,
                createdAt: new Date().toISOString(),
            },
            {
                id: "tool-result",
                role: "tool",
                content: "result",
                toolResultId: "call-vercel",
                createdAt: new Date().toISOString(),
            },
        ], {
            model: "deepseek-v4-pro",
            reasoningEffort: "high",
            tools,
        });

        expect(create.mock.calls[1][0].messages[1]).toMatchObject({
            role: "assistant",
            reasoning: "private thought",
            reasoning_details: [{ type: "reasoning.text", text: "private thought" }],
        });
    });

    it("supports custom compatible endpoints and per-model upstream overrides", async () => {
        vi.stubEnv("AI_MODEL_GATEWAY_API_KEY", "custom-key");
        vi.stubEnv("AI_MODEL_GATEWAY_BASE_URL", "https://compatible.example/v1/");
        vi.stubEnv("AI_GATEWAY_DEEPSEEK_V4_PRO_MODEL", "deepseek-v4-pro-direct");
        const create = vi.fn().mockResolvedValue({
            id: "resp-custom",
            model: "deepseek-v4-pro-direct",
            choices: [{ message: { content: "ok", tool_calls: [] } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
        const provider = new GatewayProvider();
        attachClient(provider, create);

        await provider.chat([userMessage("hello")], {
            model: "deepseek-v4-pro",
            reasoningEffort: "max",
        });

        expect(create.mock.calls[0][0]).toMatchObject({
            model: "deepseek-v4-pro-direct",
            max_tokens: 65_536,
            thinking: { type: "enabled" },
            reasoning_effort: "max",
        });
        expect(create.mock.calls[0][0]).not.toHaveProperty("reasoning");
        expect(create.mock.calls[0][0]).not.toHaveProperty("max_completion_tokens");
        expect(create.mock.calls[0][0]).not.toHaveProperty("providerOptions");
    });

    it("records gateway cache-hit and cache-write usage for non-streaming and streaming responses", async () => {
        vi.stubEnv("AI_MODEL_GATEWAY_API_KEY", "custom-key");
        vi.stubEnv("AI_MODEL_GATEWAY_BASE_URL", "https://api.deepseek.com");
        vi.stubEnv("AI_GATEWAY_DEEPSEEK_V4_PRO_MODEL", "deepseek-v4-pro");
        const create = vi.fn()
            .mockResolvedValueOnce({
                id: "resp-cache",
                model: "deepseek-v4-pro",
                choices: [{ message: { content: "ok", tool_calls: [] } }],
                usage: {
                    prompt_tokens: 30,
                    completion_tokens: 2,
                    total_tokens: 32,
                    prompt_cache_hit_tokens: 18,
                    prompt_tokens_details: { cache_write_tokens: 7 },
                },
            })
            .mockResolvedValueOnce(makeStream([{
                model: "deepseek-v4-pro",
                choices: [{ delta: { content: "ok" }, finish_reason: "stop" }],
                usage: {
                    prompt_tokens: 40,
                    completion_tokens: 3,
                    total_tokens: 43,
                    prompt_cache_hit_tokens: 24,
                    prompt_tokens_details: { cache_write_tokens: 9 },
                },
            }]));
        const provider = new GatewayProvider();
        attachClient(provider, create);

        const response = await provider.chat([userMessage("hello")], {
            model: "deepseek-v4-pro",
        });
        const chunks = await collectChunks(provider.streamChat([userMessage("hello")], {
            model: "deepseek-v4-pro",
        }));

        expect(response.usage?.cachedInputTokens).toBe(18);
        expect(response.usage?.cacheWriteInputTokens).toBe(7);
        expect(chunks.find((chunk) => chunk.type === "done")?.usage?.cachedInputTokens).toBe(24);
        expect(chunks.find((chunk) => chunk.type === "done")?.usage?.cacheWriteInputTokens).toBe(9);
    });

    it("keeps DeepSeek reasoning private while preserving it for the next tool turn", async () => {
        vi.stubEnv("AI_MODEL_GATEWAY_API_KEY", "custom-key");
        vi.stubEnv("AI_MODEL_GATEWAY_BASE_URL", "https://api.deepseek.example/v1");
        vi.stubEnv("AI_GATEWAY_DEEPSEEK_V4_PRO_MODEL", "deepseek-v4-pro");
        const create = vi.fn()
            .mockResolvedValueOnce(makeStream([
                {
                    model: "deepseek-v4-pro",
                    choices: [{ delta: { reasoning_content: "private thought" }, finish_reason: null }],
                },
                {
                    model: "deepseek-v4-pro",
                    choices: [{
                        delta: {
                            tool_calls: [{
                                index: 0,
                                id: "call-1",
                                type: "function",
                                function: { name: "search_pubmed", arguments: "{\"query\":\"x\"}" },
                            }],
                        },
                        finish_reason: "tool_calls",
                    }],
                    usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
                },
            ]))
            .mockResolvedValueOnce({
                id: "resp-followup",
                model: "deepseek-v4-pro",
                choices: [{ message: { content: "done", tool_calls: [] } }],
                usage: { prompt_tokens: 12, completion_tokens: 2, total_tokens: 14 },
            });
        const provider = new GatewayProvider();
        attachClient(provider, create);

        const chunks = await collectChunks(provider.streamChat([userMessage("find evidence")], {
            model: "deepseek-v4-pro",
            reasoningEffort: "high",
            includeReasoning: false,
            tools,
        }));
        const toolChunk = chunks.find((chunk) => chunk.type === "tool_call")!;

        expect(chunks.map((chunk) => chunk.type)).not.toContain("reasoning_delta");
        expect(toolChunk.providerReasoningContent).toBe("private thought");
        expect(normalizeStreamChunk(toolChunk)).not.toHaveProperty("providerReasoningContent");
        expect(JSON.stringify(normalizeStreamChunk(toolChunk))).not.toContain("private thought");

        await provider.chat([
            userMessage("find evidence"),
            {
                id: "assistant-tool",
                role: "assistant",
                content: "",
                toolCalls: [toolChunk.toolCall!],
                providerReasoningContent: toolChunk.providerReasoningContent,
                createdAt: new Date().toISOString(),
            },
            {
                id: "tool-result",
                role: "tool",
                content: "result",
                toolResultId: "call-1",
                createdAt: new Date().toISOString(),
            },
        ], {
            model: "deepseek-v4-pro",
            reasoningEffort: "high",
            tools,
        });

        const followupMessages = create.mock.calls[1][0].messages as Array<Record<string, unknown>>;
        expect(followupMessages[1]).toMatchObject({
            role: "assistant",
            reasoning_content: "private thought",
        });
    });
});
