/**
 * Artifact CRUD + Apply/Undo
 * Manages inline artifact lifecycle (planC Phase 0.5)
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";
import type { ArtifactType, ArtifactStatus, CriteriaCardPayload, ProtocolSuggestionPayload, MemoryProposalPayload, StudyProposalPayload, StudyUpdatePayload, DraftDiffPayload, ScreeningBatchPayload } from "@/types/artifacts";
import type { StudyType, StudySource, StudyDetails } from "@/types/ledger";
import { ARTIFACT_PAYLOAD_SCHEMAS } from "@/types/artifacts";
import type { ProtocolData } from "@/types/protocol";
import { emitEvent } from "./events";
import { onStudyAccepted, onStudyExcluded, onDraftAccepted, onArtifactEdited } from "@/lib/server/memory/decision-extractor";
import { syncProtocolToMemory } from "@/lib/server/memory/protocol-sync";
import { validateFieldValue, isValidFieldPath } from "@/lib/protocol-fields";
import { setUserMemory, createProjectMemory } from "@/lib/server/memory";
import { createNote, updateNote, textToTipTapDoc, listNotes, type NoteContent, extractTextFromContent } from "@/lib/server/notes";
import { upsertStudy, updateStudy } from "@/lib/server/ledger";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";

// ── Apply function registry ──────────────────────────────────────────────────

type ApplyFunction = (
    artifact: { id: string; projectId: string; payload: unknown; snapshot: unknown; conversationId?: string | null; userId?: string | null },
) => Promise<void>;

const applyFunctions = new Map<ArtifactType, ApplyFunction>();

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
    projectId: string;
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
            projectId: input.projectId,
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
 * Undo an artifact — restore from snapshot.
 * Only allowed for append-only actions or within 5-minute window.
 */
export async function undoArtifact(artifactId: string) {
    const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } });
    if (!artifact) throw new Error("Artifact not found");
    if (!artifact.appliedAt) throw new Error("Artifact has not been applied");
    if (!artifact.snapshot) throw new Error("No snapshot available for undo");

    // Check 5-minute window
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (artifact.appliedAt < fiveMinutesAgo) {
        throw new Error("Undo window has expired (5 minutes)");
    }

    // TODO: implement type-specific undo using snapshot
    // For now, mark as rejected (undo = reverted)
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
    artifact: { type: string; projectId: string; runId: string | null; conversationId: string | null; userId: string | null; payload: unknown; snapshot: unknown },
    status: string,
    reviewNote?: string,
): Promise<void> {
    const payload = artifact.payload as Record<string, unknown>;

    if (artifact.type === "study_proposal") {
        const sp = payload as unknown as import("@/types/artifacts").StudyProposalPayload;
        if (status === "accepted" && sp.recommendation === "keep") {
            // Look up study by title to get studyId
            const study = await prisma.study.findFirst({
                where: { projectId: artifact.projectId, title: sp.title },
                select: { id: true },
            });
            if (study) {
                await onStudyAccepted(artifact.projectId, study.id, sp);
            }
        } else if (status === "rejected" || sp.recommendation === "exclude") {
            await onStudyExcluded(artifact.projectId, sp, reviewNote);
        }
    } else if (artifact.type === "draft_diff" && status === "accepted") {
        const dp = payload as unknown as import("@/types/artifacts").DraftDiffPayload;
        await onDraftAccepted(artifact.projectId, dp);
    } else if (status === "edited" && artifact.snapshot && artifact.runId) {
        await onArtifactEdited(
            artifact.runId,
            artifact.projectId,
            artifact.conversationId,
            artifact.userId ?? undefined,
            artifact.snapshot,
            artifact.payload,
            artifact.type as ArtifactType,
        );
    }
}

// ── Apply function registrations ─────────────────────────────────────────────

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown) {
    const keys = path.split(".");
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        current = current[keys[i]] as Record<string, unknown>;
        if (!current) return;
    }
    current[keys[keys.length - 1]] = value;
}

// criteria_card: update protocol eligibility, then sync to memory
registerApplyFunction("criteria_card", async (artifact) => {
    const payload = artifact.payload as CriteriaCardPayload;
    const protocol = await prisma.protocol.findUnique({ where: { projectId: artifact.projectId } });
    if (!protocol) return;
    const data = protocol.data as unknown as ProtocolData;
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

    const protocol = await prisma.protocol.findUnique({ where: { projectId: artifact.projectId } });
    if (!protocol) return;
    const data = protocol.data as unknown as ProtocolData;
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
        await setUserMemory({
            userId: artifact.userId || "single-user",
            type: "preference",
            key: payload.key || `auto-${Date.now()}`,
            value: payload.value,
            rationale: payload.rationale,
            tags: ["ai-proposed"],
        });
    } else if (payload.memoryType === "project") {
        await createProjectMemory({
            projectId: artifact.projectId,
            type: "decision",
            statement: payload.value,
            rationale: payload.rationale,
            importance: "normal",
            tags: ["ai-proposed"],
        });
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

// study_proposal: upsert the study with triage decision
registerApplyFunction("study_proposal", async (artifact) => {
    const payload = artifact.payload as StudyProposalPayload;
    await upsertStudy(SINGLE_USER_SCOPE, artifact.projectId, {
        title: payload.title,
        authors: payload.authors,
        year: payload.year,
        status: payload.recommendation === "exclude" ? "excluded"
              : payload.recommendation === "keep" ? "active"
              : "pending",
        quality: "-",
        details: {
            doi: payload.doi,
            pmid: payload.pmid,
            abstract: payload.abstract,
            journal: payload.journal,
            studyType: payload.studyType as StudyType | undefined,
            sampleSize: payload.sampleSize,
            triageDecision: payload.recommendation,
            matchRationale: payload.matchRationale,
            source: payload.source as StudySource | undefined,
            sourceUrl: payload.sourceUrl,
        },
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
        where: { id: payload.studyId, projectId: artifact.projectId },
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

    await updateStudy(SINGLE_USER_SCOPE, artifact.projectId, payload.studyId, {
        ...(payload.patch.top ?? {}),
        ...(payload.patch.details ? { details: payload.patch.details as Partial<StudyDetails> } : {}),
    });
});

// draft_diff: write content to the Draft table (displayed by draft page) and Note table (provenance)
registerApplyFunction("draft_diff", async (artifact) => {
    const payload = artifact.payload as DraftDiffPayload;
    const tipTapContent = textToTipTapDoc(payload.content);

    // 1. Write to Note table (provenance/backup)
    const existing = await listNotes(artifact.projectId);
    const sectionNote = existing.find(
        (n) => n.linkedSection?.toLowerCase() === payload.section.toLowerCase()
    );

    if (sectionNote) {
        await updateNote(sectionNote.id, {
            content: tipTapContent,
        });
    } else {
        await createNote({
            projectId: artifact.projectId,
            title: payload.section,
            content: tipTapContent,
            linkedSection: payload.section,
            source: "conversation",
            sourceConversationId: artifact.conversationId ?? undefined,
            tags: ["draft", payload.section.toLowerCase()],
        });
    }

    // 2. Write to Draft table so the draft page displays it
    const { getDraft, saveDraft } = await import("@/lib/server/drafts");
    const { createDefaultDraftState } = await import("@/lib/draftStorage");
    const { DRAFT_SECTIONS } = await import("@/types/draft");

    // Match section name to draft section key (case-insensitive)
    const sectionKey = DRAFT_SECTIONS.find(
        (s) => s.key === payload.section.toLowerCase() || s.label.toLowerCase() === payload.section.toLowerCase()
    )?.key ?? payload.section.toLowerCase();

    const currentDraft = await getDraft(SINGLE_USER_SCOPE, artifact.projectId);
    const draftState = currentDraft ?? createDefaultDraftState();

    draftState.contentBySection[sectionKey] = tipTapContent as typeof draftState.contentBySection[string];

    await saveDraft(SINGLE_USER_SCOPE, artifact.projectId, draftState);
});

// screening_batch: apply each study's triage decision
registerApplyFunction("screening_batch", async (artifact) => {
    const payload = artifact.payload as ScreeningBatchPayload;
    for (const study of payload.studies) {
        // Find the study in the ledger by title
        const existing = await prisma.study.findFirst({
            where: { projectId: artifact.projectId, title: study.title },
            select: { id: true, details: true },
        });
        if (!existing) continue;

        const details = (existing.details as Record<string, unknown>) ?? {};
        await prisma.study.update({
            where: { id: existing.id },
            data: {
                status: study.recommendation === "exclude" ? "excluded" : "active",
                details: {
                    ...details,
                    triageDecision: study.recommendation,
                    matchRationale: study.matchRationale,
                    screenedAt: new Date().toISOString(),
                },
            },
        });
    }
});
