/**
 * Artifact CRUD + Apply/Undo
 * Manages inline artifact lifecycle (planC Phase 0.5)
 */

import "server-only";
import { prisma } from "@/lib/server/prisma";
import type { ArtifactType, ArtifactStatus } from "@/types/artifacts";
import { ARTIFACT_PAYLOAD_SCHEMAS } from "@/types/artifacts";
import { emitEvent } from "./events";

// ── Apply function registry ──────────────────────────────────────────────────

type ApplyFunction = (
    artifact: { id: string; projectId: string; payload: unknown; snapshot: unknown },
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
 * Review an artifact (accept, reject, or edit)
 */
export async function reviewArtifact(
    artifactId: string,
    status: Extract<ArtifactStatus, "accepted" | "rejected" | "edited">,
    reviewNote?: string
) {
    const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } });
    if (!artifact) throw new Error("Artifact not found");
    if (artifact.status !== "proposed") {
        throw new Error(`Cannot review artifact with status "${artifact.status}"`);
    }

    const updated = await prisma.artifact.update({
        where: { id: artifactId },
        data: {
            status,
            reviewedAt: new Date(),
            reviewNote: reviewNote ?? null,
        },
    });

    // If accepted, apply the artifact
    if (status === "accepted") {
        await applyArtifact(artifactId);
    }

    return updated;
}

/**
 * Apply an artifact — run the type-specific apply function
 */
export async function applyArtifact(artifactId: string) {
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
            data: { appliedAt: new Date() },
        });
    }

    // Run apply function
    await applyFn({
        id: artifact.id,
        projectId: artifact.projectId,
        payload: artifact.payload,
        snapshot: artifact.snapshot,
    });

    // Mark applied
    const applied = await prisma.artifact.update({
        where: { id: artifactId },
        data: {
            appliedAt: new Date(),
            applyId: artifact.id, // self-referencing idempotency key
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
