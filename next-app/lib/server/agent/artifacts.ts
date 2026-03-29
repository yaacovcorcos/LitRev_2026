/**
 * Artifact CRUD + Apply/Undo
 * Manages inline artifact lifecycle (planC Phase 0.5)
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";
import type { ArtifactStatus, ArtifactType, MemoryProposalPayload } from "@/types/artifacts";
import { emitEventWithinTransaction } from "./events";
import { createArtifactCheckpointInTransaction } from "./run-checkpoints";
import { onStudyAccepted, onStudyExcluded, onDraftAccepted, onArtifactEdited } from "@/lib/server/memory/decision-extractor";
import { normalizedMemoryKey } from "@/lib/server/memory/conflict-policy";
import { noteObservedRunActivity } from "./run";
import { logServerError } from "@/lib/server/logging";
import { ArtifactError } from "./artifact-errors";
import {
    artifactExecutionSelect,
    type ApplyFunction,
    type RestoreFunction,
    type SnapshotReader,
    ArtifactDurabilityPersistenceError,
    buildExecutionContext,
    executePostCommitTasks,
    loadArtifactForExecution,
    markDurabilityAndRethrow,
    runArtifactApplyTransaction,
    validateArtifactPayload,
} from "./artifact-execution";
import {
    buildEvidenceTableMarkdown,
    registerArtifactHandlers,
} from "./artifact-handler-registrations";

// ── Apply function registry ──────────────────────────────────────────────────

const applyFunctions = new Map<ArtifactType, ApplyFunction>();

// ── Snapshot reader registry (Wave 3A) ──────────────────────────────────────
// Each reader captures "before" state so undoArtifact can restore it.

const snapshotReaders = new Map<ArtifactType, SnapshotReader>();

// ── Restore function registry (Wave 3B) ─────────────────────────────────────
// Each restore function uses the captured snapshot to revert the domain state.

const restoreFunctions = new Map<ArtifactType, RestoreFunction>();

registerArtifactHandlers({
    applyFunctions,
    snapshotReaders,
    restoreFunctions,
});

export { buildEvidenceTableMarkdown };

/**
 * Register an apply function for an artifact type.
 * Called during module initialization by each domain service.
 */
export function registerApplyFunction(type: ArtifactType, fn: ApplyFunction) {
    applyFunctions.set(type, fn);
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

export interface CreateArtifactInput {
    runId: string;
    projectId?: string | null;
    conversationId?: string;
    userId?: string;
    type: ArtifactType;
    title: string;
    payload: unknown;
    sourceEventId?: string;
}

/**
 * Create a new artifact (status: proposed).
 * Validates payload against the type's Zod schema.
 */
export async function createArtifact(input: CreateArtifactInput) {
    validateArtifactPayload(input.type, input.payload, "artifact payload");

    const { artifact, eventCreatedAt } = await prisma.$transaction(async (tx) => {
        const artifact = await tx.artifact.create({
            data: {
                runId: input.runId,
                projectId: input.projectId || null,
                conversationId: input.conversationId ?? null,
                userId: input.userId ?? null,
                type: input.type,
                status: "proposed",
                title: input.title,
                payload: input.payload as object,
                sourceEventId: input.sourceEventId ?? null,
            },
        });

        const event = await emitEventWithinTransaction(
            tx,
            input.runId,
            "artifact_proposed",
            {
                artifactId: artifact.id,
                artifactType: artifact.type,
                artifactStatus: artifact.status,
                artifactTitle: artifact.title,
            },
            { artifactId: artifact.id },
        );

        await createArtifactCheckpointInTransaction(tx, {
            runId: input.runId,
            conversationId: artifact.conversationId,
            eventSequence: event.sequence,
            artifact,
        });

        return { artifact, eventCreatedAt: event.createdAt };
    });

    noteObservedRunActivity(input.runId, eventCreatedAt);
    return artifact;
}

export async function reviewArtifact(
    artifactId: string,
    status: Extract<ArtifactStatus, "accepted" | "rejected" | "edited">,
    reviewNote?: string,
    editedPayload?: Record<string, unknown>,
    options?: { actorUserId?: string | null },
) {
    if (status === "accepted") {
        const artifact = await loadArtifactForExecution(prisma, artifactId);
        if (artifact.status === status && artifact.appliedAt) {
            return artifact;
        }
        if (artifact.status !== "proposed") {
            throw new ArtifactError("ARTIFACT_INVALID_STATE", `Cannot review artifact with status "${artifact.status}"`);
        }
        if (editedPayload) {
            validateArtifactPayload(artifact.type as ArtifactType, editedPayload, "edited payload");
        }

        try {
            const applied = await runArtifactApplyTransaction({
                artifactId,
                executionSource: "manual_review",
                statusOverride: "accepted",
                reviewNote,
                editedPayload,
                actorUserId: options?.actorUserId ?? null,
            }, { applyFunctions, snapshotReaders });

            if (applied.eventCreatedAt) {
                noteObservedRunActivity(applied.artifact.runId, applied.eventCreatedAt);
            }
            await executePostCommitTasks(applied.postCommitTasks, applied.artifact);

            extractDecisionMemory(applied.artifact, status, reviewNote).catch((err) =>
                logServerError("decision-extractor", "decision memory extraction failed", {
                    artifactId,
                    status,
                }, err)
            );

            return applied.artifact;
        } catch (error) {
            if (error instanceof ArtifactDurabilityPersistenceError) {
                await markDurabilityAndRethrow(artifact.runId, artifactId, error.causeError);
            }
            throw error;
        }
    }

    const artifact = await loadArtifactForExecution(prisma, artifactId);
    if (artifact.status === status) {
        return artifact;
    }
    if (artifact.status !== "proposed") {
        throw new ArtifactError("ARTIFACT_INVALID_STATE", `Cannot review artifact with status "${artifact.status}"`);
    }

    const updated = await prisma.$transaction(async (tx) => tx.artifact.update({
        where: { id: artifactId },
        data: {
            status,
            reviewedAt: new Date(),
            reviewNote: reviewNote ?? null,
        },
        select: artifactExecutionSelect,
    }));

    trackMemoryProposalReview(updated, status).catch((error) =>
        logServerError("artifacts", "memory proposal review bookkeeping failed", {
            artifactId,
            status,
        }, error)
    );

    extractDecisionMemory(updated, status, reviewNote).catch((err) =>
        logServerError("decision-extractor", "decision memory extraction failed", {
            artifactId,
            status,
        }, err)
    );

    return updated;
}

/**
 * Apply an artifact — run the type-specific apply function
 */
export async function applyArtifact(
    artifactId: string,
    statusOverride?: Extract<ArtifactStatus, "accepted" | "auto_applied">,
    options?: { actorUserId?: string | null },
) {
    try {
        const artifact = await loadArtifactForExecution(prisma, artifactId);
        if (artifact.appliedAt) return artifact;

        const applied = await runArtifactApplyTransaction({
            artifactId,
            executionSource: statusOverride === "auto_applied" ? "auto_apply" : "manual_review",
            statusOverride,
            actorUserId: options?.actorUserId ?? null,
        }, { applyFunctions, snapshotReaders });

        if (applied.eventCreatedAt) {
            noteObservedRunActivity(artifact.runId, applied.eventCreatedAt);
        }
        await executePostCommitTasks(applied.postCommitTasks, applied.artifact);
        return applied.artifact;
    } catch (error) {
        const artifact = await loadArtifactForExecution(prisma, artifactId).catch(() => null);
        if (artifact && error instanceof ArtifactDurabilityPersistenceError) {
            await markDurabilityAndRethrow(artifact.runId, artifactId, error.causeError);
        }
        throw error;
    }
}

/**
 * Undo an artifact — restore domain state from snapshot, then mark rejected.
 * Only allowed within a 5-minute window after apply.
 */
export async function undoArtifact(artifactId: string) {
    const artifact = await loadArtifactForExecution(prisma, artifactId);
    if (!artifact.appliedAt) {
        throw new ArtifactError("ARTIFACT_INVALID_STATE", "Artifact has not been applied");
    }

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (artifact.appliedAt < fiveMinutesAgo) {
        throw new ArtifactError("ARTIFACT_INVALID_STATE", "Undo window has expired (5 minutes)");
    }

    return prisma.$transaction(async (tx) => {
        const current = await loadArtifactForExecution(tx, artifactId);
        const restoreFn = restoreFunctions.get(current.type as ArtifactType);
        if (restoreFn) {
            const ctx = buildExecutionContext(tx, current, "undo", null);
            await restoreFn(ctx, current);
        }

        return tx.artifact.update({
            where: { id: artifactId },
            data: {
                status: "rejected",
                reviewNote: "Undone by user",
            },
        });
    });
}

/**
 * Collapse an artifact (visual only — after acceptance)
 */
export async function collapseArtifact(artifactId: string) {
    return prisma.artifact.update({
        where: { id: artifactId },
        data: { status: "collapsed" },
    });
}

/**
 * Get all artifacts for a conversation
 */
export async function getArtifactsForConversation(conversationId: string) {
    return prisma.artifact.findMany({
        where: { conversationId },
        orderBy: { createdAt: "asc" },
    });
}

/**
 * Get all artifacts for a run
 */
export async function getArtifactsForRun(runId: string) {
    return prisma.artifact.findMany({
        where: { runId },
        orderBy: { createdAt: "asc" },
    });
}

/**
 * Get an artifact by ID
 */
export async function getArtifact(artifactId: string) {
    return prisma.artifact.findUnique({ where: { id: artifactId } });
}

// ── Decision memory extraction helper ────────────────────────────────────────

async function extractDecisionMemory(
    artifact: { type: string; projectId: string | null; runId: string | null; conversationId: string | null; userId: string | null; payload: unknown; snapshot: unknown },
    status: string,
    reviewNote?: string,
): Promise<void> {
    const projectId = artifact.projectId;
    if (!projectId) return;

    const payload = artifact.payload as Record<string, unknown>;

    if (artifact.type === "study_proposal") {
        const studyProposal = payload as unknown as import("@/types/artifacts").StudyProposalPayload;
        if (status === "accepted" && studyProposal.recommendation === "keep") {
            const study = await prisma.study.findFirst({
                where: { projectId, title: studyProposal.title, deletedAt: null },
                select: { id: true },
            });
            if (study) {
                await onStudyAccepted(projectId, study.id, studyProposal);
            }
        } else if (status === "rejected" || studyProposal.recommendation === "exclude") {
            await onStudyExcluded(projectId, studyProposal, reviewNote);
        }
    } else if (artifact.type === "draft_diff" && status === "accepted") {
        const draftPayload = payload as unknown as import("@/types/artifacts").DraftDiffPayload;
        await onDraftAccepted(projectId, draftPayload);
    } else if (status === "edited" && artifact.snapshot && artifact.runId) {
        await onArtifactEdited(
            artifact.runId,
            projectId,
            artifact.conversationId,
            artifact.userId ?? undefined,
            artifact.snapshot,
            artifact.payload,
            artifact.type as ArtifactType,
        );
    }
}

async function trackMemoryProposalReview(
    artifact: { projectId: string | null; userId: string | null; payload: unknown; type: string },
    status: Extract<ArtifactStatus, "accepted" | "rejected" | "edited">,
) {
    if (artifact.type !== "memory_proposal" || status !== "rejected") return;

    const payload = artifact.payload as MemoryProposalPayload;
    if (payload.memoryType === "user" && artifact.userId && payload.key) {
        await prisma.$executeRaw`
            UPDATE "UserMemory"
            SET "rejectedCount" = "rejectedCount" + 1
            WHERE "userId" = ${artifact.userId}
              AND "key" = ${payload.key}
              AND "status" = 'active'
        `;
    }

    if (payload.memoryType === "project" && artifact.projectId) {
        const normalizedKey = payload.key ? normalizedMemoryKey(payload.key) : "";
        const keyTag = normalizedKey ? `memory-key:${normalizedKey}` : null;
        if (keyTag) {
            await prisma.$executeRaw`
                UPDATE "ProjectMemory"
                SET "rejectedCount" = "rejectedCount" + 1
                WHERE "projectId" = ${artifact.projectId}
                  AND "status" = 'active'
                  AND ${keyTag} = ANY("tags")
            `;
        } else {
            await prisma.$executeRaw`
                UPDATE "ProjectMemory"
                SET "rejectedCount" = "rejectedCount" + 1
                WHERE "projectId" = ${artifact.projectId}
                  AND "status" = 'active'
                  AND "statement" = ${payload.value}
            `;
        }
    }
}
