/**
 * Artifact CRUD + Apply/Undo
 * Manages inline artifact lifecycle (planC Phase 0.5)
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";
import { Prisma } from "@prisma/client";
import type { ArtifactType, ArtifactStatus, CriteriaCardPayload, ProtocolSuggestionPayload, MemoryProposalPayload, MemoryForgetProposalPayload, StudyProposalPayload, StudyUpdatePayload, DraftDiffPayload, ScreeningBatchPayload, EvidenceTablePayload } from "@/types/artifacts";
import type { StudyType, StudySource, StudyDetails } from "@/types/ledger";
import type { ProtocolData } from "@/types/protocol";
import { ARTIFACT_PAYLOAD_SCHEMAS } from "@/types/artifacts";
import { emitEventWithinTransaction } from "./events";
import { createArtifactCheckpointInTransaction } from "./run-checkpoints";
import { onStudyAccepted, onStudyExcluded, onDraftAccepted, onArtifactEdited } from "@/lib/server/memory/decision-extractor";
import { syncProtocolToMemory } from "@/lib/server/memory/protocol-sync";
import { ensureProtocolWithDb, saveProtocolTrusted } from "@/lib/server/protocols";
import { validateFieldValue, isValidFieldPath } from "@/lib/protocol-fields";
import {
    setUserMemoryWithDb,
    createProjectMemoryWithDb,
    getProjectMemories,
    getUserMemories,
} from "@/lib/server/memory";
import { normalizedMemoryKey, normalizedMemoryValue } from "@/lib/server/memory/conflict-policy";
import { createNoteTrusted, updateNoteTrusted, textToTipTapDoc, listNotesTrusted } from "@/lib/server/notes";
import { upsertStudyTrusted, updateStudyTrusted } from "@/lib/server/ledger";
import { markRunDurabilityDegraded, noteObservedRunActivity } from "./run";
import { logServerError, logServerWarn } from "@/lib/server/logging";
import { ArtifactError } from "./artifact-errors";
import { createDraftVersionTrusted } from "@/lib/server/draft-versions";
import { getDraftTrusted, saveDraftTrusted } from "@/lib/server/drafts";

// ── Apply function registry ──────────────────────────────────────────────────

type ArtifactDbClient = typeof prisma | Prisma.TransactionClient;

const artifactExecutionSelect = {
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

type ArtifactExecutionArtifact = Prisma.ArtifactGetPayload<{ select: typeof artifactExecutionSelect }>;

type ArtifactExecutionSource = "manual_review" | "auto_apply" | "undo";

type ArtifactExecutionContext = {
    db: Prisma.TransactionClient;
    projectId: string;
    ownerId: string;
    workspaceId: string;
    artifactUserId: string | null;
    effectiveActorUserId: string | null;
    executionSource: ArtifactExecutionSource;
};

type ArtifactPostCommitTask = {
    kind: "sync_protocol_to_memory";
    projectId: string;
    protocolData: ProtocolData;
};

type ApplyFunction = (
    ctx: ArtifactExecutionContext,
    artifact: ArtifactExecutionArtifact,
) => Promise<{ postCommitTasks?: ArtifactPostCommitTask[] } | void>;

const applyFunctions = new Map<ArtifactType, ApplyFunction>();

// ── Snapshot reader registry (Wave 3A) ──────────────────────────────────────
// Each reader captures "before" state so undoArtifact can restore it.

type SnapshotReader = (
    ctx: ArtifactExecutionContext,
    artifact: ArtifactExecutionArtifact,
) => Promise<unknown | null>;

const snapshotReaders = new Map<ArtifactType, SnapshotReader>();

// ── Restore function registry (Wave 3B) ─────────────────────────────────────
// Each restore function uses the captured snapshot to revert the domain state.

type RestoreFunction = (
    ctx: ArtifactExecutionContext,
    artifact: ArtifactExecutionArtifact,
) => Promise<void>;

const restoreFunctions = new Map<ArtifactType, RestoreFunction>();

class ArtifactDurabilityPersistenceError extends Error {
    readonly causeError: unknown;

    constructor(causeError: unknown) {
        super("artifact durability persistence failed");
        this.name = "ArtifactDurabilityPersistenceError";
        this.causeError = causeError;
    }
}

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function toArtifactApplyError(error: unknown): ArtifactError {
    if (error instanceof ArtifactError) return error;
    return new ArtifactError("ARTIFACT_APPLY_FAILED", formatError(error));
}

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
    // Validate payload
    const schema = ARTIFACT_PAYLOAD_SCHEMAS[input.type];
    if (schema) {
        const validation = schema.safeParse(input.payload);
        if (!validation.success) {
            const issues = validation.error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join("; ");
            throw new ArtifactError("ARTIFACT_INVALID_PAYLOAD", `Invalid artifact payload for ${input.type}: ${issues}`);
        }
    }

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

/**
 * Review an artifact (accept, reject, or edit).
 * If `editedPayload` is provided, the artifact's payload is updated before applying.
 * This supports the edit-then-accept flow where the user tweaks a proposal before saving.
 */
function validateArtifactPayload(
    type: ArtifactType,
    payload: unknown,
    label: "artifact payload" | "edited payload",
) {
    const schema = ARTIFACT_PAYLOAD_SCHEMAS[type];
    if (!schema) return;

    const validation = schema.safeParse(payload);
    if (validation.success) return;

    const issues = validation.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
    throw new ArtifactError("ARTIFACT_INVALID_PAYLOAD", `Invalid ${label} for ${type}: ${issues}`);
}

async function loadArtifactForExecution(
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

function buildExecutionContext(
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

async function markDurabilityAndRethrow(
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

async function executePostCommitTasks(
    tasks: ArtifactPostCommitTask[] | undefined,
    artifact: { id: string; runId: string },
) {
    if (!tasks || tasks.length === 0) return;

    for (const task of tasks) {
        try {
            if (task.kind === "sync_protocol_to_memory") {
                await syncProtocolToMemory(task.projectId, task.protocolData);
            }
        } catch (error) {
            logServerError("artifacts", "artifact post-commit task failed", {
                artifactId: artifact.id,
                runId: artifact.runId,
                task: task.kind,
            }, error);
        }
    }
}

async function runArtifactApplyTransaction(params: {
    artifactId: string;
    executionSource: ArtifactExecutionSource;
    statusOverride?: Extract<ArtifactStatus, "accepted" | "auto_applied">;
    reviewNote?: string;
    editedPayload?: Record<string, unknown>;
    actorUserId?: string | null;
}): Promise<{ artifact: ArtifactExecutionArtifact; eventCreatedAt: Date | null; postCommitTasks: ArtifactPostCommitTask[] }> {
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
            const snapshotReader = snapshotReaders.get(artifact.type as ArtifactType);
            snapshot = (snapshotReader
                ? await snapshotReader(ctx, effectiveArtifact)
                : artifact.snapshot) as ArtifactExecutionArtifact["snapshot"];

            const applyFn = applyFunctions.get(artifact.type as ArtifactType);
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
            });

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
        });

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

    // Check 5-minute window
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
        const sp = payload as unknown as import("@/types/artifacts").StudyProposalPayload;
        if (status === "accepted" && sp.recommendation === "keep") {
            // Look up study by title to get studyId (soft-delete aware)
            const study = await prisma.study.findFirst({
                where: { projectId, title: sp.title, deletedAt: null },
                select: { id: true },
            });
            if (study) {
                await onStudyAccepted(projectId, study.id, sp);
            }
        } else if (status === "rejected" || sp.recommendation === "exclude") {
            await onStudyExcluded(projectId, sp, reviewNote);
        }
    } else if (artifact.type === "draft_diff" && status === "accepted") {
        const dp = payload as unknown as import("@/types/artifacts").DraftDiffPayload;
        await onDraftAccepted(projectId, dp);
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

// ── Apply function registrations ─────────────────────────────────────────────

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split(".");
    let current: unknown = obj;
    for (const key of keys) {
        if (current == null || typeof current !== "object") return undefined;
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown) {
    const keys = path.split(".");
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]] as Record<string, unknown>;
        if (!current) return;
    }
    current[keys[keys.length - 1]] = value;
}

function escapeMarkdownCell(value: unknown): string {
    return String(value ?? "")
        .replace(/\|/g, "\\|")
        .replace(/\r?\n/g, " ")
        .trim();
}

export function buildEvidenceTableMarkdown(payload: EvidenceTablePayload): string {
    const explicitColumns = payload.columns.map((c) => String(c).trim()).filter(Boolean);
    const inferredColumns = payload.rows.flatMap((row) => Object.keys(row).map((k) => k.trim()).filter(Boolean));
    const columns = explicitColumns.length > 0
        ? explicitColumns
        : Array.from(new Set(inferredColumns));

    if (columns.length === 0) {
        return "## Evidence Table\n\n_No structured evidence rows were generated._";
    }

    const header = `| ${columns.map(escapeMarkdownCell).join(" | ")} |`;
    const separator = `| ${columns.map(() => "---").join(" | ")} |`;
    const lines = [header, separator];

    for (const row of payload.rows) {
        const values = columns.map((column) => escapeMarkdownCell(row[column] ?? ""));
        lines.push(`| ${values.join(" | ")} |`);
    }

    return `## Evidence Table\n\n${lines.join("\n")}`;
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

// criteria_card: update protocol eligibility, then sync to memory
registerApplyFunction("criteria_card", async (ctx, artifact) => {
    const payload = artifact.payload as unknown as CriteriaCardPayload;
    const data = await ensureProtocolWithDb(ctx.db, ctx.projectId);
    data.eligibility.inclusion = payload.inclusion;
    data.eligibility.exclusion = payload.exclusion;
    await saveProtocolTrusted(ctx.db, ctx.projectId, data);
    return {
        postCommitTasks: [{
            kind: "sync_protocol_to_memory",
            projectId: ctx.projectId,
            protocolData: data,
        }],
    };
});

// protocol_suggestion: update protocol field, then sync
registerApplyFunction("protocol_suggestion", async (ctx, artifact) => {
    const payload = artifact.payload as unknown as ProtocolSuggestionPayload;

    // Final gate: validate field path and value type before writing
    if (!isValidFieldPath(payload.field)) {
        throw new ArtifactError("ARTIFACT_INVALID_PAYLOAD", `Invalid protocol field: "${payload.field}"`);
    }
    const fieldCheck = validateFieldValue(payload.field, payload.value);
    if (!fieldCheck.valid) {
        throw new ArtifactError("ARTIFACT_INVALID_PAYLOAD", `Cannot apply protocol_suggestion: ${fieldCheck.error}`);
    }

    const data = await ensureProtocolWithDb(ctx.db, ctx.projectId);
    setNestedValue(data as unknown as Record<string, unknown>, payload.field, fieldCheck.value);
    await saveProtocolTrusted(ctx.db, ctx.projectId, data);
    return {
        postCommitTasks: [{
            kind: "sync_protocol_to_memory",
            projectId: ctx.projectId,
            protocolData: data,
        }],
    };
});

// memory_proposal: create the actual memory entry
registerApplyFunction("memory_proposal", async (ctx, artifact) => {
    const payload = artifact.payload as unknown as MemoryProposalPayload;
    if (payload.memoryType === "user") {
        const userId = ctx.effectiveActorUserId;
        if (!userId) {
            throw new ArtifactError("ARTIFACT_CONTEXT_MISSING", "User memory proposals require an acting user.");
        }
        const key = normalizedMemoryKey(payload.key || `auto_${Date.now()}`);
        const keyTag = `memory-key:${key}`;
        const incomingValue = normalizedMemoryValue(payload.value);
        const activeUserMemories = await getUserMemories(userId, { status: "active" }, ctx.db);
        const sameLogicalKey = activeUserMemories.filter((memory) => normalizedMemoryKey(memory.key) === key);
        const hasConflict = sameLogicalKey.some((memory) => normalizedMemoryValue(memory.value) !== incomingValue);
        const variantIds = sameLogicalKey
            .filter((memory) => memory.key !== key)
            .map((memory) => memory.id);

        if (variantIds.length > 0) {
            await ctx.db.userMemory.updateMany({
                where: {
                    id: { in: variantIds },
                    userId,
                    status: "active",
                },
                data: {
                    status: "archived",
                    archivedAt: new Date(),
                },
            });
        }

        await setUserMemoryWithDb(ctx.db, {
            userId,
            type: "preference",
            key,
            value: payload.value,
            rationale: payload.rationale,
            tags: ["ai-proposed", keyTag],
        });
        await ctx.db.$executeRaw`
            UPDATE "UserMemory"
            SET "acceptedCount" = "acceptedCount" + 1,
                "contradictionCount" = "contradictionCount" + ${hasConflict ? 1 : 0}
            WHERE "userId" = ${userId}
              AND "key" = ${key}
        `;
    } else if (payload.memoryType === "project") {
        const normalizedKey = payload.key ? normalizedMemoryKey(payload.key) : "";
        const keyTag = normalizedKey ? `memory-key:${normalizedKey}` : null;
        const normalizedValue = normalizedMemoryValue(payload.value);
        let conflictCount = 0;

        // If this proposal is keyed and accepted, supersede conflicting active memories with the same key.
        if (keyTag) {
            const existing = await getProjectMemories(ctx.projectId, { status: "active", tags: [keyTag] }, ctx.db);
            const exact = existing.find((m) => normalizedMemoryValue(m.statement) === normalizedValue);
            if (exact) {
                await ctx.db.projectMemory.update({
                    where: { id: exact.id },
                    data: {
                        rationale: payload.rationale ?? exact.rationale,
                    },
                });
                await ctx.db.$executeRaw`
                    UPDATE "ProjectMemory"
                    SET "acceptedCount" = "acceptedCount" + 1
                    WHERE "id" = ${exact.id}
                `;
                return;
            }

            const conflictingIds = existing
                .filter((m) => normalizedMemoryValue(m.statement) !== normalizedValue)
                .map((m) => m.id);
            conflictCount = conflictingIds.length;
            if (conflictingIds.length > 0) {
                await ctx.db.projectMemory.updateMany({
                    where: { id: { in: conflictingIds } },
                    data: {
                        status: "archived",
                        archivedAt: new Date(),
                    },
                });
                const idValues = conflictingIds.map((id) => Prisma.sql`${id}`);
                await ctx.db.$executeRaw`
                    UPDATE "ProjectMemory"
                    SET "contradictionCount" = "contradictionCount" + 1
                    WHERE "id" IN (${Prisma.join(idValues)})
                `;
            }
        }

        const created = await createProjectMemoryWithDb(ctx.db, {
            projectId: ctx.projectId,
            type: "decision",
            statement: payload.value,
            rationale: payload.rationale,
            importance: "normal",
            tags: keyTag ? ["ai-proposed", keyTag] : ["ai-proposed"],
        });
        await ctx.db.$executeRaw`
            UPDATE "ProjectMemory"
            SET "acceptedCount" = "acceptedCount" + 1,
                "contradictionCount" = "contradictionCount" + ${conflictCount > 0 ? 1 : 0}
            WHERE "id" = ${created.id}
        `;
    } else if (payload.memoryType === "note") {
        await createNoteTrusted(ctx.db, {
            projectId: ctx.projectId,
            title: payload.key || undefined,
            content: textToTipTapDoc(payload.value),
            source: "conversation",
            sourceConversationId: artifact.conversationId ?? undefined,
            tags: ["ai-proposed"],
        });
    }
});

// memory_forget_proposal: archive selected memories (forget semantics = archive, not hard delete)
registerApplyFunction("memory_forget_proposal", async (ctx, artifact) => {
    const payload = artifact.payload as unknown as MemoryForgetProposalPayload;
    const matchIds = payload.matches.map((m) => m.id);
    if (matchIds.length === 0) return;

    if (payload.memoryType === "user") {
        const userId = ctx.effectiveActorUserId;
        if (!userId) {
            throw new ArtifactError("ARTIFACT_CONTEXT_MISSING", "User memory forget proposals require an acting user.");
        }
        await ctx.db.userMemory.updateMany({
            where: {
                id: { in: matchIds },
                userId,
                status: "active",
            },
            data: {
                status: "archived",
                archivedAt: new Date(),
            },
        });
        const idValues = matchIds.map((id) => Prisma.sql`${id}`);
        await ctx.db.$executeRaw`
            UPDATE "UserMemory"
            SET "rejectedCount" = "rejectedCount" + 1
            WHERE "id" IN (${Prisma.join(idValues)})
        `;
        return;
    }

    await ctx.db.projectMemory.updateMany({
        where: {
            id: { in: matchIds },
            projectId: ctx.projectId,
            status: "active",
        },
        data: {
            status: "archived",
            archivedAt: new Date(),
        },
    });
    const idValues = matchIds.map((id) => Prisma.sql`${id}`);
    await ctx.db.$executeRaw`
        UPDATE "ProjectMemory"
        SET "rejectedCount" = "rejectedCount" + 1
        WHERE "id" IN (${Prisma.join(idValues)})
    `;
});

// study_proposal: upsert the study with triage decision
registerApplyFunction("study_proposal", async (ctx, artifact) => {
    const payload = artifact.payload as unknown as StudyProposalPayload;
    const mappedStatus = payload.recommendation === "exclude"
        ? "excluded"
        : payload.recommendation === "keep"
            ? "active"
            : "pending";

    const normalizedSource: StudySource | undefined = payload.source === "manual"
        || payload.source === "pdf-import"
        || payload.source === "pubmed"
        || payload.source === "semantic-scholar"
        || payload.source === "copilot"
        ? payload.source
        : payload.source
            ? "copilot"
            : undefined;

    const detailPatch: Partial<StudyDetails> = {
        triageDecision: payload.recommendation,
    };
    if (payload.matchRationale) detailPatch.matchRationale = payload.matchRationale;
    if (normalizedSource) detailPatch.source = normalizedSource;
    if (payload.sourceUrl) detailPatch.sourceUrl = payload.sourceUrl;
    if (payload.doi) detailPatch.doi = payload.doi;
    if (payload.pmid) detailPatch.pmid = payload.pmid;
    if (payload.abstract) detailPatch.abstract = payload.abstract;
    if (payload.journal) detailPatch.journal = payload.journal;
    if (payload.studyType) detailPatch.studyType = payload.studyType as StudyType;
    if (typeof payload.sampleSize === "number") detailPatch.sampleSize = payload.sampleSize;

    if (payload.studyId) {
        const existing = await ctx.db.study.findFirst({
            where: { id: payload.studyId, projectId: ctx.projectId, deletedAt: null },
            select: { id: true },
        });
        if (existing) {
            await updateStudyTrusted(ctx.db, ctx.projectId, ctx.workspaceId, existing.id, {
                status: mappedStatus,
                details: detailPatch,
            });
            return;
        }
    }

    await upsertStudyTrusted(ctx.db, ctx.projectId, ctx.workspaceId, {
        id: payload.studyId,
        title: payload.title,
        authors: payload.authors,
        year: payload.year,
        status: mappedStatus,
        quality: "-",
        details: detailPatch,
    });
});

// study_update: apply a typed patch to an existing study
registerApplyFunction("study_update", async (ctx, artifact) => {
    const payload = artifact.payload as unknown as StudyUpdatePayload;

    // Defensive idempotency check in case of retries/races around accept/apply
    const existingArtifact = await ctx.db.artifact.findUnique({
        where: { id: artifact.id },
        select: { appliedAt: true },
    });
    if (existingArtifact?.appliedAt) return;

    const currentStudy = await ctx.db.study.findFirst({
        where: { id: payload.studyId, projectId: ctx.projectId, deletedAt: null },
        select: { updatedAt: true },
    });
    if (!currentStudy) {
        throw new ArtifactError("ARTIFACT_APPLY_FAILED", `Study not found: ${payload.studyId}`);
    }

    const snapshotMs = new Date(payload.snapshotAt).getTime();
    const currentMs = new Date(currentStudy.updatedAt).getTime();
    if (Number.isFinite(snapshotMs) && currentMs > snapshotMs) {
        logServerWarn("study_update", "concurrency warning; applying accepted patch", {
            studyId: payload.studyId,
            snapshotAt: payload.snapshotAt,
            currentUpdatedAt: currentStudy.updatedAt.toISOString(),
        });
    }

    await updateStudyTrusted(ctx.db, ctx.projectId, ctx.workspaceId, payload.studyId, {
        ...(payload.patch.top ?? {}),
        ...(payload.patch.details ? { details: payload.patch.details as Partial<StudyDetails> } : {}),
    });
});

// draft_diff: write content to the Draft table (displayed by draft page) and DraftVersion (provenance)
registerApplyFunction("draft_diff", async (ctx, artifact) => {
    const payload = artifact.payload as unknown as DraftDiffPayload;
    const tipTapContent = textToTipTapDoc(payload.content);

    // 1. Write immutable DraftVersion (replaces the old Note backup)
    await createDraftVersionTrusted(ctx.db, {
        projectId: ctx.projectId,
        section: payload.section,
        content: tipTapContent as object,
        wordCount: payload.wordCount,
        artifactId: artifact.id,
        conversationId: artifact.conversationId ?? undefined,
    });

    // 2. Write to Draft table so the draft page displays it
    const { createDefaultDraftState } = await import("@/lib/draftStorage");
    const { DRAFT_SECTIONS } = await import("@/types/draft");

    // Match section name to draft section key (case-insensitive)
    const sectionKey = DRAFT_SECTIONS.find(
        (s) => s.key === payload.section.toLowerCase() || s.label.toLowerCase() === payload.section.toLowerCase()
    )?.key ?? payload.section.toLowerCase();

    const currentDraft = await getDraftTrusted(ctx.db, ctx.projectId);
    const draftState = currentDraft ?? createDefaultDraftState();

    draftState.contentBySection[sectionKey] = tipTapContent as typeof draftState.contentBySection[string];

    await saveDraftTrusted(ctx.db, ctx.projectId, draftState);
});

// evidence_table: persist the accepted table as a project note for downstream drafting/export
registerApplyFunction("evidence_table", async (ctx, artifact) => {
    const payload = artifact.payload as unknown as EvidenceTablePayload;
    const content = textToTipTapDoc(buildEvidenceTableMarkdown(payload));

    const existing = await listNotesTrusted(ctx.db, ctx.projectId);
    const evidenceNote = existing.find((note) =>
        note.title?.toLowerCase() === "evidence table"
        || note.linkedSection?.toLowerCase() === "evidence table"
        || note.tags?.some((tag) => tag.toLowerCase() === "evidence-table")
    );

    if (evidenceNote) {
        await updateNoteTrusted(ctx.db, evidenceNote.id, {
            title: "Evidence Table",
            linkedSection: "Evidence Table",
            content,
            tags: Array.from(new Set([...(evidenceNote.tags ?? []), "evidence-table"])),
        });
        return;
    }

    await createNoteTrusted(ctx.db, {
        projectId: ctx.projectId,
        title: "Evidence Table",
        linkedSection: "Evidence Table",
        content,
        source: "conversation",
        sourceConversationId: artifact.conversationId ?? undefined,
        tags: ["evidence-table"],
    });
});

// screening_batch: apply each study's triage decision
registerApplyFunction("screening_batch", async (ctx, artifact) => {
    const payload = artifact.payload as unknown as ScreeningBatchPayload;
    for (const study of payload.studies) {
        let existing: { id: string; details: unknown } | null = null;

        if (study.studyId) {
            existing = await ctx.db.study.findFirst({
                where: { id: study.studyId, projectId: ctx.projectId, deletedAt: null },
                select: { id: true, details: true },
            });
            if (!existing) {
                logServerWarn("screening_batch", "skipping study update because study was not found", {
                    studyId: study.studyId,
                    projectId: ctx.projectId,
                });
                continue;
            }
        } else {
            // Legacy artifact fallback: match by title only when no studyId exists.
            existing = await ctx.db.study.findFirst({
                where: { projectId: ctx.projectId, title: study.title, deletedAt: null },
                select: { id: true, details: true },
            });
        }

        if (!existing) continue;

        const screenedAtIso = new Date().toISOString();
        const details = (existing.details as Record<string, unknown>) ?? {};
        await ctx.db.study.update({
            where: { id: existing.id },
            data: {
                status: study.recommendation === "exclude"
                    ? "excluded"
                    : study.recommendation === "keep"
                        ? "active"
                        : "pending",
                details: {
                    ...details,
                    triageDecision: study.recommendation,
                    matchRationale: study.matchRationale,
                    screenedAt: screenedAtIso,
                    screeningMeta: {
                        tier: study.screeningTier ?? "ai",
                        modelConfidence: study.confidence,
                        reasons: study.matchRationale ? [study.matchRationale] : [],
                        screenedAt: screenedAtIso,
                        modelUsed: study.modelUsed,
                    },
                },
            },
        });
    }
});

// ── Snapshot readers (Wave 3A) ──────────────────────────────────────────────
// Capture "before" state so undo can restore it.

// study_update: capture the full study row before patching
snapshotReaders.set("study_update", async (ctx, artifact) => {
    const p = artifact.payload as unknown as StudyUpdatePayload;
    const study = await ctx.db.study.findFirst({
        where: { id: p.studyId, deletedAt: null },
        select: { id: true, title: true, authors: true, year: true, status: true, quality: true, details: true },
    });
    return study ?? null;
});

// study_proposal: capture existing study if one matches (null = new study)
snapshotReaders.set("study_proposal", async (ctx, artifact) => {
    const p = artifact.payload as unknown as StudyProposalPayload;
    const study = await ctx.db.study.findFirst({
        where: { projectId: ctx.projectId, title: p.title, deletedAt: null },
        select: { id: true, title: true, authors: true, year: true, status: true, quality: true, details: true },
    });
    return study ?? null;
});

// protocol_suggestion: capture the current field value before overwrite
snapshotReaders.set("protocol_suggestion", async (ctx, artifact) => {
    const p = artifact.payload as unknown as ProtocolSuggestionPayload;
    const protocol = await ctx.db.protocol.findUnique({
        where: { projectId: ctx.projectId },
        select: { data: true },
    });
    if (!protocol) return null;
    const previousValue = getNestedValue(protocol.data as Record<string, unknown>, p.field);
    return { field: p.field, previousValue };
});

// criteria_card: capture current eligibility before overwrite
snapshotReaders.set("criteria_card", async (ctx) => {
    const protocol = await ctx.db.protocol.findUnique({
        where: { projectId: ctx.projectId },
        select: { data: true },
    });
    if (!protocol) return null;
    const data = protocol.data as Record<string, unknown>;
    return (data as { eligibility?: unknown }).eligibility ?? null;
});

// draft_diff: capture current draft section content before overwrite
snapshotReaders.set("draft_diff", async (ctx, artifact) => {
    const p = artifact.payload as unknown as DraftDiffPayload;
    const { DRAFT_SECTIONS } = await import("@/types/draft");
    const currentDraft = await getDraftTrusted(ctx.db, ctx.projectId);
    if (!currentDraft) return null;
    const sectionKey = DRAFT_SECTIONS.find(
        (s) => s.key === p.section.toLowerCase() || s.label.toLowerCase() === p.section.toLowerCase()
    )?.key ?? p.section.toLowerCase();
    return currentDraft.contentBySection?.[sectionKey] ?? null;
});

// ── Restore functions (Wave 3B) ─────────────────────────────────────────────
// Revert domain state using the captured snapshot.

// study_update: restore previous study fields
restoreFunctions.set("study_update", async (ctx, artifact) => {
    const snap = artifact.snapshot as { id: string; title: string; authors: string; year: number; status: string; quality: string; details: unknown } | null;
    if (!snap) return;
    await ctx.db.study.update({
        where: { id: snap.id },
        data: {
            title: snap.title,
            authors: snap.authors,
            year: snap.year,
            status: snap.status,
            quality: snap.quality,
            details: (snap.details as object) ?? Prisma.DbNull,
        },
    });
});

// study_proposal: if snapshot null (new study), soft-delete it; else restore previous state
restoreFunctions.set("study_proposal", async (ctx, artifact) => {
    const p = artifact.payload as unknown as StudyProposalPayload;
    const study = await ctx.db.study.findFirst({
        where: { projectId: ctx.projectId, title: p.title, deletedAt: null },
        select: { id: true },
    });
    if (!study) return;

    const snap = artifact.snapshot as { id: string; status: string; quality: string; details: unknown } | null;
    if (!snap) {
        // Study was newly created by this artifact — soft-delete it
        await ctx.db.study.update({ where: { id: study.id }, data: { deletedAt: new Date() } });
    } else {
        // Restore previous state
        await ctx.db.study.update({
            where: { id: study.id },
            data: { status: snap.status, quality: snap.quality, details: (snap.details as object) ?? Prisma.DbNull },
        });
    }
});

// protocol_suggestion: restore previous field value
restoreFunctions.set("protocol_suggestion", async (ctx, artifact) => {
    const snap = artifact.snapshot as { field: string; previousValue: unknown } | null;
    if (!snap) return;
    const data = await ensureProtocolWithDb(ctx.db, ctx.projectId);
    setNestedValue(data as unknown as Record<string, unknown>, snap.field, snap.previousValue);
    await saveProtocolTrusted(ctx.db, ctx.projectId, data);
});

// criteria_card: restore previous eligibility
restoreFunctions.set("criteria_card", async (ctx, artifact) => {
    const previousEligibility = artifact.snapshot as { inclusion: string[]; exclusion: string[] } | null;
    if (!previousEligibility) return;
    const data = await ensureProtocolWithDb(ctx.db, ctx.projectId);
    data.eligibility.inclusion = previousEligibility.inclusion;
    data.eligibility.exclusion = previousEligibility.exclusion;
    await saveProtocolTrusted(ctx.db, ctx.projectId, data);
});

// draft_diff: restore previous draft section content
restoreFunctions.set("draft_diff", async (ctx, artifact) => {
    const p = artifact.payload as unknown as DraftDiffPayload;
    const { createDefaultDraftState } = await import("@/lib/draftStorage");
    const { DRAFT_SECTIONS } = await import("@/types/draft");

    const sectionKey = DRAFT_SECTIONS.find(
        (s) => s.key === p.section.toLowerCase() || s.label.toLowerCase() === p.section.toLowerCase()
    )?.key ?? p.section.toLowerCase();

    const currentDraft = await getDraftTrusted(ctx.db, ctx.projectId);
    const draftState = currentDraft ?? createDefaultDraftState();

    if (artifact.snapshot) {
        draftState.contentBySection[sectionKey] = artifact.snapshot as typeof draftState.contentBySection[string];
    } else {
        // No previous content — remove the section
        delete draftState.contentBySection[sectionKey];
    }

    await saveDraftTrusted(ctx.db, ctx.projectId, draftState);
});
