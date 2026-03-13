import "server-only";

import type {
    RunAbnormalEndClassification,
    RunFinalizationState,
    RunStatus,
} from "@/types/agent";
import type { RunRecoveryRecommendation } from "@/types/ai";

export interface RunConvergenceSnapshot {
    status: RunStatus;
    lastActivityAt: Date;
    lastDurableProgressAt: Date;
    finalizationState: RunFinalizationState;
    abnormalEndClassification: RunAbnormalEndClassification | null;
}

export interface RunConvergenceAssessment {
    activityStale: boolean;
    durableProgressStale: boolean;
    noForwardDurableProgress: boolean;
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
            durableProgressStale: false,
            noForwardDurableProgress: false,
            abnormalEndClassification: snapshot.abnormalEndClassification,
            recoveryRecommendation: "retry",
        };
    }

    const staleCutoff = now.getTime() - staleMs;
    const activityStale = snapshot.lastActivityAt.getTime() < staleCutoff;
    const durableProgressStale =
        snapshot.lastDurableProgressAt.getTime() < staleCutoff;
    const noForwardDurableProgress =
        !activityStale &&
        durableProgressStale &&
        snapshot.finalizationState !== "in_progress";
    const abnormalEndClassification =
        snapshot.abnormalEndClassification ??
        (noForwardDurableProgress ? "no_forward_durable_progress" : null);

    if (activityStale) {
        return {
            activityStale,
            durableProgressStale,
            noForwardDurableProgress,
            abnormalEndClassification,
            recoveryRecommendation: "stop_and_retry",
        };
    }

    if (
        snapshot.finalizationState === "failed" ||
        (abnormalEndClassification &&
            USER_ACTION_CLASSIFICATIONS.has(abnormalEndClassification))
    ) {
        return {
            activityStale,
            durableProgressStale,
            noForwardDurableProgress,
            abnormalEndClassification,
            recoveryRecommendation: "stop_and_retry",
        };
    }

    return {
        activityStale,
        durableProgressStale,
        noForwardDurableProgress,
        abnormalEndClassification,
        recoveryRecommendation: "reconnect",
    };
}
