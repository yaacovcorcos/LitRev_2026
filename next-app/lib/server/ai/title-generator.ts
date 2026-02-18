/**
 * Conversation title helpers.
 * Keep logic here pure and testable; network calls happen in ai-service.ts.
 */

const MAX_WORDS = 8;
const MAX_CHARS = 72;

function trimToWords(input: string, maxWords: number): string {
    const words = input.split(/\s+/).filter(Boolean).slice(0, maxWords);
    return words.join(" ");
}

function trimToChars(input: string, maxChars: number): string {
    if (input.length <= maxChars) return input;
    return `${input.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

export function buildFallbackConversationTitle(seed: string): string {
    const cleaned = seed.replace(/\s+/g, " ").trim();
    if (!cleaned) return "New conversation";
    const wordsClamped = trimToWords(cleaned, MAX_WORDS);
    return trimToChars(wordsClamped, MAX_CHARS);
}

export function sanitizeGeneratedConversationTitle(rawTitle: string, fallbackSeed: string): string {
    const fallback = buildFallbackConversationTitle(fallbackSeed);
    if (!rawTitle || typeof rawTitle !== "string") return fallback;

    const firstLine = rawTitle.split(/\r?\n/)[0] ?? "";
    const withoutPrefix = firstLine.replace(/^title\s*:\s*/i, "");
    const noQuotes = withoutPrefix.replace(/^["'`]+|["'`]+$/g, "");
    const normalized = noQuotes.replace(/\s+/g, " ").trim();
    if (!normalized) return fallback;

    const wordsClamped = trimToWords(normalized, MAX_WORDS);
    const charsClamped = trimToChars(wordsClamped, MAX_CHARS);
    return charsClamped || fallback;
}
