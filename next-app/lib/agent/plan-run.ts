import type { PlanStep } from "@/types/artifacts";

/**
 * `ask_user` pauses are intentional checkpoints, not execution failures.
 */
export function isPlanPausedForInput(
    stopReason?: string | null,
    runStatus?: string | null,
): boolean {
    return stopReason === "paused_for_input" || runStatus === "paused";
}

/**
 * Remaining unconsumed steps after a paused run should stay retryable.
 */
export function getUnconsumedPlanStepStatus(stopReason?: string | null): PlanStep["status"] {
    if (stopReason === "paused_for_input") return "pending";
    return stopReason === "natural" ? "skipped" : "failed";
}

export function shouldShowPlanFailureMessage(params: {
    success: boolean;
    aborted: boolean;
    runStatus?: string | null;
    stopReason?: string | null;
}): boolean {
    const { success, aborted, runStatus, stopReason } = params;
    if (aborted || !success) return false;
    if (runStatus === "completed") return false;
    return !isPlanPausedForInput(stopReason, runStatus);
}
