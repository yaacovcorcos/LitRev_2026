import { describe, expect, it, vi } from "vitest";
import type { AIMessage, AIStreamChunk } from "@/types/ai";
import { GoogleProvider } from "@/lib/server/ai/providers/google";
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

function makeStream(chunks: unknown[]): AsyncIterable<unknown> {
  return {
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) {
        yield chunk;
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

type ProviderCase = {
  label: string;
  createProvider: () => OpenAIProvider | GoogleProvider | XAIProvider;
};

const providerCases: ProviderCase[] = [
  {
    label: "OpenAI",
    createProvider: () => new OpenAIProvider(),
  },
  {
    label: "Google",
    createProvider: () => new GoogleProvider(),
  },
  {
    label: "xAI",
    createProvider: () => new XAIProvider(),
  },
];

describe("provider stream tool-call delta assembly", () => {
  it.each(providerCases)("$label rebuilds streamed tool calls into a final parsed ToolCall", async ({ createProvider }) => {
    const create = vi.fn().mockResolvedValue(
      makeStream([
        {
          model: "provider-model",
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_1",
                    function: { name: "search_pub", arguments: "{\"query\":\"heart" },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        },
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { name: "med", arguments: " disease\"}" },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        },
      ]),
    );

    const provider = createProvider();
    ((provider as unknown) as { client: unknown }).client = { chat: { completions: { create } } };

    const chunks = await collectChunks(provider.streamChat([userMessage("Find relevant studies")], { model: "gpt-5.2" }));

    expect(create).toHaveBeenCalledTimes(1);
    expect(chunks).toContainEqual({
      type: "tool_call",
      toolCall: {
        id: "call_1",
        name: "search_pubmed",
        arguments: { query: "heart disease" },
      },
    });
    expect(chunks.at(-1)).toMatchObject({
      type: "done",
      content: "",
      actualModel: "provider-model",
      actualModelSource: "provider",
    });
  });
});
