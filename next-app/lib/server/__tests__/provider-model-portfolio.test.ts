import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AIMessage, AIStreamChunk, ToolDefinition } from "@/types/ai";
import {
    SELECTABLE_MODEL_IDS,
    getModelCapabilityRecord,
} from "@/lib/ai/config";
import { GatewayProvider } from "@/lib/server/ai/providers/gateway";
import { OpenAIProvider } from "@/lib/server/ai/providers/openai";
import { XAIProvider } from "@/lib/server/ai/providers/xai";

const userMessage: AIMessage = {
    id: "user-1",
    role: "user",
    content: "Use the tool if needed",
    createdAt: new Date().toISOString(),
};

const tools: ToolDefinition[] = [{
    name: "read_protocol",
    description: "Read the protocol",
    parameters: { type: "object", properties: {}, additionalProperties: false },
}];

function responsesResult(model: string) {
    return {
        id: "resp-1",
        object: "response",
        created_at: 1,
        model,
        status: "completed",
        output_text: "ok",
        output: [],
        error: null,
        incomplete_details: null,
        instructions: null,
        metadata: null,
        parallel_tool_calls: true,
        temperature: null,
        tool_choice: "auto",
        tools: [],
        top_p: null,
        usage: {
            input_tokens: 1,
            output_tokens: 1,
            total_tokens: 2,
            input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 0 },
        },
    };
}

function streamOf(chunks: unknown[]): AsyncIterable<unknown> {
    return {
        async *[Symbol.asyncIterator]() {
            for (const chunk of chunks) yield chunk;
        },
    };
}

async function collect(stream: AsyncIterable<AIStreamChunk>): Promise<AIStreamChunk[]> {
    const chunks: AIStreamChunk[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
}

beforeEach(() => {
    vi.stubEnv("AI_MODEL_GATEWAY_ENABLED", "1");
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
});

afterEach(() => {
    vi.unstubAllEnvs();
});

describe("selectable provider model portfolio contract", () => {
    const openAIModels = ["gpt-5.6-luna", "gpt-5.6-terra", "gpt-5.6-sol"] as const;
    const gatewayModels = [
        ["deepseek-v4-flash", "deepseek/deepseek-v4-flash"],
        ["deepseek-v4-pro", "deepseek/deepseek-v4-pro"],
        ["qwen3.7-plus", "alibaba/qwen3.7-plus"],
    ] as const;

    it("accounts for every selectable model exactly once", () => {
        const audited = [
            ...openAIModels,
            ...gatewayModels.map(([model]) => model),
            "grok-4.5",
        ].sort();
        expect([...SELECTABLE_MODEL_IDS].sort()).toEqual(audited);
    });

    it.each(openAIModels)("routes %s reasoning plus tools through Responses", async (model) => {
        const create = vi.fn().mockResolvedValue(responsesResult(model));
        const provider = new OpenAIProvider();
        (provider as unknown as { client: unknown }).client = { responses: { create } };

        await provider.chat([userMessage], { model, reasoningEffort: "medium", tools });

        expect(create.mock.calls[0][0]).toMatchObject({
            model,
            reasoning: { effort: "medium" },
            tools: [{ type: "function", name: "read_protocol" }],
            store: false,
        });
        expect(create.mock.calls[0][0]).not.toHaveProperty("messages");
        expect(getModelCapabilityRecord(model)).toMatchObject({
            provider: "openai",
            providerDialect: "openai",
            deliveryModes: ["standard", "priority"],
        });
    });

    it("routes grok-4.5 reasoning plus tools through xAI Responses", async () => {
        const create = vi.fn().mockResolvedValue(responsesResult("grok-4.5"));
        const provider = new XAIProvider();
        (provider as unknown as { client: unknown }).client = { responses: { create } };

        await provider.chat([userMessage], {
            model: "grok-4.5",
            reasoningEffort: "medium",
            tools,
        });

        expect(create.mock.calls[0][0]).toMatchObject({
            model: "grok-4.5",
            reasoning: { effort: "medium" },
            tools: [{ type: "function", name: "read_protocol" }],
            store: false,
        });
        expect(getModelCapabilityRecord("grok-4.5")).toMatchObject({
            provider: "xai",
            providerDialect: "xai",
            deliveryModes: ["standard", "priority"],
        });
    });

    it.each(gatewayModels)("routes %s through the verified Chat Completions slug", async (model, slug) => {
        const create = vi.fn().mockResolvedValue({
            id: "chat-1",
            model: slug,
            choices: [{ message: { content: "ok", tool_calls: [] }, finish_reason: "stop" }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
        const provider = new GatewayProvider();
        (provider as unknown as { client: unknown }).client = {
            chat: { completions: { create } },
        };

        await provider.chat([userMessage], { model, tools });

        expect(create.mock.calls[0][0]).toMatchObject({
            model: slug,
            tools: [{
                type: "function",
                function: { name: "read_protocol" },
            }],
        });
        expect(getModelCapabilityRecord(model)).toMatchObject({
            provider: "gateway",
            deliveryModes: ["standard"],
        });
    });

    it.each(gatewayModels)("completes a %s tool call, result, and final answer", async (model, slug) => {
        const create = vi.fn()
            .mockResolvedValueOnce(streamOf([{
                model: slug,
                choices: [{
                    delta: {
                        tool_calls: [{
                            index: 0,
                            id: "call_1",
                            type: "function",
                            function: { name: "read_protocol", arguments: "{}" },
                        }],
                    },
                    finish_reason: "tool_calls",
                }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }]))
            .mockResolvedValueOnce({
                id: "chat-final",
                model: slug,
                choices: [{
                    message: { content: "The protocol is ready.", tool_calls: [] },
                    finish_reason: "stop",
                }],
                usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 },
            });
        const provider = new GatewayProvider();
        (provider as unknown as { client: unknown }).client = {
            chat: { completions: { create } },
        };

        const firstTurn = await collect(provider.streamChat([userMessage], { model, tools }));
        const toolCall = firstTurn.find((chunk) => chunk.type === "tool_call")?.toolCall;
        const final = await provider.chat([
            userMessage,
            {
                id: "assistant-tool",
                role: "assistant",
                content: "",
                toolCalls: [toolCall!],
                createdAt: new Date().toISOString(),
            },
            {
                id: "tool-result",
                role: "tool",
                content: "No protocol is defined yet.",
                toolResultId: "call_1",
                createdAt: new Date().toISOString(),
            },
        ], { model, tools });

        expect(toolCall).toEqual({ id: "call_1", name: "read_protocol", arguments: {} });
        expect(create.mock.calls[1][0].messages.slice(-2)).toEqual([
            {
                role: "assistant",
                content: null,
                tool_calls: [{
                    id: "call_1",
                    type: "function",
                    function: { name: "read_protocol", arguments: "{}" },
                }],
            },
            {
                role: "tool",
                tool_call_id: "call_1",
                content: "No protocol is defined yet.",
            },
        ]);
        expect(final.content).toBe("The protocol is ready.");
    });
});
