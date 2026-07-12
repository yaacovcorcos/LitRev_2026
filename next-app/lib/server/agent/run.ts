/**
 * AgentRun Lifecycle
 * Creates, updates, and completes agent runs (planC Phase 0.5)
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";
import { logServerError } from "@/lib/server/logging";
import type { Prisma } from "@prisma/client";
import type {
    AgentMode,
    RunAbnormalEndClassification,
    RunFinalizationState,
    RunPhase,
    RunStatus,
    RunTrigger,
} from "@/types/agent";
import { extractMemoriesFromConversation } from "@/lib/server/memory/conversation-extractor";
import { transitionRunPhaseInTransaction } from "@/lib/server/agent/run-phase";

export interface StartRunInput {
    projectId?: string | null;
    conversationId?: string;
    userId?: string;
    parentRunId?: string;
    rootRunId?: string;
    trigger: RunTrigger;
    agentMode: AgentMode;
    model?: string;
    provider?: string;
    reasoningEffort?: string;
    deliveryMode?: string;
    initialPhase?: RunPhase;
}

export interface RunLineageNode {
    id: string;
    projectId: string | null;
    conversationId: string | null;
    userId: string | null;
    parentRunId: string | null;
    rootRunId: string | null;
    trigger: RunTrigger;
    agentMode: AgentMode;
    status: RunStatus;
    model: string | null;
    provider: string | null;
    reasoningEffort: string | null;
    deliveryMode: string | null;
    actualModel: string | null;
    actualProvider: string | null;
    actualReasoningEffort: string | null;
    actualDeliveryMode: string | null;
    costTokensIn: number;
    costTokensOut: number;
    startedAt: string;
    completedAt: string | null;
    children: RunLineageNode[];
}

export const RUN_HEARTBEAT_INTERVAL_MS = 15_000;

type RunWriteTransactionClient = Prisma.TransactionClient;
type RunWritableStatus = Extract<RunStatus, "running" | "paused">;

type RunWriteSnapshot = {
    id: string;
    status: RunStatus;
    runPhase: RunPhase;
    completedAt: Date | null;
    finalizationState: RunFinalizationState;
};

export class RunOwnershipError extends Error {
    readonly name = "RunOwnershipError";
    readonly code = "RUN_OWNERSHIP_LOST";
    readonly runId: string;
    readonly status: RunStatus | null;
    readonly completedAt: string | null;
    readonly finalizationState: RunFinalizationState | null;

    constructor(params: {
        runId: string;
        status: RunStatus | null;
        completedAt: Date | null;
        finalizationState: RunFinalizationState | null;
    }) {
        const statusLabel = params.status ?? "missing";
        const finalizationLabel = params.finalizationState ?? "unknown";
        super(
            `Run ${params.runId} is no longer writable (status=${statusLabel}, finalizationState=${finalizationLabel}).`,
        );
        this.runId = params.runId;
        this.status = params.status;
        this.completedAt = params.completedAt?.toISOString() ?? null;
        this.finalizationState = params.finalizationState;
    }
}

export function isRunOwnershipError(error: unknown): error is RunOwnershipError {
    return error instanceof RunOwnershipError;
}

async function getRunWriteSnapshot(
    client: Pick<RunWriteTransactionClient, "agentRun">,
    runId: string,
): Promise<RunWriteSnapshot | null> {
    const run = await client.agentRun.findUnique({
        where: { id: runId },
        select: {
            id: true,
            status: true,
            runPhase: true,
            completedAt: true,
            finalizationState: true,
        },
    });
    if (!run) return null;
    return {
        id: run.id,
        status: run.status as RunStatus,
        runPhase: run.runPhase as RunPhase,
        completedAt: run.completedAt,
        finalizationState: run.finalizationState as RunFinalizationState,
    };
}

async function throwRunOwnershipError(
    client: Pick<RunWriteTransactionClient, "agentRun">,
    runId: string,
): Promise<never> {
    const snapshot = await getRunWriteSnapshot(client, runId);
    throw new RunOwnershipError({
        runId,
        status: snapshot?.status ?? null,
        completedAt: snapshot?.completedAt ?? null,
        finalizationState: snapshot?.finalizationState ?? null,
    });
}

export async function assertRunWritableInTransaction(
    tx: RunWriteTransactionClient,
    params: {
        runId: string;
        allowedStatuses: RunWritableStatus[];
        requireIncomplete?: boolean;
        allowedFinalizationStates?: RunFinalizationState[];
        at?: Date;
    },
): Promise<RunWriteSnapshot> {
    const snapshot = await getRunWriteSnapshot(tx, params.runId);
    const allowedStatus = snapshot
        ? params.allowedStatuses.includes(snapshot.status as RunWritableStatus)
        : false;
    const incomplete = !params.requireIncomplete || snapshot?.completedAt === null;
    const allowedFinalization = !params.allowedFinalizationStates
        || (
            snapshot
            && params.allowedFinalizationStates.includes(snapshot.finalizationState)
        );

    if (snapshot && allowedStatus && incomplete && allowedFinalization) {
        return snapshot;
    }
    return throwRunOwnershipError(tx, params.runId);
}

type RunActivityListener = (at: Date) => void;

const runActivityListeners = new Map<string, Set<RunActivityListener>>();

function notifyRunActivity(runId: string, at: Date) {
    const listeners = runActivityListeners.get(runId);
    if (!listeners || listeners.size === 0) return;
    for (const listener of listeners) {
        listener(at);
    }
}

export function noteObservedRunActivity(runId: string, at: Date) {
    notifyRunActivity(runId, at);
}

function subscribeRunActivity(runId: string, listener: RunActivityListener) {
    const listeners = runActivityListeners.get(runId) ?? new Set<RunActivityListener>();
    listeners.add(listener);
    runActivityListeners.set(runId, listeners);

    return () => {
        const activeListeners = runActivityListeners.get(runId);
        if (!activeListeners) return;
        activeListeners.delete(listener);
        if (activeListeners.size === 0) {
            runActivityListeners.delete(runId);
        }
    };
}

export async function touchRunActivity(runId: string, at = new Date()) {
    const result = await prisma.agentRun.updateMany({
        where: { id: runId, status: "running" },
        data: { lastActivityAt: at },
    });
    if (result.count > 0) {
        notifyRunActivity(runId, at);
    }
    return result.count;
}

export async function markRunFinalizationState(
    runId: string,
    state: RunFinalizationState,
    at = new Date(),
) {
    const result = state === "in_progress"
        ? await prisma.$transaction(async (tx) => {
            await assertRunWritableInTransaction(tx, {
                runId,
                allowedStatuses: ["running"],
                requireIncomplete: true,
                allowedFinalizationStates: ["not_started", "in_progress"],
                at,
            });
            await transitionRunPhaseInTransaction(tx, runId, "finalize", at);
            return tx.agentRun.updateMany({
                where: {
                    id: runId,
                    status: "running",
                    completedAt: null,
                },
                data: {
                    finalizationState: state,
                    lastActivityAt: at,
                },
            });
        })
        : await prisma.agentRun.updateMany({
            where: {
                id: runId,
                status: "running",
                completedAt: null,
            },
            data: {
                finalizationState: state,
                lastActivityAt: at,
            },
        });
    if (result.count > 0) {
        notifyRunActivity(runId, at);
    }
    return result.count;
}

export async function markRunAbnormalEndClassification(
    runId: string,
    classification: RunAbnormalEndClassification,
    options?: Date | { at?: Date; requireActive?: boolean },
) {
    const at = options instanceof Date ? options : options?.at ?? new Date();
    const requireActive = options instanceof Date ? false : options?.requireActive ?? false;
    const result = await prisma.agentRun.updateMany({
        where: {
            id: runId,
            status: "running",
            completedAt: null,
        },
        data: {
            abnormalEndClassification: classification,
            lastActivityAt: at,
        },
    });
    if (result.count > 0) {
        notifyRunActivity(runId, at);
        return result.count;
    }
    if (requireActive) {
        await throwRunOwnershipError({ agentRun: prisma.agentRun }, runId);
    }
    return result.count;
}

export async function markRunDurabilityDegraded(
    runId: string,
    reason: string,
    options?: Date | { at?: Date; requireActive?: boolean },
) {
    const at = options instanceof Date ? options : options?.at ?? new Date();
    const requireActive = options instanceof Date ? false : options?.requireActive ?? false;
    const result = await prisma.agentRun.updateMany({
        where: {
            id: runId,
            status: "running",
            completedAt: null,
        },
        data: {
            durabilityState: "degraded",
            durabilityDegradedReason: reason,
            abnormalEndClassification: "recovery_required_persistence_failed",
            lastActivityAt: at,
        },
    });
    if (result.count > 0) {
        notifyRunActivity(runId, at);
        return result.count;
    }
    if (requireActive) {
        await throwRunOwnershipError({ agentRun: prisma.agentRun }, runId);
    }
    return result.count;
}

export async function markRunFinalizationFailed(
    runId: string,
    options?: Date | { at?: Date; requireActive?: boolean },
) {
    const at = options instanceof Date ? options : options?.at ?? new Date();
    const requireActive = options instanceof Date ? false : options?.requireActive ?? false;
    const result = await prisma.agentRun.updateMany({
        where: {
            id: runId,
            status: "running",
            completedAt: null,
        },
        data: {
            finalizationState: "failed",
            abnormalEndClassification: "finalization_failed",
            lastActivityAt: at,
        },
    });
    if (result.count > 0) {
        notifyRunActivity(runId, at);
        return result.count;
    }
    if (requireActive) {
        await throwRunOwnershipError({ agentRun: prisma.agentRun }, runId);
    }
    return result.count;
}

export interface RunHeartbeatController {
    stop(): void;
}

export function startRunHeartbeat(
    runId: string,
    options?: {
        intervalMs?: number;
        now?: () => Date;
        touch?: typeof touchRunActivity;
        onError?: (error: unknown) => void;
        schedule?: typeof setInterval;
        cancel?: typeof clearInterval;
    },
): RunHeartbeatController {
    const intervalMs = options?.intervalMs ?? RUN_HEARTBEAT_INTERVAL_MS;
    const getNow = options?.now ?? (() => new Date());
    const heartbeatTouch = options?.touch ?? touchRunActivity;
    const schedule = options?.schedule ?? setInterval;
    const cancel = options?.cancel ?? clearInterval;
    let lastObservedActivityAt = getNow().getTime();
    let stopped = false;
    let inFlight = false;

    const unsubscribe = subscribeRunActivity(runId, (at) => {
        lastObservedActivityAt = at.getTime();
    });

    const timer = schedule(async () => {
        if (stopped || inFlight) return;
        const now = getNow();
        if (now.getTime() - lastObservedActivityAt < intervalMs) return;
        inFlight = true;
        try {
            const updatedCount = await heartbeatTouch(runId, now);
            if (updatedCount > 0) {
                lastObservedActivityAt = now.getTime();
            }
        } catch (error) {
            options?.onError?.(error);
        } finally {
            inFlight = false;
        }
    }, intervalMs);
    if (typeof (timer as { unref?: () => void }).unref === "function") {
        (timer as { unref: () => void }).unref();
    }

    return {
        stop() {
            if (stopped) return;
            stopped = true;
            unsubscribe();
            cancel(timer);
        },
    };
}

/**
 * Start a new agent run
 */
export async function startRun(input: StartRunInput) {
    const startedAt = new Date();
    let lineageRootRunId = input.rootRunId ?? null;

    if (input.parentRunId && !lineageRootRunId) {
        const parentRun = await prisma.agentRun.findUnique({
            where: { id: input.parentRunId },
            select: { id: true, projectId: true, rootRunId: true },
        });

        if (!parentRun) {
            throw new Error(`Parent run not found: ${input.parentRunId}`);
        }
        if (parentRun.projectId && input.projectId && parentRun.projectId !== input.projectId) {
            throw new Error("Parent run project does not match child run project");
        }

        lineageRootRunId = parentRun.rootRunId ?? parentRun.id;
    }

    return prisma.agentRun.create({
        data: {
            projectId: input.projectId ?? undefined,
            conversationId: input.conversationId ?? undefined,
            userId: input.userId ?? undefined,
            parentRunId: input.parentRunId ?? undefined,
            rootRunId: lineageRootRunId ?? undefined,
            trigger: input.trigger,
            agentMode: input.agentMode,
            status: "running",
            model: input.model ?? undefined,
            provider: input.provider ?? undefined,
            reasoningEffort: input.reasoningEffort ?? undefined,
            deliveryMode: input.deliveryMode ?? undefined,
            startedAt,
            runPhase: input.initialPhase ?? "plan",
            phaseEnteredAt: startedAt,
            lastActivityAt: startedAt,
            lastDurableProgressAt: startedAt,
            durabilityState: "durable",
            durabilityDegradedReason: null,
            finalizationState: "not_started",
        },
    });
}

/**
 * Record the provider-observed generation receipt without changing run
 * lifecycle ownership. Repeated calls are safe and keep the latest truthful
 * provider response for recovery and diagnostics.
 */
export async function recordRunGenerationReceipt(
    runId: string,
    receipt: {
        actualModel?: string | null;
        actualProvider?: string | null;
        actualReasoningEffort?: string | null;
        actualDeliveryMode?: string | null;
    },
): Promise<void> {
    await prisma.agentRun.updateMany({
        where: {
            id: runId,
            status: "running",
            completedAt: null,
        },
        data: {
            ...(receipt.actualModel ? { actualModel: receipt.actualModel } : {}),
            ...(receipt.actualProvider ? { actualProvider: receipt.actualProvider } : {}),
            ...(receipt.actualReasoningEffort ? { actualReasoningEffort: receipt.actualReasoningEffort } : {}),
            ...(receipt.actualDeliveryMode ? { actualDeliveryMode: receipt.actualDeliveryMode } : {}),
        },
    });
}

/**
 * End a run with final status and token counts
 */
export async function endRun(
    runId: string,
    status: Extract<RunStatus, "completed" | "failed" | "cancelled" | "paused">,
    costTokensIn?: number,
    costTokensOut?: number
) {
    const completedAt = new Date();
    const existing = await prisma.agentRun.findUnique({
        where: { id: runId },
        select: { durabilityState: true },
    });
    const preserveAbnormalClassification =
        existing?.durabilityState === "degraded";
    const updated = await prisma.agentRun.updateMany({
        where: {
            id: runId,
            status: "running",
            completedAt: null,
        },
        data: {
            status,
            completedAt,
            lastActivityAt: completedAt,
            lastDurableProgressAt: completedAt,
            finalizationState: "completed",
            ...(status === "completed" && !preserveAbnormalClassification
                ? { abnormalEndClassification: null }
                : {}),
            ...(costTokensIn !== undefined ? { costTokensIn } : {}),
            ...(costTokensOut !== undefined ? { costTokensOut } : {}),
        },
    });
    if (updated.count !== 1) {
        await throwRunOwnershipError({ agentRun: prisma.agentRun }, runId);
    }
    const run = await prisma.agentRun.findUnique({
        where: { id: runId },
    });
    if (!run) {
        throw new Error(`Run not found after finalization: ${runId}`);
    }
    notifyRunActivity(runId, completedAt);

    // Fire-and-forget: extract memories from completed conversations
    if (status === "completed" && run.conversationId && run.projectId) {
        scheduleMemoryExtraction(run.id, run.conversationId, run.projectId, run.userId ?? undefined)
            .catch((err) => logServerError("conversation-extractor", "memory extraction failed", {
                conversationId: run.conversationId,
            }, err));
    }

    return run;
}

async function scheduleMemoryExtraction(
    runId: string,
    conversationId: string,
    projectId: string,
    userId?: string,
) {
    const count = await prisma.aIMessage.count({
        where: { conversationId, role: { in: ["user", "assistant"] } },
    });
    if (count >= 5) {
        await extractMemoriesFromConversation(conversationId, projectId, runId, userId);
    }
}

/**
 * Cancel a running run
 */
export async function cancelRun(runId: string) {
    return endRun(runId, "cancelled");
}

export async function settleClarificationDismissedRun(
    runId: string,
    options?: Date | { at?: Date; requireActive?: boolean },
) {
    const at = options instanceof Date ? options : options?.at ?? new Date();
    const requireActive = options instanceof Date ? false : options?.requireActive ?? false;
    const result = await prisma.agentRun.updateMany({
        where: {
            id: runId,
            status: { in: ["running", "paused"] },
        },
        data: {
            status: "cancelled",
            completedAt: at,
            lastActivityAt: at,
            lastDurableProgressAt: at,
            finalizationState: "completed",
            abnormalEndClassification: null,
        },
    });
    if (result.count > 0) {
        notifyRunActivity(runId, at);
        return result.count;
    }
    if (requireActive) {
        await throwRunOwnershipError({ agentRun: prisma.agentRun }, runId);
    }
    return result.count;
}

/**
 * Get a run by ID
 */
export async function getRun(runId: string) {
    return prisma.agentRun.findUnique({
        where: { id: runId },
    });
}

/**
 * Get runs for a project
 */
export async function getProjectRuns(
    projectId: string,
    options?: { limit?: number; status?: RunStatus }
) {
    return prisma.agentRun.findMany({
        where: {
            projectId,
            ...(options?.status ? { status: options.status } : {}),
        },
        orderBy: { startedAt: "desc" },
        take: options?.limit ?? 20,
    });
}

/**
 * Get parent/child run lineage tree for a given run.
 * Uses rootRunId when available and gracefully handles legacy runs
 * where rootRunId is null.
 */
export async function getRunLineage(runId: string): Promise<RunLineageNode | null> {
    const seed = await prisma.agentRun.findUnique({
        where: { id: runId },
        select: { id: true, rootRunId: true },
    });
    if (!seed) return null;

    const rootId = seed.rootRunId ?? seed.id;
    const runs = await prisma.agentRun.findMany({
        where: {
            OR: [
                { id: rootId },
                { rootRunId: rootId },
            ],
        },
        orderBy: { startedAt: "asc" },
    });
    if (runs.length === 0) return null;

    const byId = new Map<string, RunLineageNode>();
    for (const run of runs) {
        byId.set(run.id, {
            id: run.id,
            projectId: run.projectId,
            conversationId: run.conversationId,
            userId: run.userId,
            parentRunId: run.parentRunId ?? null,
            rootRunId: run.rootRunId ?? null,
            trigger: run.trigger as RunTrigger,
            agentMode: run.agentMode as AgentMode,
            status: run.status as RunStatus,
            model: run.model,
            provider: run.provider,
            reasoningEffort: run.reasoningEffort,
            deliveryMode: run.deliveryMode,
            actualModel: run.actualModel,
            actualProvider: run.actualProvider,
            actualReasoningEffort: run.actualReasoningEffort,
            actualDeliveryMode: run.actualDeliveryMode,
            costTokensIn: run.costTokensIn,
            costTokensOut: run.costTokensOut,
            startedAt: run.startedAt.toISOString(),
            completedAt: run.completedAt?.toISOString() ?? null,
            children: [],
        });
    }

    const root = byId.get(rootId) ?? null;
    if (!root) {
        return null;
    }

    for (const node of byId.values()) {
        if (!node.parentRunId) continue;
        const parent = byId.get(node.parentRunId);
        if (!parent) continue;
        parent.children.push(node);
    }

    const sortTree = (node: RunLineageNode): void => {
        node.children.sort((a, b) => a.startedAt.localeCompare(b.startedAt));
        for (const child of node.children) {
            sortTree(child);
        }
    };
    sortTree(root);

    return root;
}
