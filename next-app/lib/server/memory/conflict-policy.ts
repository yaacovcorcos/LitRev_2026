import "server-only";

export const MEMORY_CONFLICT_THRESHOLDS = {
    // Same normalized key + different normalized value is always a deterministic contradiction.
    deterministicKeyMatch: 1,
    // Semantic contradiction guardrails:
    // similar key phrasing but meaningfully different value phrasing.
    semanticKeySimilarityMin: 0.72,
    semanticValueSimilarityMax: 0.58,
    semanticMinTextLength: 12,
} as const;

function normalize(input: string): string {
    return input
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function normalizeText(input: string): string {
    return input.trim().toLowerCase().replace(/\s+/g, " ");
}

function tokenSet(input: string): Set<string> {
    const normalized = normalize(input);
    const tokens = normalized.split("_").filter(Boolean);
    return new Set(tokens);
}

function jaccard(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const token of a) {
        if (b.has(token)) intersection += 1;
    }
    const union = new Set([...a, ...b]).size;
    return union > 0 ? intersection / union : 0;
}

function bigrams(input: string): Set<string> {
    const normalized = normalizeText(input);
    if (normalized.length < 2) return new Set([normalized]);
    const grams = new Set<string>();
    for (let index = 0; index < normalized.length - 1; index += 1) {
        grams.add(normalized.slice(index, index + 2));
    }
    return grams;
}

function diceCoefficient(a: Set<string>, b: Set<string>): number {
    if (a.size === 0 && b.size === 0) return 1;
    if (a.size === 0 || b.size === 0) return 0;
    let intersection = 0;
    for (const token of a) {
        if (b.has(token)) intersection += 1;
    }
    return (2 * intersection) / (a.size + b.size);
}

export type ConflictKind = "deterministic" | "semantic";

export function normalizedMemoryKey(input: string): string {
    return normalize(input);
}

export function normalizedMemoryValue(input: string): string {
    return normalizeText(input);
}

export function classifyMemoryConflict(
    incoming: { key: string; value: string },
    existing: { key: string; value: string },
): ConflictKind | null {
    const incomingKey = normalizedMemoryKey(incoming.key);
    const existingKey = normalizedMemoryKey(existing.key);
    const incomingValue = normalizedMemoryValue(incoming.value);
    const existingValue = normalizedMemoryValue(existing.value);

    if (!incomingKey || !existingKey || !incomingValue || !existingValue) return null;

    if (incomingKey === existingKey && incomingValue !== existingValue) {
        return "deterministic";
    }

    if (
        incomingValue.length < MEMORY_CONFLICT_THRESHOLDS.semanticMinTextLength ||
        existingValue.length < MEMORY_CONFLICT_THRESHOLDS.semanticMinTextLength
    ) {
        return null;
    }

    const keySimilarity = Math.max(
        jaccard(tokenSet(incomingKey), tokenSet(existingKey)),
        diceCoefficient(bigrams(incomingKey), bigrams(existingKey)),
    );
    const valueSimilarity = Math.max(
        jaccard(tokenSet(incomingValue), tokenSet(existingValue)),
        diceCoefficient(bigrams(incomingValue), bigrams(existingValue)),
    );

    if (
        keySimilarity >= MEMORY_CONFLICT_THRESHOLDS.semanticKeySimilarityMin &&
        valueSimilarity <= MEMORY_CONFLICT_THRESHOLDS.semanticValueSimilarityMax
    ) {
        return "semantic";
    }

    return null;
}

