import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AIMessage, AIStreamChunk, ChatOptions } from "@/types/ai";
import { AnthropicProvider } from "@/lib/server/ai/providers/anthropic";
import { GatewayProvider } from "@/lib/server/ai/providers/gateway";
import { GoogleProvider } from "@/lib/server/ai/providers/google";
import { OpenAIProvider } from "@/lib/server/ai/providers/openai";
import { XAIProvider } from "@/lib/server/ai/providers/xai";
import { createProviderTerminationError } from "@/lib/server/ai/providers/stream-termination";

const message: AIMessage = {
    id: "message-1",
    role: "user",
    content: "Explain the result",
    createdAt: new Date().toISOString(),
};

function streamOf(events: unknown[]): AsyncIterable<unknown> {
    return {
        async *[Symbol.asyncIterator]() {
            for (const event of events) yield event;
        },
    };
}

async function collect(stream: AsyncIterable<AIStreamChunk>): Promise<AIStreamChunk[]> {
    const chunks: AIStreamChunk[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
}

type ChatProviderCase = {
    label: string;
    createProvider: () => GoogleProvider | GatewayProvider;
    options: ChatOptions;
};

const chatProviders: ChatProviderCase[] = [
    {
        label: "Google",
        createProvider: () => new GoogleProvider(),
        options: { model: "gemini-3-flash-preview" },
    },
    {
        label: "Model Gateway",
        createProvider: () => new GatewayProvider(),
        options: { model: "deepseek-v4-pro" },
    },
];

const responsesProviders = [
    { label: "OpenAI", createProvider: () => new OpenAIProvider(), model: "gpt-5.6-luna" },
    { label: "xAI", createProvider: () => new XAIProvider(), model: "grok-4.5" },
] as const;

function attachChatClient(provider: object, chunks: unknown[]) {
    (provider as { client: unknown }).client = {
        chat: { completions: { create: vi.fn().mockResolvedValue(streamOf(chunks)) } },
    };
}

function attachResponsesClient(provider: object, events: unknown[]) {
    (provider as { client: unknown }).client = {
        responses: { create: vi.fn().mockResolvedValue(streamOf(events)) },
    };
}

function response(params: {
    model: string;
    status: "completed" | "failed" | "incomplete";
    output?: unknown[];
    outputText?: string;
    incompleteReason?: string;
    errorCode?: string;
    errorMessage?: string;
}) {
    return {
        id: "resp-terminal",
        object: "response",
        created_at: 1,
        model: params.model,
        status: params.status,
        output_text: params.outputText ?? "",
        output: params.output ?? [],
        error: params.errorCode
            ? { code: params.errorCode, message: params.errorMessage ?? "provider failed" }
            : null,
        incomplete_details: params.incompleteReason ? { reason: params.incompleteReason } : null,
        instructions: null,
        metadata: null,
        parallel_tool_calls: true,
        temperature: null,
        tool_choice: "auto",
        tools: [],
        top_p: null,
        usage: {
            input_tokens: 2,
            output_tokens: 1,
            total_tokens: 3,
            input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 0 },
        },
    };
}

beforeEach(() => {
    vi.stubEnv("AI_MODEL_GATEWAY_ENABLED", "1");
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-key");
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("provider terminal-state enforcement", () => {
    it("marks deterministic token truncation non-retryable", () => {
        expect(createProviderTerminationError({ provider: "Provider", reason: "max_output_tokens" }))
            .toMatchObject({ code: "PROVIDER_RESPONSE_TRUNCATED", retryable: false });
    });

    it.each(chatProviders)("$label surfaces token truncation instead of done", async ({ createProvider, options }) => {
        const provider = createProvider();
        attachChatClient(provider, [{
            choices: [{ delta: { content: "partial" }, finish_reason: "length" }],
        }]);

        const chunks = await collect(provider.streamChat([message], options));

        expect(chunks).toContainEqual(expect.objectContaining({
            type: "error",
            errorCode: "PROVIDER_RESPONSE_TRUNCATED",
        }));
        expect(chunks.some((chunk) => chunk.type === "done")).toBe(false);
    });

    it.each(chatProviders)("$label rejects a stream that closes without a terminal reason", async ({ createProvider, options }) => {
        const provider = createProvider();
        attachChatClient(provider, [{
            choices: [{ delta: { content: "partial" }, finish_reason: null }],
        }]);

        const chunks = await collect(provider.streamChat([message], options));

        expect(chunks.at(-1)).toMatchObject({
            type: "error",
            errorCode: "PROVIDER_STREAM_INCOMPLETE",
        });
        expect(chunks.some((chunk) => chunk.type === "done")).toBe(false);
    });

    it.each(chatProviders)("$label rejects an empty tool-call terminal turn", async ({ createProvider, options }) => {
        const provider = createProvider();
        attachChatClient(provider, [{ choices: [{ delta: {}, finish_reason: "tool_calls" }] }]);

        const chunks = await collect(provider.streamChat([message], options));

        expect(chunks.at(-1)).toMatchObject({
            type: "error",
            errorCode: "PROVIDER_STREAM_INCOMPLETE",
        });
        expect(chunks.some((chunk) => chunk.type === "done")).toBe(false);
    });

    it.each(chatProviders)("$label rejects a tool call with a missing id or name", async ({ createProvider, options }) => {
        const provider = createProvider();
        attachChatClient(provider, [{
            choices: [{
                delta: {
                    tool_calls: [{
                        index: 0,
                        id: "",
                        function: { name: "search", arguments: "{}" },
                    }],
                },
                finish_reason: "tool_calls",
            }],
        }]);

        const chunks = await collect(provider.streamChat([message], options));

        expect(chunks.at(-1)).toMatchObject({
            type: "error",
            errorCode: "PROVIDER_STREAM_INCOMPLETE",
        });
        expect(chunks.some((chunk) => chunk.type === "done")).toBe(false);
    });

    it.each(responsesProviders)("$label maps Responses max_output_tokens incomplete to truncation", async ({ createProvider, model }) => {
        const provider = createProvider();
        attachResponsesClient(provider, [{
            type: "response.incomplete",
            response: response({ model, status: "incomplete", incompleteReason: "max_output_tokens" }),
        }]);

        const chunks = await collect(provider.streamChat([message], { model }));

        expect(chunks.at(-1)).toMatchObject({
            type: "error",
            errorCode: "PROVIDER_RESPONSE_TRUNCATED",
        });
        expect(chunks.some((chunk) => chunk.type === "done")).toBe(false);
    });

    it.each(responsesProviders)("$label rejects a Responses failed terminal event", async ({ createProvider, model }) => {
        const provider = createProvider();
        const rawDiagnostic = "internal upstream trace includes patient@example.com";
        attachResponsesClient(provider, [{
            type: "response.failed",
            response: response({
                model,
                status: "failed",
                errorCode: "server_error",
                errorMessage: rawDiagnostic,
            }),
        }]);

        const chunks = await collect(provider.streamChat([message], { model }));

        expect(chunks.at(-1)).toMatchObject({
            type: "error",
            errorCode: "PROVIDER_TEMPORARILY_UNAVAILABLE",
        });
        expect(JSON.stringify(chunks)).not.toContain(rawDiagnostic);
        expect(chunks.some((chunk) => chunk.type === "done")).toBe(false);
    });

    it.each(responsesProviders)("$label sanitizes a raw Responses error event", async ({ createProvider, model }) => {
        const provider = createProvider();
        const rawDiagnostic = "temporarily overloaded; upstream body=private research text";
        const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        attachResponsesClient(provider, [{
            type: "error",
            code: "provider_overloaded",
            message: rawDiagnostic,
        }]);

        const chunks = await collect(provider.streamChat([message], { model }));

        expect(chunks.at(-1)).toMatchObject({
            type: "error",
            errorCode: "PROVIDER_TEMPORARILY_UNAVAILABLE",
            error: expect.stringContaining("temporarily unavailable"),
        });
        expect(JSON.stringify(chunks)).not.toContain(rawDiagnostic);
        expect(JSON.stringify(warn.mock.calls)).toContain("[redacted]");
        expect(JSON.stringify(warn.mock.calls)).not.toContain(rawDiagnostic);
    });

    it.each(responsesProviders)("$label sanitizes a rejected Responses stream request", async ({ createProvider, model }) => {
        const provider = createProvider();
        const rawDiagnostic = "401 invalid_api_key sk-secret-provider-token";
        (provider as unknown as { client: unknown }).client = {
            responses: {
                create: vi.fn().mockRejectedValue(Object.assign(new Error(rawDiagnostic), {
                    status: 401,
                    code: "invalid_api_key",
                    headers: {
                        "retry-after": "2",
                        "x-provider-debug": rawDiagnostic,
                    },
                })),
            },
        };

        const chunks = await collect(provider.streamChat([message], { model }));

        expect(chunks.at(-1)).toMatchObject({
            type: "error",
            errorCode: "PROVIDER_REQUEST_REJECTED",
            errorHeaders: { "retry-after": "2" },
        });
        expect(JSON.stringify(chunks)).not.toContain(rawDiagnostic);
        expect(JSON.stringify(chunks)).not.toContain("x-provider-debug");
    });

    it.each(responsesProviders)("$label sanitizes a failed non-streaming Responses result", async ({ createProvider, model }) => {
        const provider = createProvider();
        const rawDiagnostic = "provider trace contains private protocol draft";
        (provider as unknown as { client: unknown }).client = {
            responses: {
                create: vi.fn().mockResolvedValue(response({
                    model,
                    status: "failed",
                    errorCode: "server_error",
                    errorMessage: rawDiagnostic,
                })),
            },
        };

        let caught: unknown;
        try {
            await provider.chat([message], { model });
        } catch (error) {
            caught = error;
        }

        expect(caught).toMatchObject({
            errorCode: "PROVIDER_TEMPORARILY_UNAVAILABLE",
            message: expect.stringContaining("temporarily unavailable"),
        });
        expect(JSON.stringify(caught)).not.toContain(rawDiagnostic);
    });

    it.each(responsesProviders)("$label rejects a Responses stream without response.completed", async ({ createProvider, model }) => {
        const provider = createProvider();
        attachResponsesClient(provider, [{ type: "response.output_text.delta", delta: "partial" }]);

        const chunks = await collect(provider.streamChat([message], { model }));

        expect(chunks.at(-1)).toMatchObject({
            type: "error",
            errorCode: "PROVIDER_STREAM_INCOMPLETE",
        });
        expect(chunks.some((chunk) => chunk.type === "done")).toBe(false);
    });

    it.each(responsesProviders)("$label rejects a malformed Responses function call", async ({ createProvider, model }) => {
        const provider = createProvider();
        attachResponsesClient(provider, [{
            type: "response.output_item.done",
            item: {
                id: "fc-1",
                type: "function_call",
                call_id: "",
                name: "search",
                arguments: "{}",
                status: "completed",
            },
        }]);

        const chunks = await collect(provider.streamChat([message], { model }));

        expect(chunks.at(-1)).toMatchObject({
            type: "error",
            errorCode: "PROVIDER_STREAM_INCOMPLETE",
        });
        expect(chunks.some((chunk) => chunk.type === "done")).toBe(false);
    });

    it.each(responsesProviders)("$label emits done only after response.completed", async ({ createProvider, model }) => {
        const provider = createProvider();
        const completed = response({ model, status: "completed", outputText: "complete" });
        attachResponsesClient(provider, [
            { type: "response.output_text.delta", delta: "complete" },
            { type: "response.completed", response: completed },
        ]);

        const chunks = await collect(provider.streamChat([message], { model }));

        expect(chunks.at(-1)).toMatchObject({ type: "done", content: "complete" });
    });

    it("Anthropic reads message_delta.stop_reason and rejects max-token truncation", async () => {
        const provider = new AnthropicProvider();
        (provider as unknown as { client: unknown }).client = {
            messages: {
                create: vi.fn().mockResolvedValue(streamOf([
                    { type: "message_start", message: { model: "claude-test", usage: { input_tokens: 3 } } },
                    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "partial" } },
                    { type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 4 } },
                    { type: "message_stop" },
                ])),
            },
        };

        const chunks = await collect(provider.streamChat([message]));

        expect(chunks.at(-1)).toMatchObject({
            type: "error",
            errorCode: "PROVIDER_RESPONSE_TRUNCATED",
        });
    });

    it("Anthropic emits done only after a supported terminal stop reason", async () => {
        const provider = new AnthropicProvider();
        (provider as unknown as { client: unknown }).client = {
            messages: {
                create: vi.fn().mockResolvedValue(streamOf([
                    { type: "message_start", message: { model: "claude-test", usage: { input_tokens: 3 } } },
                    { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "complete" } },
                    { type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 2 } },
                    { type: "message_stop" },
                ])),
            },
        };

        const chunks = await collect(provider.streamChat([message]));

        expect(chunks.at(-1)).toMatchObject({ type: "done", content: "complete" });
    });

    it("Anthropic rejects tool_use without a completed tool block", async () => {
        const provider = new AnthropicProvider();
        (provider as unknown as { client: unknown }).client = {
            messages: {
                create: vi.fn().mockResolvedValue(streamOf([
                    { type: "message_start", message: { model: "claude-test", usage: { input_tokens: 3 } } },
                    { type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 2 } },
                    { type: "message_stop" },
                ])),
            },
        };

        const chunks = await collect(provider.streamChat([message]));

        expect(chunks.at(-1)).toMatchObject({
            type: "error",
            errorCode: "PROVIDER_STREAM_INCOMPLETE",
        });
    });
});
