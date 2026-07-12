/**
 * AgentRun Lifecycle
 * Creates, updates, and completes agent runs (planC Phase 0.5)
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";
import type { Prisma } from "@prisma/client";
import type {
    AgentMode,
    RunAbnormalEndClassification,
    RunFinalizationState,
    RunPhase,
    RunStatus,
    RunTrigger,
} from "@/types/agent";
import { scheduleConversationMemoryExtractionAfterResponse } from "@/lib/server/memory/conversation-extraction-jobs";
import { transitionRunPhaseInTransaction } from "@/lib/server/agent/run-phase";
import {
    AIErrorWithEnvelope,
    createRunConflictErrorEnvelope,
} from "@/lib/ai/error-envelope";

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
    rootRunId: string | null;
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
            rootRunId: true,
            status: true,
            runPhase: true,
            completedAt: true,
            finalizationState: true,
        },
    });
    if (!run) return null;
    return {
        id: run.id,
        rootRunId: run.rootRunId,
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
    let timer: ReturnType<typeof setInterval> | null = null;

    const unsubscribe = subscribeRunActivity(runId, (at) => {
        lastObservedActivityAt = at.getTime();
    });

    const stopHeartbeat = () => {
        if (stopped) return;
        stopped = true;
        unsubscribe();
        if (timer) {
            cancel(timer);
        }
    };

    timer = schedule(async () => {
        if (stopped || inFlight) return;
        const now = getNow();
        if (now.getTime() - lastObservedActivityAt < intervalMs) return;
        inFlight = true;
        try {
            const updatedCount = await heartbeatTouch(runId, now);
            if (updatedCount > 0) {
                lastObservedActivityAt = now.getTime();
            } else {
                stopHeartbeat();
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
        stop: stopHeartbeat,
    };
}

/**
 * Start a new agent run
 */
export async function startRun(input: StartRunInput) {
    const startedAt = new Date();
    let lineageRootRunId = input.rootRunId ?? null;

    if (input.rootRunId && !input.parentRunId) {
        throw new Error("A root run can only be inherited through a validated parent run");
    }

    if (input.parentRunId) {
        const parentRun = await prisma.agentRun.findUnique({
            where: { id: input.parentRunId },
            select: {
                id: true,
                projectId: true,
                conversationId: true,
                userId: true,
                rootRunId: true,
            },
        });

        if (!parentRun) {
            throw new Error(`Parent run not found: ${input.parentRunId}`);
        }
        const childProjectId = input.projectId ?? null;
        const childConversationId = input.conversationId ?? null;
        const childUserId = input.userId ?? null;
        if (parentRun.projectId !== childProjectId) {
            throw new Error("Parent run project does not match child run project");
        }
        if (parentRun.conversationId !== childConversationId) {
            throw new Error("Parent run conversation does not match child run conversation");
        }
        if (parentRun.userId !== childUserId) {
            throw new Error("Parent run actor does not match child run actor");
        }

        const validatedRootRunId = parentRun.rootRunId ?? parentRun.id;
        if (lineageRootRunId && lineageRootRunId !== validatedRootRunId) {
            throw new Error("Requested root run does not match the validated parent lineage");
        }
        lineageRootRunId = validatedRootRunId;
    }

    const data = {
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
    };

    const run = input.trigger !== "user_message" || !input.conversationId
        ? await prisma.agentRun.create({ data })
        : await prisma.$transaction(async (tx) => {
            const conversationId = input.conversationId!;
            await tx.$queryRaw<{ locked: number }[]>`
                SELECT 1 AS locked
                FROM pg_advisory_xact_lock(hashtext(${`conversation-run-admission:${conversationId}`}))
            `;
            const activeRun = await tx.agentRun.findFirst({
                where: {
                    conversationId,
                    status: "running",
                    completedAt: null,
                },
                orderBy: [
                    { lastActivityAt: "desc" },
                    { startedAt: "desc" },
                ],
                select: {
                    id: true,
                    lastActivityAt: true,
                },
            });
            if (activeRun) {
                throw new AIErrorWithEnvelope(createRunConflictErrorEnvelope({
                    code: "ACTIVE_RUN_EXISTS",
                    conversationId,
                    activeRunId: activeRun.id,
                    lastActivityAt: activeRun.lastActivityAt.toISOString(),
                    recoveryRecommendation: "reconnect",
                }));
            }

            return tx.agentRun.create({ data });
        });

    // A later run boundary accelerates any durable extraction marker left by
    // a serverless teardown or previous failed attempt.
    scheduleConversationMemoryExtractionAfterResponse();
    return run;
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
    const run = await prisma.$transaction(async (tx) => {
        const existing = await tx.agentRun.findUnique({
            where: { id: runId },
            select: {
                durabilityState: true,
                conversationId: true,
                projectId: true,
            },
        });
        const preserveAbnormalClassification =
            existing?.durabilityState === "degraded";
        const shouldExtractMemory = status === "completed"
            && Boolean(existing?.conversationId)
            && Boolean(existing?.projectId);
        const updated = await tx.agentRun.updateMany({
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
                memoryExtractionStatus: shouldExtractMemory ? "pending" : "skipped",
                memoryExtractionAttempts: 0,
                memoryExtractionLeaseToken: null,
                memoryExtractionLeaseExpiresAt: null,
                memoryExtractionCompletedAt: shouldExtractMemory ? null : completedAt,
                memoryExtractionLastError: null,
                ...(status === "completed" && !preserveAbnormalClassification
                    ? { abnormalEndClassification: null }
                    : {}),
                ...(costTokensIn !== undefined ? { costTokensIn } : {}),
                ...(costTokensOut !== undefined ? { costTokensOut } : {}),
            },
        });
        if (updated.count !== 1) {
            await throwRunOwnershipError(tx, runId);
        }
        const finalized = await tx.agentRun.findUnique({
            where: { id: runId },
        });
        if (!finalized) {
            throw new Error(`Run not found after finalization: ${runId}`);
        }
        return finalized;
    });
    notifyRunActivity(runId, completedAt);

    // This only registers post-response acceleration. The pending marker was
    // committed atomically above and remains retryable if registration fails.
    scheduleConversationMemoryExtractionAfterResponse(
        run.memoryExtractionStatus === "pending" ? run.id : undefined,
    );

    return run;
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
