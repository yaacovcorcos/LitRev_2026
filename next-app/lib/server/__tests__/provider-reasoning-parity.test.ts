import { describe, expect, it, vi } from "vitest";
import type { AIMessage, AIStreamChunk } from "@/types/ai";
import { OpenAIProvider } from "@/lib/server/ai/providers/openai";
import { XAIProvider } from "@/lib/server/ai/providers/xai";

function userMessage(content: string): AIMessage {
    return {
        id: "msg-1",
        role: "user",
        content,
        createdAt: new Date().toISOString(),
    };
}

async function collectChunks(stream: AsyncIterable<AIStreamChunk>): Promise<AIStreamChunk[]> {
    const chunks: AIStreamChunk[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
}

function makeStream(chunks: unknown[]): AsyncIterable<unknown> {
    return {
        async *[Symbol.asyncIterator]() {
            for (const chunk of chunks) {
                yield chunk;
            }
        },
    };
}

function attachMockClient(provider: object, chunks: unknown[]): void {
    const create = vi.fn(async () => makeStream(chunks));
    (provider as { client: unknown }).client = {
        chat: {
            completions: {
                create,
            },
        },
    };
}

describe("provider reasoning stream parity", () => {
    it("OpenAI provider emits reasoning events when includeReasoning is enabled", async () => {
        const provider = new OpenAIProvider();
        attachMockClient(provider, [
            {
                choices: [{ delta: { reasoning_content: "reasoning step" }, finish_reason: null }],
            },
            {
                choices: [{ delta: { content: "final answer" }, finish_reason: "stop" }],
                usage: { prompt_tokens: 12, completion_tokens: 6, total_tokens: 18 },
            },
        ]);

        const chunks = await collectChunks(
            provider.streamChat([userMessage("hello")], { includeReasoning: true })
        );
        const types = chunks.map((chunk) => chunk.type);

        expect(types).toContain("reasoning_start");
        expect(types).toContain("reasoning_delta");
        expect(types).toContain("reasoning_end");
        expect(types).toContain("done");
    });

    it("xAI provider emits reasoning events when includeReasoning is enabled", async () => {
        const provider = new XAIProvider();
        attachMockClient(provider, [
            {
                choices: [{ delta: { thinking_content: "xai thought" }, finish_reason: null }],
            },
            {
                choices: [{ delta: { content: "done" }, finish_reason: "stop" }],
                usage: { prompt_tokens: 8, completion_tokens: 3, total_tokens: 11 },
            },
        ]);

        const chunks = await collectChunks(
            provider.streamChat([userMessage("hello")], { includeReasoning: true })
        );
        const types = chunks.map((chunk) => chunk.type);

        expect(types).toContain("reasoning_start");
        expect(types).toContain("reasoning_delta");
        expect(types).toContain("reasoning_end");
        expect(types).toContain("done");
    });

    it("providers suppress reasoning events when includeReasoning is disabled", async () => {
        const provider = new OpenAIProvider();
        attachMockClient(provider, [
            {
                choices: [{ delta: { reasoning_content: "hidden when disabled" }, finish_reason: null }],
            },
            {
                choices: [{ delta: { content: "answer" }, finish_reason: "stop" }],
                usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
            },
        ]);

        const chunks = await collectChunks(
            provider.streamChat([userMessage("hello")], { includeReasoning: false })
        );
        const types = chunks.map((chunk) => chunk.type);

        expect(types).not.toContain("reasoning_start");
        expect(types).not.toContain("reasoning_delta");
        expect(types).not.toContain("reasoning_end");
        expect(types).toContain("done");
    });
});

