import type { AIErrorEnvelope } from "@/types/ai";

type ProviderTerminationKind = "incomplete" | "truncated" | "blocked" | "unexpected";

function classifyTerminationReason(reason: string): ProviderTerminationKind {
    const normalized = reason.toLowerCase();
    if (
        normalized === "length"
        || normalized === "max_tokens"
        || normalized === "max_output_tokens"
        || normalized === "model_context_window_exceeded"
    ) {
        return "truncated";
    }
    if (
        normalized === "content_filter"
        || normalized === "refusal"
        || normalized === "safety"
        || normalized === "recitation"
        || normalized === "blocklist"
        || normalized === "prohibited_content"
        || normalized === "spii"
    ) {
        return "blocked";
    }
    return "unexpected";
}

export function createProviderTerminationError(params: {
    provider: string;
    reason?: string | null;
}): AIErrorEnvelope {
    const reason = params.reason?.trim();
    const kind = reason ? classifyTerminationReason(reason) : "incomplete";
    const code = kind === "incomplete"
        ? "PROVIDER_STREAM_INCOMPLETE"
        : kind === "truncated"
            ? "PROVIDER_RESPONSE_TRUNCATED"
            : kind === "blocked"
                ? "PROVIDER_RESPONSE_BLOCKED"
                : "PROVIDER_RESPONSE_STOPPED";
    const message = kind === "incomplete"
        ? `${params.provider} ended the stream without a terminal completion signal.`
        : kind === "truncated"
            ? `${params.provider} stopped before the response was complete (${reason}).`
            : kind === "blocked"
                ? `${params.provider} stopped the response because of provider policy (${reason}).`
                : `${params.provider} stopped with an unsupported terminal reason (${reason}).`;

    return {
        kind: "provider_request",
        code,
        // A length/max-token stop is deterministic for identical input and
        // limits. Blind retry would repeat the same truncation and multiply
        // latency/cost; adaptive continuation must be explicit at the caller.
        retryable: kind === "incomplete",
        source: "provider_request",
        message,
    };
}

export function isCompatibleSuccessFinishReason(reason: string | null | undefined): boolean {
    return reason === "stop" || reason === "tool_calls";
}

export function isAnthropicSuccessStopReason(reason: string | null | undefined): boolean {
    return reason === "end_turn" || reason === "stop_sequence" || reason === "tool_use";
}
