/**
 * Self-Healing JSON
 * Conservative repair for malformed JSON from AI model responses.
 * Pure utility — no server-only, no external deps. (planC Phase 7)
 */

/**
 * Attempt to parse JSON, repairing common AI malformations if needed.
 * Returns the parsed value on success, or null if unrecoverable.
 *
 * Repair steps (conservative — per Codex review):
 * 1. Fast path: raw JSON.parse
 * 2. Strip markdown code fences
 * 3. Remove trailing commas before } or ]
 * 4. Extract first JSON object from surrounding text
 *
 * Intentionally does NOT attempt brace-balancing or newline-escaping,
 * as those can produce semantically wrong JSON that routes tool calls
 * with unintended arguments.
 */
export function safeParseJson(raw: string): unknown | null {
    // 1. Fast path — try raw parse (no overhead when JSON is valid)
    try {
        return JSON.parse(raw);
    } catch {
        // continue to repair
    }

    let repaired = raw.trim();
    if (!repaired) return null;

    // 2. Strip markdown code fences (```json ... ```)
    repaired = repaired.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");

    // 3. Remove trailing commas before } or ]
    repaired = repaired.replace(/,\s*([}\]])/g, "$1");

    // 4. Try repaired string
    try {
        return JSON.parse(repaired);
    } catch {
        // continue to extraction
    }

    // 5. Last resort: extract first JSON-like object from string
    //    Regex handles limited nesting (not arbitrary depth)
    const match = repaired.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
    if (match) {
        try {
            return JSON.parse(match[0]);
        } catch {
            // give up
        }
    }

    return null;
}

/**
 * Parse tool call arguments with type narrowing.
 * Returns a Record<string, unknown> or {} on failure, with a warning.
 */
export function parseToolArgs(raw: string, toolName: string, provider: string): Record<string, unknown> {
    const parsed = safeParseJson(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
    }
    const reason = parsed === null ? "parse failed" : Array.isArray(parsed) ? "got array" : `got ${typeof parsed}`;
    console.warn(`[${provider}] Failed to parse tool args for ${toolName}: ${reason}`);
    return {};
}
