import type { StopReason } from "@/lib/agent/loop-controller";
import type { RunStatus } from "@/types/agent";

export type RunFacts = {
    hadFinalAssistantAnswer: boolean;
    hadSuccessfulToolOrArtifact: boolean;
    hadDeterministicNonRetryableFailure: boolean;
    pausedForUserInput: boolean;
    cancelledByUser: boolean;
};

const NO_ANSWER_FAILURE_STOP_REASONS = new Set<StopReason>([
    "max_iterations",
    "max_tool_calls",
    "wall_time",
    "repeat_detected",
]);

export function deriveRunOutcome(params: {
    facts: RunFacts;
    stopReason: StopReason | "natural";
}): {
    runStatus: Extract<RunStatus, "completed" | "failed" | "paused" | "cancelled">;
    stopReason: StopReason | "natural";
} {
    const { facts } = params;
    let { stopReason } = params;

    if (facts.cancelledByUser || stopReason === "cancelled") {
        return { runStatus: "cancelled", stopReason: "cancelled" };
    }

    if (facts.pausedForUserInput || stopReason === "paused_for_input") {
        return { runStatus: "paused", stopReason: "paused_for_input" };
    }

    const hasUsefulOutput =
        facts.hadFinalAssistantAnswer || facts.hadSuccessfulToolOrArtifact;

    if (
        facts.hadDeterministicNonRetryableFailure
        && !hasUsefulOutput
    ) {
        stopReason = "error";
        return { runStatus: "failed", stopReason };
    }

    if (stopReason === "error") {
        return { runStatus: "failed", stopReason };
    }

    if (!hasUsefulOutput) {
        if (NO_ANSWER_FAILURE_STOP_REASONS.has(stopReason)) {
            return { runStatus: "failed", stopReason };
        }
        if (stopReason === "natural") {
            return { runStatus: "failed", stopReason: "error" };
        }
    }

    return { runStatus: "completed", stopReason };
}

export function buildFailureFallbackMessage(message: string | null | undefined): string {
    const trimmed = message?.trim();
    if (!trimmed) {
        return "I couldn't complete that request because the action failed before I could produce a useful answer.";
    }
    return `I couldn't complete that request: ${trimmed}`;
}
