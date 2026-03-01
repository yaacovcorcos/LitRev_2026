/**
 * Artifact CRUD + Apply/Undo
 * Manages inline artifact lifecycle (planC Phase 0.5)
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";
import { Prisma } from "@prisma/client";
import type { ArtifactType, ArtifactStatus, CriteriaCardPayload, ProtocolSuggestionPayload, MemoryProposalPayload, MemoryForgetProposalPayload, StudyProposalPayload, StudyUpdatePayload, DraftDiffPayload, ScreeningBatchPayload, EvidenceTablePayload } from "@/types/artifacts";
import type { StudyType, StudySource, StudyDetails } from "@/types/ledger";
import { ARTIFACT_PAYLOAD_SCHEMAS } from "@/types/artifacts";
import type { ProtocolData } from "@/types/protocol";
import { emitEvent } from "./events";
import { onStudyAccepted, onStudyExcluded, onDraftAccepted, onArtifactEdited } from "@/lib/server/memory/decision-extractor";
import { syncProtocolToMemory } from "@/lib/server/memory/protocol-sync";
import { ensureProtocol } from "@/lib/server/protocols";
import { validateFieldValue, isValidFieldPath } from "@/lib/protocol-fields";
import { requireActorContext } from "@/lib/server/actor";
import { setUserMemory, createProjectMemory, getProjectMemories, getUserMemories } from "@/lib/server/memory";
import { normalizedMemoryKey, normalizedMemoryValue } from "@/lib/server/memory/conflict-policy";
import { createNote, updateNote, textToTipTapDoc, listNotes, type NoteContent, extractTextFromContent } from "@/lib/server/notes";
import { upsertStudy, updateStudy } from "@/lib/server/ledger";

// ── Apply function registry ──────────────────────────────────────────────────

type ApplyFunction = (
    artifact: { id: string; projectId: string; payload: unknown; snapshot: unknown; conversationId?: string | null; userId?: string | null },
) => Promise<void>;

const applyFunctions = new Map<ArtifactType, ApplyFunction>();

// ── Snapshot reader registry (Wave 3A) ──────────────────────────────────────
// Each reader captures "before" state so undoArtifact can restore it.

type SnapshotReader = (projectId: string, payload: unknown) => Promise<unknown | null>;

const snapshotReaders = new Map<ArtifactType, SnapshotReader>();

// ── Restore function registry (Wave 3B) ─────────────────────────────────────
// Each restore function uses the captured snapshot to revert the domain state.

type RestoreFunction = (ctx: { projectId: string; payload: unknown; snapshot: unknown }) => Promise<void>;

const restoreFunctions = new Map<ArtifactType, RestoreFunction>();

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
            throw new Error(`Invalid artifact payload for ${input.type}: ${issues}`);
        }
    }

    return prisma.artifact.create({
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
}

/**
 * Review an artifact (accept, reject, or edit).
 * If `editedPayload` is provided, the artifact's payload is updated before applying.
 * This supports the edit-then-accept flow where the user tweaks a proposal before saving.
 */
export async function reviewArtifact(
    artifactId: string,
    status: Extract<ArtifactStatus, "accepted" | "rejected" | "edited">,
    reviewNote?: string,
    editedPayload?: Record<string, unknown>,
) {
    const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } });
    if (!artifact) throw new Error("Artifact not found");
    // Idempotent: if already in the requested status, return as-is
    if (artifact.status === status) {
        return artifact;
    }
    if (artifact.status !== "proposed") {
        throw new Error(`Cannot review artifact with status "${artifact.status}"`);
    }

    // If the user edited the payload, validate and update it atomically with the review
    if (editedPayload && status === "accepted") {
        const schema = ARTIFACT_PAYLOAD_SCHEMAS[artifact.type as ArtifactType];
        if (schema) {
            const validation = schema.safeParse(editedPayload);
            if (!validation.success) {
                const issues = validation.error.issues
                    .map((i) => `${i.path.join(".")}: ${i.message}`)
                    .join("; ");
                throw new Error(`Invalid edited payload for ${artifact.type}: ${issues}`);
            }
        }
        // Update payload in DB before applying
        await prisma.artifact.update({
            where: { id: artifactId },
            data: { payload: editedPayload as object },
        });
    }

    const updated = await prisma.artifact.update({
        where: { id: artifactId },
        data: {
            status,
            reviewedAt: new Date(),
            reviewNote: reviewNote ?? null,
        },
    });

    await trackMemoryProposalReview(artifact, status);

    // If accepted, apply the artifact (reads payload from DB — includes edits if any)
    if (status === "accepted") {
        await applyArtifact(artifactId);
    }

    // Decision memory extraction (fire-and-forget)
    extractDecisionMemory(artifact, status, reviewNote).catch((err) =>
        console.error("[decision-extractor] Failed:", err)
    );

    return updated;
}

/**
 * Apply an artifact — run the type-specific apply function
 */
export async function applyArtifact(
    artifactId: string,
    statusOverride?: Extract<ArtifactStatus, "accepted" | "auto_applied">
) {
    const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } });
    if (!artifact) throw new Error("Artifact not found");

    // Idempotency check
    if (artifact.appliedAt) return artifact;

    const applyFn = applyFunctions.get(artifact.type as ArtifactType);
    if (!applyFn) {
        console.warn(`No apply function registered for artifact type: ${artifact.type}`);
        // Still mark as applied — the artifact was accepted
        return prisma.artifact.update({
            where: { id: artifactId },
            data: {
                appliedAt: new Date(),
                ...(statusOverride ? { status: statusOverride } : {}),
            },
        });
    }

    // Run apply function
    if (!artifact.projectId) {
        throw new Error("Cannot apply artifact without a project context");
    }

    // Capture snapshot before applying (enables undo — Wave 3A)
    const snapshotReader = snapshotReaders.get(artifact.type as ArtifactType);
    if (snapshotReader) {
        try {
            const snapshot = await snapshotReader(artifact.projectId, artifact.payload);
            // Write snapshot even if null — null means "entity didn't exist before"
            await prisma.artifact.update({
                where: { id: artifactId },
                data: { snapshot: (snapshot ?? Prisma.DbNull) as Prisma.InputJsonValue },
            });
        } catch (err) {
            // Snapshot capture failure should not block the apply
            console.warn(`[artifacts] Snapshot capture failed for ${artifact.type}:`, err);
        }
    }

    await applyFn({
        id: artifact.id,
        projectId: artifact.projectId,
        payload: artifact.payload,
        snapshot: artifact.snapshot,
        conversationId: artifact.conversationId,
        userId: artifact.userId,
    });

    // Mark applied
    const applied = await prisma.artifact.update({
        where: { id: artifactId },
        data: {
            appliedAt: new Date(),
            applyId: artifact.id, // self-referencing idempotency key
            ...(statusOverride ? { status: statusOverride } : {}),
        },
    });

    // Emit event
    if (artifact.runId) {
        await emitEvent(artifact.runId, "artifact_reviewed", {
            artifactId: artifact.id,
            status: "applied",
            type: artifact.type,
        }, { artifactId: artifact.id });
    }

    return applied;
}

/**
 * Undo an artifact — restore domain state from snapshot, then mark rejected.
 * Only allowed within a 5-minute window after apply.
 */
export async function undoArtifact(artifactId: string) {
    const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } });
    if (!artifact) throw new Error("Artifact not found");
    if (!artifact.appliedAt) throw new Error("Artifact has not been applied");

    // Check 5-minute window
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (artifact.appliedAt < fiveMinutesAgo) {
        throw new Error("Undo window has expired (5 minutes)");
    }

    // Run type-specific restore if available and snapshot was captured
    const restoreFn = restoreFunctions.get(artifact.type as ArtifactType);
    if (restoreFn && artifact.projectId) {
        // snapshot may be null (meaning "entity didn't exist before apply")
        await restoreFn({
            projectId: artifact.projectId,
            payload: artifact.payload,
            snapshot: artifact.snapshot,
        });
    }

    return prisma.artifact.update({
        where: { id: artifactId },
        data: {
            status: "rejected",
            reviewNote: "Undone by user",
        },
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
registerApplyFunction("criteria_card", async (artifact) => {
    const payload = artifact.payload as CriteriaCardPayload;
    const data = await ensureProtocol(artifact.projectId);
    data.eligibility.inclusion = payload.inclusion;
    data.eligibility.exclusion = payload.exclusion;
    await prisma.protocol.update({
        where: { projectId: artifact.projectId },
        data: { data: data as unknown as object },
    });
    await syncProtocolToMemory(artifact.projectId, data);
});

// protocol_suggestion: update protocol field, then sync
registerApplyFunction("protocol_suggestion", async (artifact) => {
    const payload = artifact.payload as ProtocolSuggestionPayload;

    // Final gate: validate field path and value type before writing
    if (!isValidFieldPath(payload.field)) {
        throw new Error(`Invalid protocol field: "${payload.field}"`);
    }
    const fieldCheck = validateFieldValue(payload.field, payload.value);
    if (!fieldCheck.valid) {
        throw new Error(`Cannot apply protocol_suggestion: ${fieldCheck.error}`);
    }

    const data = await ensureProtocol(artifact.projectId);
    setNestedValue(data as unknown as Record<string, unknown>, payload.field, fieldCheck.value);
    await prisma.protocol.update({
        where: { projectId: artifact.projectId },
        data: { data: data as unknown as object },
    });
    await syncProtocolToMemory(artifact.projectId, data);
});

// memory_proposal: create the actual memory entry
registerApplyFunction("memory_proposal", async (artifact) => {
    const payload = artifact.payload as MemoryProposalPayload;
    if (payload.memoryType === "user") {
        const userId = artifact.userId || requireActorContext().userId;
        const key = normalizedMemoryKey(payload.key || `auto_${Date.now()}`);
        const keyTag = `memory-key:${key}`;
        const incomingValue = normalizedMemoryValue(payload.value);
        const activeUserMemories = await getUserMemories(userId, { status: "active" });
        const sameLogicalKey = activeUserMemories.filter((memory) => normalizedMemoryKey(memory.key) === key);
        const hasConflict = sameLogicalKey.some((memory) => normalizedMemoryValue(memory.value) !== incomingValue);
        const variantIds = sameLogicalKey
            .filter((memory) => memory.key !== key)
            .map((memory) => memory.id);

        if (variantIds.length > 0) {
            await prisma.userMemory.updateMany({
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

        await setUserMemory({
            userId,
            type: "preference",
            key,
            value: payload.value,
            rationale: payload.rationale,
            tags: ["ai-proposed", keyTag],
        });
        await prisma.$executeRaw`
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
            const existing = await getProjectMemories(artifact.projectId, { status: "active", tags: [keyTag] });
            const exact = existing.find((m) => normalizedMemoryValue(m.statement) === normalizedValue);
            if (exact) {
                await prisma.projectMemory.update({
                    where: { id: exact.id },
                    data: {
                        rationale: payload.rationale ?? exact.rationale,
                    },
                });
                await prisma.$executeRaw`
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
                await prisma.projectMemory.updateMany({
                    where: { id: { in: conflictingIds } },
                    data: {
                        status: "archived",
                        archivedAt: new Date(),
                    },
                });
                const idValues = conflictingIds.map((id) => Prisma.sql`${id}`);
                await prisma.$executeRaw`
                    UPDATE "ProjectMemory"
                    SET "contradictionCount" = "contradictionCount" + 1
                    WHERE "id" IN (${Prisma.join(idValues)})
                `;
            }
        }

        const created = await createProjectMemory({
            projectId: artifact.projectId,
            type: "decision",
            statement: payload.value,
            rationale: payload.rationale,
            importance: "normal",
            tags: keyTag ? ["ai-proposed", keyTag] : ["ai-proposed"],
        });
        await prisma.$executeRaw`
            UPDATE "ProjectMemory"
            SET "acceptedCount" = "acceptedCount" + 1,
                "contradictionCount" = "contradictionCount" + ${conflictCount > 0 ? 1 : 0}
            WHERE "id" = ${created.id}
        `;
    } else if (payload.memoryType === "note") {
        await createNote({
            projectId: artifact.projectId,
            title: payload.key || undefined,
            content: textToTipTapDoc(payload.value),
            source: "conversation",
            sourceConversationId: artifact.conversationId ?? undefined,
            tags: ["ai-proposed"],
        });
    }
});

// memory_forget_proposal: archive selected memories (forget semantics = archive, not hard delete)
registerApplyFunction("memory_forget_proposal", async (artifact) => {
    const payload = artifact.payload as MemoryForgetProposalPayload;
    const matchIds = payload.matches.map((m) => m.id);
    if (matchIds.length === 0) return;

    if (payload.memoryType === "user") {
        const userId = artifact.userId || requireActorContext().userId;
        await prisma.userMemory.updateMany({
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
        await prisma.$executeRaw`
            UPDATE "UserMemory"
            SET "rejectedCount" = "rejectedCount" + 1
            WHERE "id" IN (${Prisma.join(idValues)})
        `;
        return;
    }

    await prisma.projectMemory.updateMany({
        where: {
            id: { in: matchIds },
            projectId: artifact.projectId,
            status: "active",
        },
        data: {
            status: "archived",
            archivedAt: new Date(),
        },
    });
    const idValues = matchIds.map((id) => Prisma.sql`${id}`);
    await prisma.$executeRaw`
        UPDATE "ProjectMemory"
        SET "rejectedCount" = "rejectedCount" + 1
        WHERE "id" IN (${Prisma.join(idValues)})
    `;
});

// study_proposal: upsert the study with triage decision
registerApplyFunction("study_proposal", async (artifact) => {
    const payload = artifact.payload as StudyProposalPayload;
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
        matchRationale: payload.matchRationale,
        source: normalizedSource,
        sourceUrl: payload.sourceUrl,
    };
    if (payload.doi) detailPatch.doi = payload.doi;
    if (payload.pmid) detailPatch.pmid = payload.pmid;
    if (payload.abstract) detailPatch.abstract = payload.abstract;
    if (payload.journal) detailPatch.journal = payload.journal;
    if (payload.studyType) detailPatch.studyType = payload.studyType as StudyType;
    if (typeof payload.sampleSize === "number") detailPatch.sampleSize = payload.sampleSize;

    if (payload.studyId) {
        const existing = await prisma.study.findFirst({
            where: { id: payload.studyId, projectId: artifact.projectId, deletedAt: null },
            select: { id: true },
        });
        if (existing) {
            await updateStudy(undefined, artifact.projectId, existing.id, {
                status: mappedStatus,
                details: detailPatch,
            });
            return;
        }
    }

    await upsertStudy(undefined, artifact.projectId, {
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
registerApplyFunction("study_update", async (artifact) => {
    const payload = artifact.payload as StudyUpdatePayload;

    // Defensive idempotency check in case of retries/races around accept/apply
    const existingArtifact = await prisma.artifact.findUnique({
        where: { id: artifact.id },
        select: { appliedAt: true },
    });
    if (existingArtifact?.appliedAt) return;

    const currentStudy = await prisma.study.findFirst({
        where: { id: payload.studyId, projectId: artifact.projectId, deletedAt: null },
        select: { updatedAt: true },
    });
    if (!currentStudy) {
        throw new Error(`Study not found: ${payload.studyId}`);
    }

    const snapshotMs = new Date(payload.snapshotAt).getTime();
    const currentMs = new Date(currentStudy.updatedAt).getTime();
    if (Number.isFinite(snapshotMs) && currentMs > snapshotMs) {
        console.warn(
            `[study_update] Concurrency warning for study ${payload.studyId}: current updatedAt is newer than snapshotAt. Applying accepted patch.`
        );
    }

    await updateStudy(undefined, artifact.projectId, payload.studyId, {
        ...(payload.patch.top ?? {}),
        ...(payload.patch.details ? { details: payload.patch.details as Partial<StudyDetails> } : {}),
    });
});

// draft_diff: write content to the Draft table (displayed by draft page) and DraftVersion (provenance)
registerApplyFunction("draft_diff", async (artifact) => {
    const payload = artifact.payload as DraftDiffPayload;
    const tipTapContent = textToTipTapDoc(payload.content);

    // 1. Write immutable DraftVersion (replaces the old Note backup)
    const { createDraftVersion } = await import("@/lib/server/draft-versions");
    await createDraftVersion(undefined, {
        projectId: artifact.projectId,
        section: payload.section,
        content: tipTapContent as object,
        wordCount: payload.wordCount,
        artifactId: artifact.id,
        conversationId: artifact.conversationId ?? undefined,
    });

    // 2. Write to Draft table so the draft page displays it
    const { getDraft, saveDraft } = await import("@/lib/server/drafts");
    const { createDefaultDraftState } = await import("@/lib/draftStorage");
    const { DRAFT_SECTIONS } = await import("@/types/draft");

    // Match section name to draft section key (case-insensitive)
    const sectionKey = DRAFT_SECTIONS.find(
        (s) => s.key === payload.section.toLowerCase() || s.label.toLowerCase() === payload.section.toLowerCase()
    )?.key ?? payload.section.toLowerCase();

    const currentDraft = await getDraft(undefined, artifact.projectId);
    const draftState = currentDraft ?? createDefaultDraftState();

    draftState.contentBySection[sectionKey] = tipTapContent as typeof draftState.contentBySection[string];

    await saveDraft(undefined, artifact.projectId, draftState);
});

// evidence_table: persist the accepted table as a project note for downstream drafting/export
registerApplyFunction("evidence_table", async (artifact) => {
    const payload = artifact.payload as EvidenceTablePayload;
    const content = textToTipTapDoc(buildEvidenceTableMarkdown(payload));

    const existing = await listNotes(artifact.projectId);
    const evidenceNote = existing.find((note) =>
        note.title?.toLowerCase() === "evidence table"
        || note.linkedSection?.toLowerCase() === "evidence table"
        || note.tags?.some((tag) => tag.toLowerCase() === "evidence-table")
    );

    if (evidenceNote) {
        await updateNote(evidenceNote.id, {
            title: "Evidence Table",
            linkedSection: "Evidence Table",
            content,
            tags: Array.from(new Set([...(evidenceNote.tags ?? []), "evidence-table"])),
        });
        return;
    }

    await createNote({
        projectId: artifact.projectId,
        title: "Evidence Table",
        linkedSection: "Evidence Table",
        content,
        source: "conversation",
        sourceConversationId: artifact.conversationId ?? undefined,
        tags: ["evidence-table"],
    });
});

// screening_batch: apply each study's triage decision
registerApplyFunction("screening_batch", async (artifact) => {
    const payload = artifact.payload as ScreeningBatchPayload;
    for (const study of payload.studies) {
        let existing: { id: string; details: unknown } | null = null;

        if (study.studyId) {
            existing = await prisma.study.findFirst({
                where: { id: study.studyId, projectId: artifact.projectId, deletedAt: null },
                select: { id: true, details: true },
            });
            if (!existing) {
                console.warn(
                    `[screening_batch] Skipping study update: studyId "${study.studyId}" not found in project "${artifact.projectId}".`
                );
                continue;
            }
        } else {
            // Legacy artifact fallback: match by title only when no studyId exists.
            existing = await prisma.study.findFirst({
                where: { projectId: artifact.projectId, title: study.title, deletedAt: null },
                select: { id: true, details: true },
            });
        }

        if (!existing) continue;

        const screenedAtIso = new Date().toISOString();
        const details = (existing.details as Record<string, unknown>) ?? {};
        await prisma.study.update({
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
snapshotReaders.set("study_update", async (_projectId, payload) => {
    const p = payload as StudyUpdatePayload;
    const study = await prisma.study.findFirst({
        where: { id: p.studyId, deletedAt: null },
        select: { id: true, title: true, authors: true, year: true, status: true, quality: true, details: true },
    });
    return study ?? null;
});

// study_proposal: capture existing study if one matches (null = new study)
snapshotReaders.set("study_proposal", async (projectId, payload) => {
    const p = payload as StudyProposalPayload;
    const study = await prisma.study.findFirst({
        where: { projectId, title: p.title, deletedAt: null },
        select: { id: true, title: true, authors: true, year: true, status: true, quality: true, details: true },
    });
    return study ?? null;
});

// protocol_suggestion: capture the current field value before overwrite
snapshotReaders.set("protocol_suggestion", async (projectId, payload) => {
    const p = payload as ProtocolSuggestionPayload;
    const protocol = await prisma.protocol.findUnique({
        where: { projectId },
        select: { data: true },
    });
    if (!protocol) return null;
    const previousValue = getNestedValue(protocol.data as Record<string, unknown>, p.field);
    return { field: p.field, previousValue };
});

// criteria_card: capture current eligibility before overwrite
snapshotReaders.set("criteria_card", async (projectId) => {
    const protocol = await prisma.protocol.findUnique({
        where: { projectId },
        select: { data: true },
    });
    if (!protocol) return null;
    const data = protocol.data as Record<string, unknown>;
    return (data as { eligibility?: unknown }).eligibility ?? null;
});

// draft_diff: capture current draft section content before overwrite
snapshotReaders.set("draft_diff", async (projectId, payload) => {
    const p = payload as DraftDiffPayload;
    const { getDraft } = await import("@/lib/server/drafts");
    const { DRAFT_SECTIONS } = await import("@/types/draft");
    const currentDraft = await getDraft(undefined, projectId);
    if (!currentDraft) return null;
    const sectionKey = DRAFT_SECTIONS.find(
        (s) => s.key === p.section.toLowerCase() || s.label.toLowerCase() === p.section.toLowerCase()
    )?.key ?? p.section.toLowerCase();
    return currentDraft.contentBySection?.[sectionKey] ?? null;
});

// ── Restore functions (Wave 3B) ─────────────────────────────────────────────
// Revert domain state using the captured snapshot.

// study_update: restore previous study fields
restoreFunctions.set("study_update", async ({ snapshot }) => {
    const snap = snapshot as { id: string; title: string; authors: string; year: number; status: string; quality: string; details: unknown } | null;
    if (!snap) return;
    await prisma.study.update({
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
restoreFunctions.set("study_proposal", async ({ projectId, payload, snapshot }) => {
    const p = payload as StudyProposalPayload;
    const study = await prisma.study.findFirst({
        where: { projectId, title: p.title, deletedAt: null },
        select: { id: true },
    });
    if (!study) return;

    const snap = snapshot as { id: string; status: string; quality: string; details: unknown } | null;
    if (!snap) {
        // Study was newly created by this artifact — soft-delete it
        await prisma.study.update({ where: { id: study.id }, data: { deletedAt: new Date() } });
    } else {
        // Restore previous state
        await prisma.study.update({
            where: { id: study.id },
            data: { status: snap.status, quality: snap.quality, details: (snap.details as object) ?? Prisma.DbNull },
        });
    }
});

// protocol_suggestion: restore previous field value
restoreFunctions.set("protocol_suggestion", async ({ projectId, snapshot }) => {
    const snap = snapshot as { field: string; previousValue: unknown } | null;
    if (!snap) return;
    const data = await ensureProtocol(projectId);
    setNestedValue(data as unknown as Record<string, unknown>, snap.field, snap.previousValue);
    await prisma.protocol.update({
        where: { projectId },
        data: { data: data as unknown as object },
    });
});

// criteria_card: restore previous eligibility
restoreFunctions.set("criteria_card", async ({ projectId, snapshot }) => {
    const previousEligibility = snapshot as { inclusion: string[]; exclusion: string[] } | null;
    if (!previousEligibility) return;
    const data = await ensureProtocol(projectId);
    data.eligibility.inclusion = previousEligibility.inclusion;
    data.eligibility.exclusion = previousEligibility.exclusion;
    await prisma.protocol.update({
        where: { projectId },
        data: { data: data as unknown as object },
    });
});

// draft_diff: restore previous draft section content
restoreFunctions.set("draft_diff", async ({ projectId, payload, snapshot }) => {
    const p = payload as DraftDiffPayload;
    const { getDraft, saveDraft } = await import("@/lib/server/drafts");
    const { createDefaultDraftState } = await import("@/lib/draftStorage");
    const { DRAFT_SECTIONS } = await import("@/types/draft");

    const sectionKey = DRAFT_SECTIONS.find(
        (s) => s.key === p.section.toLowerCase() || s.label.toLowerCase() === p.section.toLowerCase()
    )?.key ?? p.section.toLowerCase();

    const currentDraft = await getDraft(undefined, projectId);
    const draftState = currentDraft ?? createDefaultDraftState();

    if (snapshot) {
        draftState.contentBySection[sectionKey] = snapshot as typeof draftState.contentBySection[string];
    } else {
        // No previous content — remove the section
        delete draftState.contentBySection[sectionKey];
    }

    await saveDraft(undefined, projectId, draftState);
});
