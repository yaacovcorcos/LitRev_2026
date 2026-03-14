import "server-only";

import { prisma } from "@/lib/server/prisma";
import type { Prisma } from "@prisma/client";
import type { RunPhase } from "@/types/agent";

type RunPhaseTransactionClient = Prisma.TransactionClient;

type RunPhaseRecord = {
    id: string;
    runPhase: RunPhase;
    phaseEnteredAt: Date;
};

const RUN_PHASE_TRANSITIONS: Record<RunPhase, readonly RunPhase[]> = {
    plan: ["ask", "act", "finalize"],
    ask: ["plan", "act", "finalize"],
    act: ["ask", "verify", "finalize"],
    verify: ["ask", "act", "finalize"],
    finalize: [],
};

async function getRunPhaseRecord(
    tx: RunPhaseTransactionClient,
    runId: string,
): Promise<RunPhaseRecord> {
    const run = await tx.agentRun.findUnique({
        where: { id: runId },
        select: {
            id: true,
            runPhase: true,
            phaseEnteredAt: true,
        },
    });

    if (!run) {
        throw new Error(`Run phase transition target not found: ${runId}`);
    }

    return {
        id: run.id,
        runPhase: run.runPhase as RunPhase,
        phaseEnteredAt: run.phaseEnteredAt,
    };
}

function assertRunPhaseTransition(
    runId: string,
    currentPhase: RunPhase,
    nextPhase: RunPhase,
) {
    if (currentPhase === nextPhase) return;
    if (RUN_PHASE_TRANSITIONS[currentPhase].includes(nextPhase)) return;
    throw new Error(
        `Invalid run phase transition for ${runId}: ${currentPhase} -> ${nextPhase}`,
    );
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

export async function transitionRunPhaseInTransaction(
    tx: RunPhaseTransactionClient,
    runId: string,
    nextPhase: RunPhase,
    at = new Date(),
): Promise<{ changed: boolean; phaseEnteredAt: Date }> {
    const run = await getRunPhaseRecord(tx, runId);
    assertRunPhaseTransition(runId, run.runPhase, nextPhase);

    if (run.runPhase === nextPhase) {
        return {
            changed: false,
            phaseEnteredAt: run.phaseEnteredAt,
        };
    }

    const result = await tx.agentRun.updateMany({
        where: { id: runId, status: "running" },
        data: {
            runPhase: nextPhase,
            phaseEnteredAt: at,
        },
    });

    if (result.count !== 1) {
        throw new Error(`Failed to persist run phase transition for ${runId}: ${run.runPhase} -> ${nextPhase}`);
    }

    return {
        changed: true,
        phaseEnteredAt: at,
    };
}

export async function transitionRunPhase(
    runId: string,
    nextPhase: RunPhase,
    at = new Date(),
): Promise<{ changed: boolean; phaseEnteredAt: Date }> {
    return prisma.$transaction((tx) => transitionRunPhaseInTransaction(tx, runId, nextPhase, at));
}
