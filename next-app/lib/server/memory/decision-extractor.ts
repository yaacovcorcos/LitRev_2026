/**
 * Decision Memory Extraction
 * Captures memories from artifact review decisions (planC Phase 5.2)
 */

import "server-only";
import type {
    StudyProposalPayload,
    DraftDiffPayload,
    MemoryProposalPayload,
    ArtifactType,
} from "@/types/artifacts";
import { createProjectMemory } from "./project-memory";
import { batchCreateStudyMemories, type CreateStudyMemoryInput } from "./study-memory";
import { createArtifact } from "@/lib/server/agent/artifacts";

/**
 * Extract memories when a study is accepted (keep).
 * Creates StudyMemory entries for the accepted study.
 */
export async function onStudyAccepted(
    projectId: string,
    studyId: string,
    payload: StudyProposalPayload,
): Promise<void> {
    const memories: CreateStudyMemoryInput[] = [];

    // Summary from abstract or keyDetail
    if (payload.abstract || payload.keyDetail) {
        memories.push({
            studyId,
            projectId,
            type: "summary",
            content: payload.keyDetail || payload.abstract!.slice(0, 500),
            source: "artifact_accept",
            authority: "confirmed",
            confidence: payload.confidence,
            tags: ["artifact-decision", "study-accepted"],
        });
    }

    // Methods from studyType + sampleSize
    if (payload.studyType) {
        memories.push({
            studyId,
            projectId,
            type: "methods",
            content: `Study design: ${payload.studyType}${payload.sampleSize ? `, n=${payload.sampleSize}` : ""}`,
            source: "artifact_accept",
            authority: "confirmed",
            confidence: payload.confidence,
            tags: ["artifact-decision", "study-accepted"],
        });
    }

    if (memories.length > 0) {
        await batchCreateStudyMemories(memories);
    }
}

/**
 * Extract memory when a study is excluded.
 * Creates ProjectMemory with the exclusion rationale.
 */
export async function onStudyExcluded(
    projectId: string,
    payload: StudyProposalPayload,
    reviewNote?: string,
): Promise<void> {
    const rationale = reviewNote || payload.matchRationale || "No rationale provided";

    await createProjectMemory({
        projectId,
        type: "decision",
        category: "exclusion",
        statement: `Excluded "${payload.title}" (${payload.authors}, ${payload.year})`,
        rationale,
        importance: "normal",
        source: "artifact_accept",
        authority: "confirmed",
        polarity: "rejecting",
        tags: ["artifact-decision", "study-excluded"],
    });
}

/**
 * Extract memory when a draft section is accepted.
 */
export async function onDraftAccepted(
    projectId: string,
    payload: DraftDiffPayload,
): Promise<void> {
    await createProjectMemory({
        projectId,
        type: "decision",
        statement: `Accepted draft for section "${payload.section}"${payload.subsection ? ` / ${payload.subsection}` : ""} (${payload.wordCount} words, ${payload.citations.length} citations)`,
        importance: "normal",
        source: "artifact_accept",
        authority: "confirmed",
        tags: ["artifact-decision", "draft-accepted"],
    });
}

/**
 * Compare original vs edited artifact payload.
 * If they differ, propose a memory_proposal artifact for user preference.
 */
export async function onArtifactEdited(
    runId: string,
    projectId: string,
    conversationId: string | null,
    userId: string | undefined,
    originalPayload: unknown,
    editedPayload: unknown,
    artifactType: ArtifactType,
): Promise<void> {
    const original = JSON.stringify(originalPayload);
    const edited = JSON.stringify(editedPayload);

    if (original === edited) return;

    const proposalPayload: MemoryProposalPayload = {
        memoryType: "user",
        key: `preference:${artifactType}_editing`,
        value: `User edited ${artifactType} output — prefers manual adjustments to AI-generated content in this area`,
        rationale: `Detected edit to ${artifactType} artifact. Original and edited versions differ.`,
    };

    await createArtifact({
        runId,
        projectId,
        conversationId: conversationId ?? undefined,
        userId,
        type: "memory_proposal",
        title: "Learned preference: editing pattern detected",
        payload: proposalPayload,
    });
}
