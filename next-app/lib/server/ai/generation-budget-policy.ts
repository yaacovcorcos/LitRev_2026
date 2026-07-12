import type { ProviderDialect } from "@/lib/ai/config";
import type { ReasoningEffort } from "@/types/ai";

/**
 * Completion budgets are intentionally independent from context-window budgets.
 * Reasoning models consume part of this allowance before producing visible text,
 * so the old 2K global default was too small for medium/high effort requests.
 */
export const DEFAULT_COMPLETION_TOKENS_BY_EFFORT = Object.freeze({
    fast: 4_096,
    low: 8_192,
    medium: 16_384,
    high: 32_768,
    max: 65_536,
} satisfies Record<ReasoningEffort, number>);

const DEFAULT_QWEN_REASONING_TOKENS_BY_EFFORT: Partial<Record<ReasoningEffort, number>> = Object.freeze({
    high: 16_384,
    max: 32_768,
});

export function getDefaultCompletionTokens(
    effort: ReasoningEffort,
    maxOutputTokens: number,
): number {
    return Math.min(DEFAULT_COMPLETION_TOKENS_BY_EFFORT[effort], maxOutputTokens);
}

export function getDefaultProviderReasoningBudget(
    providerDialect: ProviderDialect,
    effort: ReasoningEffort,
): number | undefined {
    if (providerDialect !== "qwen") return undefined;
    return DEFAULT_QWEN_REASONING_TOKENS_BY_EFFORT[effort];
}
