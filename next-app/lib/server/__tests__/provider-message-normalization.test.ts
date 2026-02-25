import { describe, expect, it } from "vitest";
import type { AIMessage } from "@/types/ai";
import { normalizeProviderMessages } from "@/lib/server/ai/providers/message-normalization";

function buildMessage(partial: Partial<AIMessage>): AIMessage {
    return {
        id: partial.id ?? `msg-${Math.random().toString(36).slice(2, 8)}`,
        role: partial.role ?? "user",
        content: partial.content ?? "",
        createdAt: partial.createdAt ?? new Date().toISOString(),
        ...(partial.toolCalls ? { toolCalls: partial.toolCalls } : {}),
        ...(partial.toolResultId ? { toolResultId: partial.toolResultId } : {}),
    };
}

describe("normalizeProviderMessages", () => {
    it("sanitizes tool-call IDs and drops invalid tool names", () => {
        const input: AIMessage[] = [
            buildMessage({
                role: "assistant",
                content: "Tooling",
                toolCalls: [
                    { id: "call 1", name: "search_pubmed", arguments: { q: "x" } },
                    { id: "call-2", name: "bad tool name", arguments: {} },
                ],
            }),
            buildMessage({ role: "tool", content: "ok", toolResultId: "call_1" }),
        ];

        const normalized = normalizeProviderMessages(input);
        const assistant = normalized.messages.find((m) => m.role === "assistant");
        expect(assistant?.toolCalls).toHaveLength(1);
        expect(assistant?.toolCalls?.[0]?.id).toBe("call_1");
        expect(normalized.droppedInvalidToolCalls).toBe(1);
    });

    it("inserts synthetic tool results when a new non-tool message arrives before completion", () => {
        const input: AIMessage[] = [
            buildMessage({
                role: "assistant",
                content: "calling tool",
                toolCalls: [{ id: "call-1", name: "search_pubmed", arguments: { q: "x" } }],
            }),
            buildMessage({ role: "user", content: "next turn" }),
        ];

        const normalized = normalizeProviderMessages(input);
        expect(normalized.insertedSyntheticToolResults).toBe(1);
        expect(normalized.messages[1]?.role).toBe("tool");
        expect(normalized.messages[1]?.toolResultId).toBe("call-1");
        expect(normalized.messages[2]?.role).toBe("user");
    });

    it("drops orphan and duplicate tool results", () => {
        const input: AIMessage[] = [
            buildMessage({
                role: "assistant",
                content: "calling tool",
                toolCalls: [{ id: "call-1", name: "search_pubmed", arguments: { q: "x" } }],
            }),
            buildMessage({ role: "tool", content: "first", toolResultId: "call-1" }),
            buildMessage({ role: "tool", content: "duplicate", toolResultId: "call-1" }),
            buildMessage({ role: "tool", content: "orphan", toolResultId: "missing-id" }),
        ];

        const normalized = normalizeProviderMessages(input);
        const toolMessages = normalized.messages.filter((m) => m.role === "tool");
        expect(toolMessages).toHaveLength(1);
        expect(toolMessages[0]?.content).toBe("first");
        expect(normalized.droppedDuplicateToolResults).toBe(1);
        expect(normalized.droppedOrphanToolResults).toBe(1);
    });
});
