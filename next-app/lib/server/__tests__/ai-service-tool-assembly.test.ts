import { describe, expect, it, vi } from "vitest";
import type { AIMessage, ToolDefinition } from "@/types/ai";
import { AIService } from "@/lib/server/ai/ai-service";

function createTool(name: string): ToolDefinition {
    return {
        name,
        description: `${name} tool`,
        parameters: {},
    };
}

describe("AIService streamChatWithTools tool assembly", () => {
    it("ignores untrusted tool overrides and uses contextual general-mode tools", async () => {
        const service = new AIService();
        const streamChat = vi
            .spyOn(service, "streamChat")
            .mockImplementation(async function* (_messages, options) {
                yield {
                    type: "done",
                    content: "done",
                    stopReason: "natural",
                    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                    _capturedToolNames: options?.tools?.map((tool) => tool.name) ?? [],
                } as never;
            });

        const messages: AIMessage[] = [
            {
                id: "msg-1",
                role: "user",
                content: "search broadly",
                createdAt: new Date().toISOString(),
            },
        ];

        const chunks = [];
        for await (const chunk of service.streamChatWithTools(messages, {
            agentMode: "general",
            tools: [createTool("update_protocol")],
        })) {
            chunks.push(chunk);
        }

        const passedToolNames = streamChat.mock.calls[0]?.[1]?.tools?.map((tool) => tool.name) ?? [];
        expect(passedToolNames).not.toContain("update_protocol");
        expect(passedToolNames).toContain("search_pubmed");
    });

    it("honors trusted curated tool overrides when explicitly marked", async () => {
        const service = new AIService();
        const streamChat = vi
            .spyOn(service, "streamChat")
            .mockImplementation(async function* (_messages, options) {
                yield {
                    type: "done",
                    content: "done",
                    stopReason: "natural",
                    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
                } as never;
            });

        const messages: AIMessage[] = [
            {
                id: "msg-2",
                role: "user",
                content: "popup",
                createdAt: new Date().toISOString(),
            },
        ];

        for await (const _chunk of service.streamChatWithTools(messages, {
            projectId: "project-1",
            agentMode: "general",
            tools: [createTool("read_protocol")],
            toolDefinitionsTrusted: true,
        })) {
            // drain
        }

        const passedToolNames = streamChat.mock.calls[0]?.[1]?.tools?.map((tool) => tool.name) ?? [];
        expect(passedToolNames).toEqual(["read_protocol"]);
    });
});
