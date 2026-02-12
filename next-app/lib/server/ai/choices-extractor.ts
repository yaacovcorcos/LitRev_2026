/**
 * Choices Extractor
 * Server-side stream wrapper that intercepts <choices> XML from AI content.
 * Content before the block streams normally; the block itself is never yielded
 * as content — instead a dedicated "choices" event is emitted at stream end.
 */

import type { ChoiceOption, AIStreamChunk } from "@/types/ai";

const MIN_CHOICES = 2;
const MAX_CHOICES = 5;
const MAX_LABEL_LENGTH = 80;
const OPEN_TAG = "<choices";
const HOLDBACK = OPEN_TAG.length; // enough to detect tag split across chunks

/**
 * Parse a <choices>...</choices> XML string into validated ChoiceOption[].
 * Returns [] if parsing or validation fails (graceful fallback).
 */
export function parseChoicesBlock(xml: string): ChoiceOption[] {
    const choiceRegex = /<choice(?:\s+icon="([^"]*)")?\s*>([\s\S]*?)<\/choice>/gi;
    const choices: ChoiceOption[] = [];
    const seenValues = new Set<string>();
    let m: RegExpExecArray | null;

    while ((m = choiceRegex.exec(xml)) !== null) {
        const label = m[2]
            .trim()
            .replace(/<[^>]+>/g, "") // strip HTML
            .slice(0, MAX_LABEL_LENGTH);
        if (!label || seenValues.has(label)) continue;
        seenValues.add(label);
        choices.push({ label, value: label, icon: m[1] || undefined });
    }

    if (choices.length < MIN_CHOICES || choices.length > MAX_CHOICES) return [];
    return choices;
}

/**
 * Wrap a provider stream to intercept <choices> XML.
 *
 * State machine:
 *   STREAMING → content passes through with HOLDBACK trailing chars retained
 *   BUFFERING → <choices detected, all subsequent content buffered silently
 *   (end)     → parse buffered XML → yield choices event or flush as content
 *
 * Non-content chunks (tool_call, done, error, etc.) always pass through.
 * On stream abort, incomplete buffer is discarded — no choices emitted.
 */
export async function* withChoicesExtraction(
    stream: AsyncIterable<AIStreamChunk>,
): AsyncGenerator<AIStreamChunk> {
    let accumulated = "";
    let yieldedUpTo = 0;
    let choicesStartIdx = -1;
    const deferredChunks: AIStreamChunk[] = []; // buffer terminal chunks so they emit after held-back content

    for await (const chunk of stream) {
        if (chunk.type !== "content" || !chunk.content) {
            // Defer "done" so it arrives after any held-back content is flushed
            if (chunk.type === "done") {
                deferredChunks.push(chunk);
            } else {
                yield chunk;
            }
            continue;
        }

        accumulated += chunk.content;

        if (choicesStartIdx >= 0) {
            // Already inside choices block — buffer silently
            continue;
        }

        // Case-insensitive search for opening tag
        const idx = accumulated.toLowerCase().indexOf(OPEN_TAG.toLowerCase());
        if (idx >= 0) {
            choicesStartIdx = idx;
            // Yield only the clean content before the tag
            const safe = accumulated.substring(yieldedUpTo, idx);
            if (safe) yield { type: "content", content: safe };
            yieldedUpTo = accumulated.length;
            continue;
        }

        // No tag yet — yield content but hold back trailing chars
        const safeEnd = Math.max(yieldedUpTo, accumulated.length - HOLDBACK);
        const safe = accumulated.substring(yieldedUpTo, safeEnd);
        if (safe) yield { type: "content", content: safe };
        yieldedUpTo = safeEnd;
    }

    // Stream ended — process results
    if (choicesStartIdx >= 0) {
        const choicesXml = accumulated.substring(choicesStartIdx);
        const parsed = parseChoicesBlock(choicesXml);
        if (parsed.length > 0) {
            yield { type: "choices", choices: parsed };
        } else {
            // Validation failed — strip XML tags so raw markup never reaches the user
            const remaining = accumulated.substring(choicesStartIdx)
                .replace(/<[^>]+>/g, " ")
                .replace(/\s{2,}/g, " ")
                .trim();
            if (remaining) yield { type: "content", content: remaining };
        }
    } else {
        // No choices block — flush any held-back content
        const remaining = accumulated.substring(yieldedUpTo);
        if (remaining) yield { type: "content", content: remaining };
    }

    // Emit deferred terminal chunks (done) after all content has been flushed
    for (const d of deferredChunks) yield d;
}
