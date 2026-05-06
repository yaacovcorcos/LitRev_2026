import "server-only";

import { prisma } from "@/lib/server/prisma";
import type { Prisma } from "@prisma/client";
import type { RunPhase } from "@/types/agent";
import {
    getRunPhaseTransitionMatrix as getSharedRunPhaseTransitionMatrix,
    isRunPhaseTransitionAllowed as isSharedRunPhaseTransitionAllowed,
} from "@/lib/server/agent/run-state-machine";

type RunPhaseTransactionClient = Prisma.TransactionClient;

type RunPhaseRecord = {
    id: string;
    runPhase: RunPhase;
    phaseEnteredAt: Date;
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
    if (isSharedRunPhaseTransitionAllowed(currentPhase, nextPhase)) return;
    throw new Error(
        `Invalid run phase transition for ${runId}: ${currentPhase} -> ${nextPhase}`,
    );
}

export function isRunPhaseTransitionAllowed(
    currentPhase: RunPhase,
    nextPhase: RunPhase,
): boolean {
    return isSharedRunPhaseTransitionAllowed(currentPhase, nextPhase);
}

export function getRunPhaseTransitionMatrix() {
    return getSharedRunPhaseTransitionMatrix();
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
