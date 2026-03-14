import "server-only";

import type {
    RunAbnormalEndClassification,
    RunDurabilityState,
    RunFinalizationState,
    RunPhase,
    RunStatus,
} from "@/types/agent";
import type { RunRecoveryRecommendation } from "@/types/ai";

export interface RunConvergenceSnapshot {
    status: RunStatus;
    runPhase: RunPhase;
    phaseEnteredAt: Date;
    lastActivityAt: Date;
    lastDurableProgressAt: Date;
    durabilityState: RunDurabilityState;
    durabilityDegradedReason: string | null;
    finalizationState: RunFinalizationState;
    abnormalEndClassification: RunAbnormalEndClassification | null;
}

export interface RunConvergenceAssessment {
    activityStale: boolean;
    phaseStale: boolean;
    durableProgressStale: boolean;
    noForwardDurableProgress: boolean;
    durabilityDegraded: boolean;
    abnormalEndClassification: RunAbnormalEndClassification | null;
    recoveryRecommendation: RunRecoveryRecommendation;
}

const USER_ACTION_CLASSIFICATIONS = new Set<RunAbnormalEndClassification>([
    "finalization_failed",
    "recovery_required_persistence_failed",
    "no_forward_durable_progress",
]);

export function assessRunConvergence(
    snapshot: RunConvergenceSnapshot,
    now: Date,
    staleMs: number,
): RunConvergenceAssessment {
    if (snapshot.status !== "running") {
        return {
            activityStale: false,
            phaseStale: false,
            durableProgressStale: false,
            noForwardDurableProgress: false,
            durabilityDegraded: false,
            abnormalEndClassification: snapshot.abnormalEndClassification,
            recoveryRecommendation: "terminal",
        };
    }

    const staleCutoff = now.getTime() - staleMs;
    const activityStale = snapshot.lastActivityAt.getTime() < staleCutoff;
    const phaseStale = snapshot.phaseEnteredAt.getTime() < staleCutoff;
    const durableProgressStale =
        snapshot.lastDurableProgressAt.getTime() < staleCutoff;
    const durabilityDegraded = snapshot.durabilityState === "degraded";
    const finalizationAppearsStuck =
        snapshot.runPhase === "finalize"
        && snapshot.finalizationState === "in_progress"
        && phaseStale;
    const noForwardDurableProgress =
        snapshot.runPhase !== "finalize" &&
        !activityStale &&
        durableProgressStale &&
        snapshot.finalizationState !== "in_progress";
    const abnormalEndClassification =
        snapshot.abnormalEndClassification ??
        (finalizationAppearsStuck ? "finalization_failed" : null) ??
        (durabilityDegraded ? "recovery_required_persistence_failed" : null) ??
        (noForwardDurableProgress ? "no_forward_durable_progress" : null);

    if (snapshot.runPhase === "ask") {
        return {
            activityStale,
            phaseStale,
            durableProgressStale,
            noForwardDurableProgress: false,
            durabilityDegraded,
            abnormalEndClassification,
            recoveryRecommendation: "stop_and_retry",
        };
    }

    if (activityStale) {
        return {
            activityStale,
            phaseStale,
            durableProgressStale,
            noForwardDurableProgress,
            durabilityDegraded,
            abnormalEndClassification,
            recoveryRecommendation: "stop_and_retry",
        };
    }

    if (
        finalizationAppearsStuck ||
        durabilityDegraded ||
        snapshot.finalizationState === "failed" ||
        (abnormalEndClassification &&
            USER_ACTION_CLASSIFICATIONS.has(abnormalEndClassification))
    ) {
        return {
            activityStale,
            phaseStale,
            durableProgressStale,
            noForwardDurableProgress,
            durabilityDegraded,
            abnormalEndClassification,
            recoveryRecommendation: "stop_and_retry",
        };
    }

    return {
        activityStale,
        phaseStale,
        durableProgressStale,
        noForwardDurableProgress,
        durabilityDegraded,
        abnormalEndClassification,
        recoveryRecommendation: "reconnect",
    };
}
