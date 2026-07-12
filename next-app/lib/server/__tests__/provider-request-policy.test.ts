import { describe, expect, it, vi } from "vitest";
import type { AIMessage, AIStreamChunk } from "@/types/ai";
import { OpenAIProvider } from "@/lib/server/ai/providers/openai";
import { XAIProvider } from "@/lib/server/ai/providers/xai";
import { GoogleProvider } from "@/lib/server/ai/providers/google";
import { AnthropicProvider } from "@/lib/server/ai/providers/anthropic";

function userMessage(content: string): AIMessage {
    return {
        id: "msg-1",
        role: "user",
        content,
        createdAt: new Date().toISOString(),
    };
}

function makeOpenAIStream(chunks: unknown[]): AsyncIterable<unknown> {
    return {
        async *[Symbol.asyncIterator]() {
            for (const chunk of chunks) {
                yield chunk;
            }
        },
    };
}

function makeAnthropicStream(events: unknown[]): AsyncIterable<unknown> {
    return {
        async *[Symbol.asyncIterator]() {
            for (const event of events) {
                yield event;
            }
        },
    };
}

async function collectChunks(stream: AsyncIterable<AIStreamChunk>): Promise<AIStreamChunk[]> {
    const chunks: AIStreamChunk[] = [];
    for await (const chunk of stream) {
        chunks.push(chunk);
    }
    return chunks;
}

describe("provider request policy wiring", () => {
    it("OpenAI chat and stream both omit temperature for fixed-default models", async () => {
        const create = vi.fn()
            .mockResolvedValueOnce({
                id: "resp-1",
                model: "gpt-5.2",
                choices: [{ message: { content: "ok", tool_calls: [] }, finish_reason: "stop" }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            })
            .mockResolvedValueOnce(makeOpenAIStream([
                {
                    choices: [{ delta: { content: "ok" }, finish_reason: "stop" }],
                    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
                },
            ]));
        const provider = new OpenAIProvider();
        ((provider as unknown) as { client: unknown }).client = { chat: { completions: { create } } };

        await provider.chat([userMessage("hi")], { model: "gpt-5.2", temperature: 0.2 });
        await collectChunks(provider.streamChat([userMessage("hi")], { model: "gpt-5.2", temperature: 0.2 }));

        expect(create).toHaveBeenCalledTimes(2);
        expect(create.mock.calls[0][0]).not.toHaveProperty("temperature");
        expect(create.mock.calls[1][0]).not.toHaveProperty("temperature");
    });

    it("xAI and Google preserve temperature for full-support models", async () => {
        const xaiCreate = vi.fn()
            .mockResolvedValueOnce({
                id: "resp-xai",
                model: "grok-4.3",
                choices: [{ message: { content: "ok", tool_calls: [] }, finish_reason: "stop" }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            })
            .mockResolvedValueOnce(makeOpenAIStream([
                {
                    choices: [{ delta: { content: "ok" }, finish_reason: "stop" }],
                    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
                },
            ]));
        const xaiProvider = new XAIProvider();
        ((xaiProvider as unknown) as { client: unknown }).client = { chat: { completions: { create: xaiCreate } } };

        await xaiProvider.chat([userMessage("hi")], { model: "grok-4.3", temperature: 0.4 });
        await collectChunks(xaiProvider.streamChat([userMessage("hi")], { model: "grok-4.3", temperature: 0.4 }));

        expect(xaiCreate.mock.calls[0][0].model).toBe("grok-4.3");
        expect(xaiCreate.mock.calls[1][0].model).toBe("grok-4.3");
        expect(xaiCreate.mock.calls[0][0].temperature).toBe(0.4);
        expect(xaiCreate.mock.calls[1][0].temperature).toBe(0.4);

        const googleCreate = vi.fn()
            .mockResolvedValueOnce({
                id: "resp-google",
                model: "gemini-3-flash-preview",
                choices: [{ message: { content: "ok", tool_calls: [] }, finish_reason: "stop" }],
                usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            })
            .mockResolvedValueOnce(makeOpenAIStream([
                {
                    choices: [{ delta: { content: "ok" }, finish_reason: "stop" }],
                    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
                },
            ]));
        const googleProvider = new GoogleProvider();
        ((googleProvider as unknown) as { client: unknown }).client = { chat: { completions: { create: googleCreate } } };

        await googleProvider.chat([userMessage("hi")], { model: "gemini-3-flash-preview", temperature: 0.6 });
        await collectChunks(googleProvider.streamChat([userMessage("hi")], { model: "gemini-3-flash-preview", temperature: 0.6 }));

        expect(googleCreate.mock.calls[0][0].temperature).toBe(0.6);
        expect(googleCreate.mock.calls[1][0].temperature).toBe(0.6);
    });

    it("Anthropic reuses normalized options for chat and stream", async () => {
        const create = vi.fn()
            .mockResolvedValueOnce({
                id: "resp-claude",
                model: "claude-haiku-4-5",
                content: [{ type: "text", text: "ok" }],
                stop_reason: "end_turn",
                usage: { input_tokens: 1, output_tokens: 1 },
            })
            .mockResolvedValueOnce(makeAnthropicStream([
                {
                    type: "message_start",
                    message: {
                        model: "claude-haiku-4-5",
                        usage: { input_tokens: 1 },
                    },
                },
                {
                    type: "message_delta",
                    delta: { stop_reason: "end_turn" },
                    usage: { output_tokens: 1 },
                },
            ]));
        const provider = new AnthropicProvider();
        ((provider as unknown) as { client: unknown }).client = { messages: { create } };

        await provider.chat([userMessage("hi")], {
            model: "claude-haiku-4-5",
            includeReasoning: true,
            reasoningBudgetTokens: 4096,
        });
        await collectChunks(provider.streamChat([userMessage("hi")], {
            model: "claude-haiku-4-5",
            includeReasoning: true,
            reasoningBudgetTokens: 4096,
        }));

        expect(create).toHaveBeenCalledTimes(2);
        expect(create.mock.calls[0][0]).not.toHaveProperty("thinking");
        expect(create.mock.calls[1][0].thinking).toMatchObject({ type: "enabled" });
        expect(create.mock.calls[1][0].thinking.budget_tokens).toBeGreaterThan(0);
    });
});
