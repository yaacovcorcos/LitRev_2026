import { describe, expect, it, vi } from "vitest";
import type { AIMessage, AIStreamChunk, ChatImageInput } from "@/types/ai";
import { OpenAIProvider } from "@/lib/server/ai/providers/openai";
import { XAIProvider } from "@/lib/server/ai/providers/xai";

function message(id: string, role: "user" | "assistant", content: string): AIMessage {
    return { id, role, content, createdAt: new Date().toISOString() };
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

const imageInputs: ChatImageInput[] = [{
    fileAssetId: "asset-1",
    filename: "figure.png",
    mimeType: "image/png",
    dataUrl: "data:image/png;base64,AAAA",
}];

describe("provider request policy wiring", () => {
    it("maps OpenAI effort and paid delivery and reports the returned tier", async () => {
        const create = vi.fn()
            .mockResolvedValueOnce({
                id: "resp-1",
                model: "gpt-5.6-luna-2026-06-01",
                service_tier: "priority",
                choices: [{ message: { content: "ok", tool_calls: [] } }],
                usage: {
                    prompt_tokens: 6,
                    completion_tokens: 1,
                    total_tokens: 7,
                    prompt_tokens_details: { cached_tokens: 2, cache_write_tokens: 3 },
                },
            })
            .mockResolvedValueOnce(makeStream([{
                model: "gpt-5.6-luna-2026-06-01",
                service_tier: "priority",
                choices: [{ delta: { content: "ok" }, finish_reason: "stop" }],
                usage: {
                    prompt_tokens: 8,
                    completion_tokens: 1,
                    total_tokens: 9,
                    prompt_tokens_details: { cached_tokens: 3, cache_write_tokens: 4 },
                },
            }]));
        const provider = new OpenAIProvider();
        (provider as unknown as { client: unknown }).client = { chat: { completions: { create } } };

        const response = await provider.chat([message("u1", "user", "hi")], {
            model: "gpt-5.6-luna",
            reasoningEffort: "max",
            deliveryMode: "priority",
        });
        const chunks = await collectChunks(provider.streamChat([message("u1", "user", "hi")], {
            model: "gpt-5.6-luna",
            reasoningEffort: "max",
            deliveryMode: "priority",
        }));

        expect(create.mock.calls[0][0]).toMatchObject({
            model: "gpt-5.6-luna",
            reasoning_effort: "max",
            service_tier: "priority",
        });
        expect(create.mock.calls[1][0]).toMatchObject({
            model: "gpt-5.6-luna",
            reasoning_effort: "max",
            service_tier: "priority",
        });
        expect(response.actualDeliveryMode).toBe("priority");
        expect(response.usage).toMatchObject({
            cachedInputTokens: 2,
            cacheWriteInputTokens: 3,
        });
        expect(chunks.at(-1)).toMatchObject({
            type: "done",
            actualProvider: "openai",
            actualDeliveryMode: "priority",
            usage: {
                cachedInputTokens: 3,
                cacheWriteInputTokens: 4,
            },
        });
        expect(chunks.at(-1)).not.toHaveProperty("actualReasoningEffort");
    });

    it("maps OpenAI fast to native none", async () => {
        const create = vi.fn().mockResolvedValue({
            id: "resp-fast",
            model: "gpt-5.6-luna",
            choices: [{ message: { content: "ok", tool_calls: [] } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
        const provider = new OpenAIProvider();
        (provider as unknown as { client: unknown }).client = { chat: { completions: { create } } };

        await provider.chat([message("u1", "user", "hi")], {
            model: "gpt-5.6-luna",
            reasoningEffort: "fast",
        });

        expect(create.mock.calls[0][0].reasoning_effort).toBe("none");
    });

    it("maps xAI fast to native low and priority to its service tier", async () => {
        const create = vi.fn().mockResolvedValue({
            id: "resp-xai",
            model: "grok-4.5",
            service_tier: "priority",
            choices: [{ message: { content: "ok", tool_calls: [] } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
        const provider = new XAIProvider();
        (provider as unknown as { client: unknown }).client = { chat: { completions: { create } } };

        const response = await provider.chat([message("u1", "user", "hi")], {
            model: "grok-4.5",
            reasoningEffort: "fast",
            deliveryMode: "priority",
            conversationId: "conv-stable-1",
        });

        expect(create.mock.calls[0][0]).toMatchObject({
            model: "grok-4.5",
            reasoning_effort: "low",
            service_tier: "priority",
        });
        expect(create.mock.calls[0][1]).toMatchObject({
            headers: { "x-grok-conv-id": "conv-stable-1" },
        });
        expect(response.actualDeliveryMode).toBe("priority");
    });

    it.each([
        ["OpenAI", new OpenAIProvider(), "gpt-5.6-luna"],
        ["xAI", new XAIProvider(), "grok-4.5"],
    ])("attaches hydrated images only to the latest user message for %s", async (_name, provider, model) => {
        const create = vi.fn().mockResolvedValue({
            id: "resp-image",
            model,
            choices: [{ message: { content: "ok", tool_calls: [] } }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
        (provider as unknown as { client: unknown }).client = { chat: { completions: { create } } };

        await provider.chat([
            message("u1", "user", "first"),
            message("a1", "assistant", "answer"),
            message("u2", "user", "inspect this"),
        ], { model, imageInputs });

        const sentMessages = create.mock.calls[0][0].messages as Array<{ role: string; content: unknown }>;
        expect(sentMessages[0]?.content).toBe("first");
        expect(sentMessages[2]?.content).toEqual([
            { type: "text", text: "inspect this" },
            {
                type: "image_url",
                image_url: { url: imageInputs[0].dataUrl, detail: "auto" },
            },
        ]);
    });
});
