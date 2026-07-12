import { describe, expect, it, vi } from "vitest";
import type { AIMessage, AIStreamChunk } from "@/types/ai";
import { OpenAIProvider } from "@/lib/server/ai/providers/openai";
import { XAIProvider } from "@/lib/server/ai/providers/xai";

function userMessage(content: string): AIMessage {
    return { id: "msg-1", role: "user", content, createdAt: new Date().toISOString() };
}

async function collectChunks(stream: AsyncIterable<AIStreamChunk>): Promise<AIStreamChunk[]> {
    const chunks: AIStreamChunk[] = [];
    for await (const chunk of stream) chunks.push(chunk);
    return chunks;
}

function makeStream(events: unknown[]): AsyncIterable<unknown> {
    return {
        async *[Symbol.asyncIterator]() {
            for (const event of events) yield event;
        },
    };
}

function completedResponse(model: string) {
    return {
        id: "resp-1",
        object: "response",
        created_at: 1,
        model,
        status: "completed",
        output_text: "final answer",
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
            input_tokens: 3,
            output_tokens: 2,
            total_tokens: 5,
            input_tokens_details: { cached_tokens: 0, cache_write_tokens: 0 },
            output_tokens_details: { reasoning_tokens: 1 },
        },
    };
}

function attachMockClient(provider: OpenAIProvider | XAIProvider, events: unknown[]): void {
    const create = vi.fn(async () => makeStream(events));
    (provider as unknown as { client: unknown }).client = { responses: { create } };
}

describe("provider reasoning stream parity", () => {
    it.each([
        ["OpenAI", new OpenAIProvider(), "gpt-5.6-luna"],
        ["xAI", new XAIProvider(), "grok-4.5"],
    ])("%s suppresses unsupported reasoning visibility even when requested", async (_name, provider, model) => {
        attachMockClient(provider, [
            { type: "response.reasoning_summary_text.delta", delta: "reasoning step" },
            { type: "response.output_text.delta", delta: "final answer" },
            { type: "response.completed", response: completedResponse(model) },
        ]);

        const chunks = await collectChunks(provider.streamChat(
            [userMessage("hello")],
            { model, includeReasoning: true },
        ));
        const types = chunks.map((chunk) => chunk.type);

        expect(types).not.toContain("reasoning_start");
        expect(types).not.toContain("reasoning_delta");
        expect(types).not.toContain("reasoning_end");
        expect(types).toContain("done");
    });

    it("suppresses reasoning events when includeReasoning is disabled", async () => {
        const provider = new OpenAIProvider();
        attachMockClient(provider, [
            { type: "response.reasoning_summary_text.delta", delta: "hidden" },
            { type: "response.output_text.delta", delta: "answer" },
            { type: "response.completed", response: completedResponse("gpt-5.6-luna") },
        ]);

        const chunks = await collectChunks(provider.streamChat(
            [userMessage("hello")],
            { model: "gpt-5.6-luna", includeReasoning: false },
        ));

        expect(chunks.map((chunk) => chunk.type)).not.toContain("reasoning_delta");
        expect(chunks.at(-1)).toMatchObject({ type: "done" });
    });
});
