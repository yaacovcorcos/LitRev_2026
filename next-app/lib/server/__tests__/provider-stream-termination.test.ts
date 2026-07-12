import { describe, expect, it, vi } from "vitest";
import type { AIMessage, AIStreamChunk } from "@/types/ai";
import { AnthropicProvider } from "@/lib/server/ai/providers/anthropic";
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

const compatibleProviders = [
    ["OpenAI", () => new OpenAIProvider()],
    ["Google", () => new GoogleProvider()],
    ["xAI", () => new XAIProvider()],
] as const;

function attachCompatibleClient(provider: object, chunks: unknown[]) {
    (provider as { client: unknown }).client = {
        chat: { completions: { create: vi.fn().mockResolvedValue(streamOf(chunks)) } },
    };
}

describe("provider terminal-state enforcement", () => {
    it("marks deterministic token truncation non-retryable", () => {
        expect(createProviderTerminationError({
            provider: "Provider",
            reason: "length",
        })).toMatchObject({
            code: "PROVIDER_RESPONSE_TRUNCATED",
            retryable: false,
        });
    });
    it.each(compatibleProviders)("%s surfaces token truncation instead of a successful done", async (_label, createProvider) => {
        const provider = createProvider();
        attachCompatibleClient(provider, [{
            choices: [{ delta: { content: "partial" }, finish_reason: "length" }],
        }]);

        const chunks = await collect(provider.streamChat([message]));

        expect(chunks).toContainEqual(expect.objectContaining({
            type: "error",
            errorCode: "PROVIDER_RESPONSE_TRUNCATED",
        }));
        expect(chunks.some((chunk) => chunk.type === "done")).toBe(false);
    });

    it.each(compatibleProviders)("%s rejects a stream that closes without a terminal reason", async (_label, createProvider) => {
        const provider = createProvider();
        attachCompatibleClient(provider, [{
            choices: [{ delta: { content: "partial" }, finish_reason: null }],
        }]);

        const chunks = await collect(provider.streamChat([message]));

        expect(chunks.at(-1)).toMatchObject({
            type: "error",
            errorCode: "PROVIDER_STREAM_INCOMPLETE",
        });
        expect(chunks.some((chunk) => chunk.type === "done")).toBe(false);
    });

    it.each(compatibleProviders)("%s rejects an empty tool-call terminal turn", async (_label, createProvider) => {
        const provider = createProvider();
        attachCompatibleClient(provider, [{
            choices: [{ delta: {}, finish_reason: "tool_calls" }],
        }]);

        const chunks = await collect(provider.streamChat([message]));

        expect(chunks.at(-1)).toMatchObject({
            type: "error",
            errorCode: "PROVIDER_STREAM_INCOMPLETE",
        });
        expect(chunks.some((chunk) => chunk.type === "done")).toBe(false);
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
        expect(chunks.some((chunk) => chunk.type === "done")).toBe(false);
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
        expect(chunks.some((chunk) => chunk.type === "done")).toBe(false);
    });

    it("Anthropic rejects a terminal event while a tool block is still active", async () => {
        const provider = new AnthropicProvider();
        (provider as unknown as { client: unknown }).client = {
            messages: {
                create: vi.fn().mockResolvedValue(streamOf([
                    { type: "message_start", message: { model: "claude-test", usage: { input_tokens: 3 } } },
                    { type: "content_block_start", index: 0, content_block: { type: "tool_use", id: "call-1", name: "search" } },
                    { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: "{}" } },
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
        expect(chunks.some((chunk) => chunk.type === "done")).toBe(false);
    });
});
