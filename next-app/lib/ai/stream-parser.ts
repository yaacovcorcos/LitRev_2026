/**
 * Shared NDJSON stream parser for AI streaming responses.
 * Used by both the copilot side panel and the popup mini-chat.
 */

import type { AIStreamChunk } from "@/types/ai";

export type StreamEvent = AIStreamChunk;

/**
 * Parse an NDJSON stream from a ReadableStreamDefaultReader.
 * Handles carry-buffer for partial lines split across chunks.
 */
export async function* parseNDJSONStream(
    reader: ReadableStreamDefaultReader<Uint8Array>,
    signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
    const decoder = new TextDecoder();
    let carry = "";

    while (true) {
        if (signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        carry += decoder.decode(value, { stream: true });
        const parts = carry.split("\n");
        carry = parts.pop() ?? "";

        for (const line of parts) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
                yield JSON.parse(trimmed) as StreamEvent;
            } catch {
                // skip malformed lines
            }
        }
    }

    // flush remaining carry
    if (carry.trim()) {
        try {
            yield JSON.parse(carry.trim()) as StreamEvent;
        } catch {
            // skip
        }
    }
}
