import { describe, expect, it, vi } from "vitest";
import type {
    AIMessage,
    AIStreamChunk,
    ChatImageInput,
    ToolDefinition,
} from "@/types/ai";
import { AnthropicProvider } from "@/lib/server/ai/providers/anthropic";
import { GoogleProvider } from "@/lib/server/ai/providers/google";
import { OpenAIProvider } from "@/lib/server/ai/providers/openai";
import { XAIProvider } from "@/lib/server/ai/providers/xai";

function message(id: string, role: "user" | "assistant", content: string): AIMessage {
    return { id, role, content, createdAt: new Date().toISOString() };
}

function makeStream(events: unknown[]): AsyncIterable<unknown> {
    return {
        async *[Symbol.asyncIterator]() {
            for (const event of events) yield event;
        },
    };
}

async function collectChunks(stream: AsyncIterable<AIStreamChunk>): Promise<AIStreamChunk[]> {
    const chunks: AIStreamChunk[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
}

function providerResponse(params: {
    id?: string;
    model: string;
    outputText?: string;
    output?: unknown[];
    status?: string;
    serviceTier?: string;
    reasoningEffort?: string;
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
        cachedTokens?: number;
        cacheWriteTokens?: number;
        reasoningTokens?: number;
    };
}) {
    const inputTokens = params.usage?.inputTokens ?? 0;
    const outputTokens = params.usage?.outputTokens ?? 0;
    return {
        id: params.id ?? "resp-test",
        object: "response",
        created_at: 1,
        model: params.model,
        status: params.status ?? "completed",
        output_text: params.outputText ?? "",
        output: params.output ?? [],
        error: null,
        incomplete_details: null,
        instructions: null,
        metadata: null,
        parallel_tool_calls: true,
        temperature: null,
        tool_choice: "auto",
        tools: [],
        top_p: null,
        service_tier: params.serviceTier,
        reasoning: params.reasoningEffort ? { effort: params.reasoningEffort } : null,
        usage: {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            total_tokens: inputTokens + outputTokens,
            input_tokens_details: {
                cached_tokens: params.usage?.cachedTokens ?? 0,
                cache_write_tokens: params.usage?.cacheWriteTokens ?? 0,
            },
            output_tokens_details: {
                reasoning_tokens: params.usage?.reasoningTokens ?? 0,
            },
        },
    };
}

function attachResponsesClient(
    provider: OpenAIProvider | XAIProvider,
    create: ReturnType<typeof vi.fn>,
): void {
    (provider as unknown as { client: unknown }).client = { responses: { create } };
}

const imageInputs: ChatImageInput[] = [{
    fileAssetId: "asset-1",
    filename: "figure.png",
    mimeType: "image/png",
    dataUrl: "data:image/png;base64,AAAA",
}];

const tools: ToolDefinition[] = [{
    name: "read_protocol",
    description: "Read the current protocol",
    parameters: { type: "object", properties: {}, additionalProperties: false },
}];

describe("Responses API provider request policy wiring", () => {
    it("OpenAI chat and stream use Responses with reasoning, priority, and truthful receipts", async () => {
        const chatResponse = providerResponse({
            model: "gpt-5.6-luna-2026-06-01",
            outputText: "ok",
            serviceTier: "priority",
            reasoningEffort: "max",
            usage: { inputTokens: 6, outputTokens: 1, cachedTokens: 2, cacheWriteTokens: 3 },
        });
        const streamResponse = providerResponse({
            model: "gpt-5.6-luna-2026-06-01",
            outputText: "ok",
            serviceTier: "priority",
            reasoningEffort: "max",
            usage: { inputTokens: 8, outputTokens: 1, cachedTokens: 3, cacheWriteTokens: 4 },
        });
        const create = vi.fn()
            .mockResolvedValueOnce(chatResponse)
            .mockResolvedValueOnce(makeStream([
                { type: "response.output_text.delta", delta: "ok" },
                { type: "response.completed", response: streamResponse },
            ]));
        const provider = new OpenAIProvider();
        attachResponsesClient(provider, create);

        const options = {
            model: "gpt-5.6-luna",
            reasoningEffort: "max" as const,
            deliveryMode: "priority" as const,
            temperature: 0.2,
        };
        const response = await provider.chat([message("u1", "user", "hi")], options);
        const chunks = await collectChunks(provider.streamChat([message("u1", "user", "hi")], options));

        expect(create).toHaveBeenCalledTimes(2);
        for (const request of create.mock.calls.map((call) => call[0])) {
            expect(request).toMatchObject({
                model: "gpt-5.6-luna",
                reasoning: { effort: "max" },
                service_tier: "priority",
                store: false,
                include: ["reasoning.encrypted_content"],
            });
            expect(request).not.toHaveProperty("reasoning_effort");
            expect(request).not.toHaveProperty("messages");
            expect(request).not.toHaveProperty("temperature");
        }
        expect(response).toMatchObject({
            actualDeliveryMode: "priority",
            actualReasoningEffort: "max",
            usage: { cachedInputTokens: 2, cacheWriteInputTokens: 3 },
        });
        expect(chunks.at(-1)).toMatchObject({
            type: "done",
            actualProvider: "openai",
            actualDeliveryMode: "priority",
            actualReasoningEffort: "max",
            usage: { cachedInputTokens: 3, cacheWriteInputTokens: 4 },
        });
    });

    it("maps OpenAI fast to Responses reasoning none", async () => {
        const create = vi.fn().mockResolvedValue(providerResponse({
            model: "gpt-5.6-luna",
            outputText: "ok",
        }));
        const provider = new OpenAIProvider();
        attachResponsesClient(provider, create);

        await provider.chat([message("u1", "user", "hi")], {
            model: "gpt-5.6-luna",
            reasoningEffort: "fast",
        });

        expect(create.mock.calls[0][0].reasoning).toEqual({ effort: "none" });
    });

    it("preserves temperature for Google's full-support model", async () => {
        const create = vi.fn()
            .mockResolvedValueOnce({
                id: "resp-google",
                model: "gemini-3-flash-preview",
                choices: [{
                    message: { content: "ok", tool_calls: [] },
                    finish_reason: "stop",
                }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            })
            .mockResolvedValueOnce(makeStream([{
                choices: [{ delta: { content: "ok" }, finish_reason: "stop" }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            }]));
        const provider = new GoogleProvider();
        (provider as unknown as { client: unknown }).client = { chat: { completions: { create } } };

        await provider.chat([message("u1", "user", "hi")], {
            model: "gemini-3-flash-preview",
            temperature: 0.6,
        });
        await collectChunks(provider.streamChat([message("u1", "user", "hi")], {
            model: "gemini-3-flash-preview",
            temperature: 0.6,
        }));

        expect(create.mock.calls[0][0].temperature).toBe(0.6);
        expect(create.mock.calls[1][0].temperature).toBe(0.6);
    });

    it("reuses Anthropic normalized limits and suppresses unavailable reasoning visibility", async () => {
        const create = vi.fn()
            .mockResolvedValueOnce({
                id: "resp-claude",
                model: "claude-haiku-4-5",
                content: [{ type: "text", text: "ok" }],
                stop_reason: "end_turn",
                usage: { input_tokens: 1, output_tokens: 1 },
            })
            .mockResolvedValueOnce(makeStream([
                {
                    type: "message_start",
                    message: { model: "claude-haiku-4-5", usage: { input_tokens: 1 } },
                },
                {
                    type: "message_delta",
                    delta: { stop_reason: "end_turn" },
                    usage: { output_tokens: 1 },
                },
            ]));
        const provider = new AnthropicProvider();
        (provider as unknown as { client: unknown }).client = { messages: { create } };
        const options = {
            model: "claude-haiku-4-5",
            includeReasoning: true,
            reasoningEffort: "high" as const,
            reasoningBudgetTokens: 4_096,
            maxTokens: 8_192,
        };

        await provider.chat([message("u1", "user", "hi")], options);
        await collectChunks(provider.streamChat([message("u1", "user", "hi")], options));

        expect(create).toHaveBeenCalledTimes(2);
        expect(create.mock.calls[0][0].max_tokens).toBe(8_192);
        expect(create.mock.calls[1][0].max_tokens).toBe(8_192);
        expect(create.mock.calls[0][0]).not.toHaveProperty("thinking");
        expect(create.mock.calls[1][0]).not.toHaveProperty("thinking");
    });

    it("maps xAI fast to low and sends priority plus its Responses cache key", async () => {
        const create = vi.fn().mockResolvedValue(providerResponse({
            model: "grok-4.5",
            outputText: "ok",
            serviceTier: "priority",
            reasoningEffort: "low",
        }));
        const provider = new XAIProvider();
        attachResponsesClient(provider, create);

        const response = await provider.chat([message("u1", "user", "hi")], {
            model: "grok-4.5",
            reasoningEffort: "fast",
            deliveryMode: "priority",
            conversationId: "conv-stable-1",
        });

        expect(create.mock.calls[0][0]).toMatchObject({
            model: "grok-4.5",
            reasoning: { effort: "low" },
            service_tier: "priority",
            prompt_cache_key: "conv-stable-1",
        });
        expect(create.mock.calls[0][1]).not.toHaveProperty("headers");
        expect(response).toMatchObject({
            actualDeliveryMode: "priority",
            actualReasoningEffort: "low",
        });
    });

    it.each([
        ["OpenAI", () => new OpenAIProvider(), "gpt-5.6-luna", "flex"],
        ["xAI", () => new XAIProvider(), "grok-4.5", "unexpected-tier"],
    ])("does not report an unknown %s service tier as standard", async (_name, createProvider, model, tier) => {
        const create = vi.fn().mockResolvedValue(providerResponse({
            model,
            outputText: "ok",
            serviceTier: tier,
        }));
        const provider = createProvider();
        attachResponsesClient(provider, create);

        const response = await provider.chat([message("u1", "user", "hi")], { model });

        expect(response.actualDeliveryMode).toBeUndefined();
    });

    it.each([
        ["OpenAI", new OpenAIProvider(), "gpt-5.6-luna"],
        ["xAI", new XAIProvider(), "grok-4.5"],
    ])("attaches hydrated images only to the latest user turn for %s", async (_name, provider, model) => {
        const create = vi.fn().mockResolvedValue(providerResponse({ model, outputText: "ok" }));
        attachResponsesClient(provider, create);

        await provider.chat([
            message("u1", "user", "first"),
            message("a1", "assistant", "answer"),
            message("u2", "user", "inspect this"),
        ], { model, imageInputs });

        expect(create.mock.calls[0][0].input).toEqual([
            { role: "user", content: "first" },
            { role: "assistant", content: "answer" },
            {
                role: "user",
                content: [
                    { type: "input_text", text: "inspect this" },
                    { type: "input_image", image_url: imageInputs[0].dataUrl, detail: "auto" },
                ],
            },
        ]);
    });

    it("rejects Grok WebP before the xAI client is called", async () => {
        const create = vi.fn();
        const provider = new XAIProvider();
        attachResponsesClient(provider, create);

        await expect(provider.chat([message("u1", "user", "inspect")], {
            model: "grok-4.5",
            imageInputs: [{
                fileAssetId: "asset-webp",
                filename: "figure.webp",
                mimeType: "image/webp",
                dataUrl: "data:image/webp;base64,AAAA",
            }],
        })).rejects.toMatchObject({ errorCode: "UNSUPPORTED_IMAGE_FORMAT" });
        expect(create).not.toHaveBeenCalled();
    });

    it.each([
        ["OpenAI", () => new OpenAIProvider(), "gpt-5.6-luna"],
        ["xAI", () => new XAIProvider(), "grok-4.5"],
    ])("preserves the complete %s Responses tool turn through tool result to final answer", async (
        _name,
        createProvider,
        model,
    ) => {
        const reasoningItem = {
            id: "rs_1",
            type: "reasoning",
            summary: [],
            encrypted_content: "encrypted-reasoning",
            status: "completed",
        };
        const functionCallItem = {
            id: "fc_1",
            type: "function_call",
            call_id: "call_1",
            name: "read_protocol",
            arguments: "{}",
            status: "completed",
        };
        const toolResponse = providerResponse({
            id: "resp-tool",
            model,
            output: [reasoningItem, functionCallItem],
            reasoningEffort: model === "grok-4.5" ? "medium" : "medium",
        });
        const finalResponse = providerResponse({
            id: "resp-final",
            model,
            outputText: "The protocol is ready.",
            output: [{
                id: "msg_final",
                type: "message",
                role: "assistant",
                status: "completed",
                content: [{ type: "output_text", text: "The protocol is ready.", annotations: [] }],
            }],
        });
        const create = vi.fn()
            .mockResolvedValueOnce(makeStream([
                { type: "response.output_item.done", item: reasoningItem },
                { type: "response.output_item.done", item: functionCallItem },
                { type: "response.completed", response: toolResponse },
            ]))
            .mockResolvedValueOnce(finalResponse);
        const provider = createProvider();
        attachResponsesClient(provider, create);

        const firstTurn = await collectChunks(provider.streamChat(
            [message("u1", "user", "Read the protocol")],
            { model, reasoningEffort: "medium", tools },
        ));
        const toolCall = firstTurn.find((chunk) => chunk.type === "tool_call")?.toolCall;
        const privateState = firstTurn.find((chunk) => chunk.type === "done")?.providerReasoningContent;

        expect(toolCall).toEqual({ id: "call_1", name: "read_protocol", arguments: {} });
        expect(privateState).toContain("responses-api-v1:");
        expect(create.mock.calls[0][0].tools).toEqual([{
            type: "function",
            name: "read_protocol",
            description: "Read the current protocol",
            parameters: tools[0].parameters,
            strict: false,
        }]);

        const response = await provider.chat([
            message("u1", "user", "Read the protocol"),
            {
                id: "assistant-tool",
                role: "assistant",
                content: "",
                toolCalls: [toolCall!],
                providerReasoningContent: privateState,
                createdAt: new Date().toISOString(),
            },
            {
                id: "tool-result",
                role: "tool",
                content: "No protocol is defined yet.",
                toolResultId: "call_1",
                createdAt: new Date().toISOString(),
            },
        ], { model, reasoningEffort: "medium", tools });

        expect(create.mock.calls[1][0].input).toEqual([
            { role: "user", content: "Read the protocol" },
            reasoningItem,
            functionCallItem,
            {
                type: "function_call_output",
                call_id: "call_1",
                output: "No protocol is defined yet.",
            },
        ]);
        expect(response.content).toBe("The protocol is ready.");
    });
});
