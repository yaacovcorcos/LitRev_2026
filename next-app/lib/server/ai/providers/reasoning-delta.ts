type UnknownRecord = Record<string, unknown>;

const REASONING_PART_TYPES = new Set([
    "reasoning",
    "reasoning_content",
    "thinking",
    "thinking_content",
    "summary",
]);

function isRecord(value: unknown): value is UnknownRecord {
    return typeof value === "object" && value !== null;
}

function collectText(value: unknown, out: string[]): void {
    if (typeof value === "string") {
        if (value.length > 0) out.push(value);
        return;
    }

    if (Array.isArray(value)) {
        for (const item of value) collectText(item, out);
        return;
    }

    if (!isRecord(value)) return;

    const directKeys = ["text", "thinking", "reasoning", "output_text", "summary"];
    for (const key of directKeys) {
        const maybeText = value[key];
        if (typeof maybeText === "string" && maybeText.length > 0) {
            out.push(maybeText);
        }
    }

    const nestedKeys = ["content", "summary"];
    for (const key of nestedKeys) {
        const nested = value[key];
        if (nested !== undefined && typeof nested !== "string") {
            collectText(nested, out);
        }
    }
}

/**
 * Extract reasoning/thinking deltas from OpenAI-compatible provider chunks.
 * Providers differ in field names, so we normalize several known variants.
 */
export function extractReasoningTextsFromDelta(delta: unknown): string[] {
    if (!isRecord(delta)) return [];

    const reasoningTexts: string[] = [];
    const reasoningFields = [
        "reasoning",
        "reasoning_content",
        "thinking",
        "thinking_content",
        "reasoning_text",
        "reasoningText",
    ];

    for (const field of reasoningFields) {
        collectText(delta[field], reasoningTexts);
    }

    const content = delta.content;
    if (Array.isArray(content)) {
        for (const part of content) {
            if (!isRecord(part)) continue;
            const partType = typeof part.type === "string" ? part.type.toLowerCase() : "";
            if (!REASONING_PART_TYPES.has(partType)) continue;
            collectText(part, reasoningTexts);
        }
    }

    return reasoningTexts;
}

