import type { AIMessage, ToolCall } from "@/types/ai";

const TOOL_CALL_ID_MAX_CHARS = 64;
const TOOL_CALL_NAME_MAX_CHARS = 64;
const TOOL_CALL_NAME_RE = /^[A-Za-z0-9_-]+$/;

export type ProviderNormalizationReport = {
    messages: AIMessage[];
    droppedInvalidToolCalls: number;
    droppedOrphanToolResults: number;
    droppedDuplicateToolResults: number;
    insertedSyntheticToolResults: number;
};

function normalizeToolCallId(
    value: string | undefined,
    assistantIndex: number,
    callIndex: number
): string {
    const trimmed = (value ?? "").trim();
    const safe = trimmed.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, TOOL_CALL_ID_MAX_CHARS);
    if (safe.length > 0) return safe;
    return `tool_call_${assistantIndex}_${callIndex}`;
}

function normalizeToolCallName(value: string | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.length > TOOL_CALL_NAME_MAX_CHARS) return null;
    if (!TOOL_CALL_NAME_RE.test(trimmed)) return null;
    return trimmed;
}

function normalizeToolArguments(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
}

function buildSyntheticToolResult(toolCallId: string): AIMessage {
    return {
        id: `synthetic-tool-result-${toolCallId}`,
        role: "tool",
        content: "Tool execution was interrupted. No result available.",
        toolResultId: toolCallId,
        createdAt: new Date().toISOString(),
    };
}

function flushPendingToolResults(
    pendingToolCalls: Map<string, string>,
    output: AIMessage[]
): number {
    let inserted = 0;
    for (const [toolCallId] of pendingToolCalls) {
        output.push(buildSyntheticToolResult(toolCallId));
        inserted += 1;
    }
    pendingToolCalls.clear();
    return inserted;
}

function normalizeAssistantToolCalls(
    message: AIMessage,
    assistantIndex: number
): { toolCalls: ToolCall[]; droppedInvalidToolCalls: number } {
    const original = message.toolCalls ?? [];
    const normalized: ToolCall[] = [];
    const usedIds = new Set<string>();
    let droppedInvalidToolCalls = 0;

    original.forEach((call, callIndex) => {
        const name = normalizeToolCallName(call.name);
        if (!name) {
            droppedInvalidToolCalls += 1;
            return;
        }
        let id = normalizeToolCallId(call.id, assistantIndex, callIndex);
        while (usedIds.has(id)) {
            id = `${id}_dup`;
        }
        usedIds.add(id);
        normalized.push({
            id,
            name,
            arguments: normalizeToolArguments(call.arguments),
        });
    });

    return { toolCalls: normalized, droppedInvalidToolCalls };
}

export function normalizeProviderMessages(messages: AIMessage[]): ProviderNormalizationReport {
    const normalizedMessages: AIMessage[] = [];
    let droppedInvalidToolCalls = 0;
    let droppedOrphanToolResults = 0;
    let droppedDuplicateToolResults = 0;
    let insertedSyntheticToolResults = 0;

    let pendingToolCalls = new Map<string, string>();
    let resolvedToolResults = new Set<string>();

    for (let i = 0; i < messages.length; i += 1) {
        const message = messages[i];

        if (message.role === "assistant" && message.toolCalls?.length) {
            if (pendingToolCalls.size > 0) {
                insertedSyntheticToolResults += flushPendingToolResults(pendingToolCalls, normalizedMessages);
                resolvedToolResults.clear();
            }

            const normalizedAssistant = normalizeAssistantToolCalls(message, i);
            droppedInvalidToolCalls += normalizedAssistant.droppedInvalidToolCalls;

            if (normalizedAssistant.toolCalls.length === 0) {
                if (message.content.trim()) {
                    normalizedMessages.push({ ...message, toolCalls: undefined });
                }
                continue;
            }

            normalizedMessages.push({ ...message, toolCalls: normalizedAssistant.toolCalls });
            pendingToolCalls = new Map(
                normalizedAssistant.toolCalls.map((toolCall) => [toolCall.id, toolCall.name])
            );
            resolvedToolResults = new Set<string>();
            continue;
        }

        if (message.role === "tool") {
            const normalizedToolResultId = normalizeToolCallId(message.toolResultId, i, 0);
            if (resolvedToolResults.has(normalizedToolResultId)) {
                droppedDuplicateToolResults += 1;
                continue;
            }
            if (pendingToolCalls.size === 0) {
                droppedOrphanToolResults += 1;
                continue;
            }
            if (!pendingToolCalls.has(normalizedToolResultId)) {
                droppedOrphanToolResults += 1;
                continue;
            }

            normalizedMessages.push({
                ...message,
                toolResultId: normalizedToolResultId,
            });
            pendingToolCalls.delete(normalizedToolResultId);
            resolvedToolResults.add(normalizedToolResultId);
            continue;
        }

        if (pendingToolCalls.size > 0) {
            insertedSyntheticToolResults += flushPendingToolResults(pendingToolCalls, normalizedMessages);
            resolvedToolResults.clear();
        }
        normalizedMessages.push(message);
    }

    if (pendingToolCalls.size > 0) {
        insertedSyntheticToolResults += flushPendingToolResults(pendingToolCalls, normalizedMessages);
    }

    return {
        messages: normalizedMessages,
        droppedInvalidToolCalls,
        droppedOrphanToolResults,
        droppedDuplicateToolResults,
        insertedSyntheticToolResults,
    };
}
