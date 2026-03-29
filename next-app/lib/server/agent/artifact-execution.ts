import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import type { ArtifactStatus, ArtifactType } from "@/types/artifacts";
import { ARTIFACT_PAYLOAD_SCHEMAS } from "@/types/artifacts";
import type { ProtocolData } from "@/types/protocol";
import { syncProtocolToMemory } from "@/lib/server/memory/protocol-sync";
import { logServerError, logServerWarn } from "@/lib/server/logging";
import { ArtifactError } from "./artifact-errors";
import { emitEventWithinTransaction } from "./events";
import { createArtifactCheckpointInTransaction } from "./run-checkpoints";
import { markRunDurabilityDegraded } from "./run";

export type ArtifactDbClient = typeof prisma | Prisma.TransactionClient;

export const artifactExecutionSelect = {
    id: true,
    runId: true,
    projectId: true,
    conversationId: true,
    userId: true,
    type: true,
    status: true,
    title: true,
    payload: true,
    snapshot: true,
    version: true,
    sourceEventId: true,
    applyId: true,
    appliedAt: true,
    appliedByUserId: true,
    reviewedAt: true,
    reviewNote: true,
    createdAt: true,
    project: {
        select: {
            ownerId: true,
            workspaceId: true,
        },
    },
} satisfies Prisma.ArtifactSelect;

export type ArtifactExecutionArtifact = Prisma.ArtifactGetPayload<{ select: typeof artifactExecutionSelect }>;

export type ArtifactExecutionSource = "manual_review" | "auto_apply" | "undo";

export type ArtifactExecutionContext = {
    db: Prisma.TransactionClient;
    projectId: string;
    ownerId: string;
    workspaceId: string;
    artifactUserId: string | null;
    effectiveActorUserId: string | null;
    executionSource: ArtifactExecutionSource;
};

export type ArtifactPostCommitTask = {
    kind: "sync_protocol_to_memory";
    projectId: string;
    protocolData: ProtocolData;
};

export type ApplyFunction = (
    ctx: ArtifactExecutionContext,
    artifact: ArtifactExecutionArtifact,
) => Promise<{ postCommitTasks?: ArtifactPostCommitTask[] } | void>;

export type SnapshotReader = (
    ctx: ArtifactExecutionContext,
    artifact: ArtifactExecutionArtifact,
) => Promise<unknown | null>;

export type RestoreFunction = (
    ctx: ArtifactExecutionContext,
    artifact: ArtifactExecutionArtifact,
) => Promise<void>;

export type ArtifactApplyRegistries = {
    applyFunctions: ReadonlyMap<ArtifactType, ApplyFunction>;
    snapshotReaders: ReadonlyMap<ArtifactType, SnapshotReader>;
};

export class ArtifactDurabilityPersistenceError extends Error {
    readonly causeError: unknown;

    constructor(causeError: unknown) {
        super("artifact durability persistence failed");
        this.name = "ArtifactDurabilityPersistenceError";
        this.causeError = causeError;
    }
}

type PostCommitTaskDeps = {
    logServerErrorFn?: typeof logServerError;
    syncProtocolToMemoryFn?: typeof syncProtocolToMemory;
};

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function toArtifactApplyError(error: unknown): ArtifactError {
    if (error instanceof ArtifactError) return error;
    return new ArtifactError("ARTIFACT_APPLY_FAILED", formatError(error));
}

export function validateArtifactPayload(
    type: ArtifactType,
    payload: unknown,
    label: "artifact payload" | "edited payload",
) {
    const schema = ARTIFACT_PAYLOAD_SCHEMAS[type];
    if (!schema) return;

    const validation = schema.safeParse(payload);
    if (validation.success) return;

    const issues = validation.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");
    throw new ArtifactError("ARTIFACT_INVALID_PAYLOAD", `Invalid ${label} for ${type}: ${issues}`);
}

export async function loadArtifactForExecution(
    db: ArtifactDbClient,
    artifactId: string,
): Promise<ArtifactExecutionArtifact> {
    const artifact = await db.artifact.findUnique({
        where: { id: artifactId },
        select: artifactExecutionSelect,
    });
    if (!artifact) {
        throw new ArtifactError("ARTIFACT_NOT_FOUND", "Artifact not found");
    }
    return artifact;
}

export function buildExecutionContext(
    db: Prisma.TransactionClient,
    artifact: ArtifactExecutionArtifact,
    executionSource: ArtifactExecutionSource,
    actorUserId?: string | null,
): ArtifactExecutionContext {
    if (!artifact.projectId || !artifact.project) {
        throw new ArtifactError("ARTIFACT_CONTEXT_MISSING", "Cannot apply artifact without a project context");
    }

    return {
        db,
        projectId: artifact.projectId,
        ownerId: artifact.project.ownerId,
        workspaceId: artifact.project.workspaceId,
        artifactUserId: artifact.userId,
        effectiveActorUserId: actorUserId ?? artifact.userId ?? null,
        executionSource,
    };
}

export async function markDurabilityAndRethrow(
    runId: string,
    artifactId: string,
    error: unknown,
): Promise<never> {
    await markRunDurabilityDegraded(
        runId,
        "artifact_review_checkpoint_persistence_failed",
    ).catch((markError) => {
        logServerError("artifacts", "failed to persist degraded durability state", {
            artifactId,
            runId,
            error: formatError(markError),
        });
    });
    throw toArtifactApplyError(error);
}

export async function executePostCommitTasks(
    tasks: ArtifactPostCommitTask[] | undefined,
    artifact: { id: string; runId: string },
    deps: PostCommitTaskDeps = {},
) {
    if (!tasks || tasks.length === 0) return;

    const logServerErrorFn = deps.logServerErrorFn ?? logServerError;
    const syncProtocolToMemoryFn = deps.syncProtocolToMemoryFn ?? syncProtocolToMemory;

    for (const task of tasks) {
        try {
            if (task.kind === "sync_protocol_to_memory") {
                await syncProtocolToMemoryFn(task.projectId, task.protocolData);
            }
        } catch (error) {
            logServerErrorFn("artifacts", "artifact post-commit task failed", {
                artifactId: artifact.id,
                runId: artifact.runId,
                projectId: task.projectId,
                task: task.kind,
            }, error);
        }
    }
}

export async function runArtifactApplyTransaction(
    params: {
        artifactId: string;
        executionSource: ArtifactExecutionSource;
        statusOverride?: Extract<ArtifactStatus, "accepted" | "auto_applied">;
        reviewNote?: string;
        editedPayload?: Record<string, unknown>;
        actorUserId?: string | null;
    },
    registries: ArtifactApplyRegistries,
): Promise<{ artifact: ArtifactExecutionArtifact; eventCreatedAt: Date | null; postCommitTasks: ArtifactPostCommitTask[] }> {
    const { artifactId, executionSource, statusOverride, reviewNote, editedPayload, actorUserId } = params;

    return prisma.$transaction(async (tx) => {
        const artifact = await loadArtifactForExecution(tx, artifactId);
        if (artifact.appliedAt) {
            return { artifact, eventCreatedAt: null, postCommitTasks: [] };
        }

        const ctx = buildExecutionContext(tx, artifact, executionSource, actorUserId);
        const effectivePayload = (editedPayload ?? artifact.payload) as ArtifactExecutionArtifact["payload"];
        const effectiveArtifact: ArtifactExecutionArtifact = {
            ...artifact,
            payload: effectivePayload,
        };

        let snapshot: ArtifactExecutionArtifact["snapshot"];
        let applyResult: Awaited<ReturnType<ApplyFunction>> | undefined;
        try {
            const snapshotReader = registries.snapshotReaders.get(artifact.type as ArtifactType);
            snapshot = (snapshotReader
                ? await snapshotReader(ctx, effectiveArtifact)
                : artifact.snapshot) as ArtifactExecutionArtifact["snapshot"];

            const applyFn = registries.applyFunctions.get(artifact.type as ArtifactType);
            applyResult = applyFn
                ? await applyFn(ctx, {
                    ...effectiveArtifact,
                    snapshot: snapshot as ArtifactExecutionArtifact["snapshot"],
                })
                : undefined;

            if (!applyFn) {
                logServerWarn("artifacts", "no apply function registered for artifact type", {
                    artifactType: artifact.type,
                    artifactId,
                });
            }
        } catch (error) {
            throw toArtifactApplyError(error);
        }

        try {
            const finalizedAt = new Date();
            const applied = await tx.artifact.update({
                where: { id: artifactId },
                data: {
                    payload: effectivePayload as object,
                    snapshot: (snapshot ?? Prisma.DbNull) as Prisma.InputJsonValue,
                    appliedAt: finalizedAt,
                    applyId: artifact.id,
                    ...(statusOverride ? { status: statusOverride } : {}),
                    ...(executionSource === "manual_review"
                        ? {
                            reviewedAt: finalizedAt,
                            reviewNote: reviewNote ?? null,
                            appliedByUserId: actorUserId ?? null,
                        }
                        : {}),
                },
                select: artifactExecutionSelect,
            });

            const event = await emitEventWithinTransaction(
                tx,
                artifact.runId,
                "artifact_reviewed",
                {
                    artifactId: artifact.id,
                    status: "applied",
                    type: artifact.type,
                },
                { artifactId: artifact.id },
            );

            await createArtifactCheckpointInTransaction(tx, {
                runId: artifact.runId,
                conversationId: artifact.conversationId,
                eventSequence: event.sequence,
                artifact: {
                    id: applied.id,
                    type: applied.type,
                    status: applied.status,
                    title: applied.title,
                    payload: applied.payload,
                    version: applied.version,
                },
            });

            return {
                artifact: applied,
                eventCreatedAt: event.createdAt,
                postCommitTasks: applyResult?.postCommitTasks ?? [],
            };
        } catch (error) {
            throw new ArtifactDurabilityPersistenceError(toArtifactApplyError(error));
        }
    });
}
