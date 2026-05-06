import "server-only";

import type {
    RunEventType,
    RunFinalizationState,
    RunPhase,
    RunStatus,
} from "@/types/agent";

export type TerminalRunStatus = Extract<
    RunStatus,
    "completed" | "failed" | "cancelled" | "paused"
>;

export type RunStateSnapshot = {
    status: RunStatus;
    runPhase: RunPhase;
    finalizationState?: RunFinalizationState;
    completedAt?: Date | null;
};

export const TERMINAL_RUN_STATUSES: readonly TerminalRunStatus[] = [
    "completed",
    "failed",
    "cancelled",
    "paused",
];

/**
 * Legal phase transitions for a running AgentRun:
 *
 * plan     -> ask | act | finalize
 * ask      -> plan | act | finalize
 * act      -> ask | verify | finalize
 * verify   -> plan | ask | act | finalize
 * finalize -> terminal only
 *
 * The verify -> plan edge is intentional: a continuation run can resume from a
 * durable boundary, discover that it needs a revised plan, and re-enter planning
 * without being treated as a corrupted phase machine.
 */
export const RUN_PHASE_TRANSITIONS: Record<RunPhase, readonly RunPhase[]> = {
    plan: ["ask", "act", "finalize"],
    ask: ["plan", "act", "finalize"],
    act: ["ask", "verify", "finalize"],
    verify: ["plan", "ask", "act", "finalize"],
    finalize: [],
};

export function isTerminalRunStatus(status: string | null | undefined): status is TerminalRunStatus {
    return TERMINAL_RUN_STATUSES.includes(status as TerminalRunStatus);
}

export function isRunPhaseTransitionAllowed(
    currentPhase: RunPhase,
    nextPhase: RunPhase,
): boolean {
    return currentPhase === nextPhase || RUN_PHASE_TRANSITIONS[currentPhase].includes(nextPhase);
}

export function getRunPhaseTransitionMatrix() {
    return RUN_PHASE_TRANSITIONS;
}

export function getRunPhaseForEventType(
    type: RunEventType,
    snapshot?: RunStateSnapshot,
): RunPhase | null {
    switch (type) {
        case "plan_proposed":
            return "plan";
        case "plan_approved":
        case "tool_call":
            return "act";
        case "tool_result":
        case "artifact_proposed":
        case "artifact_reviewed":
            return "verify";
        case "user_input_required":
            return "ask";
        case "user_input_resolved":
            return snapshot?.status === "running" ? "act" : null;
        default:
            return null;
    }
}
