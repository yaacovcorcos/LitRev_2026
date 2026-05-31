import "server-only";

import { Prisma } from "@prisma/client";
import type {
    ArtifactType,
    CriteriaCardPayload,
    DraftDiffPayload,
    EvidenceTablePayload,
    MemoryForgetProposalPayload,
    MemoryProposalPayload,
    ProtocolSuggestionPayload,
    ScreeningBatchPayload,
    StudyProposalPayload,
    StudyUpdatePayload,
} from "@/types/artifacts";
import type { StudyDetails, StudySource, StudyType } from "@/types/ledger";
import { validateFieldValue, isValidFieldPath } from "@/lib/protocol-fields";
import {
    createProjectMemoryWithDb,
    getProjectMemories,
    getUserMemories,
    setUserMemoryWithDb,
} from "@/lib/server/memory";
import { normalizedMemoryKey, normalizedMemoryValue } from "@/lib/server/memory/conflict-policy";
import { createNoteTrusted, listNotesTrusted, textToTipTapDoc, updateNoteTrusted } from "@/lib/server/notes";
import { upsertStudyTrusted, updateStudyTrusted } from "@/lib/server/ledger";
import { ensureProtocolWithDb, saveProtocolTrusted } from "@/lib/server/protocols";
import { createDraftVersionTrusted } from "@/lib/server/draft-versions";
import { getDraftTrusted, saveDraftTrusted } from "@/lib/server/drafts";
import { buildDraftCheckpointSnapshot } from "@/lib/draft-checkpoints";
import { logServerWarn } from "@/lib/server/logging";
import { ArtifactError } from "./artifact-errors";
import type {
    ApplyFunction,
    ArtifactExecutionContext,
    RestoreFunction,
    SnapshotReader,
} from "./artifact-execution";

type ArtifactHandlerMaps = {
    applyFunctions: Map<ArtifactType, ApplyFunction>;
    snapshotReaders: Map<ArtifactType, SnapshotReader>;
    restoreFunctions: Map<ArtifactType, RestoreFunction>;
};

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
    const explicitColumns = payload.columns.map((column) => String(column).trim()).filter(Boolean);
    const inferredColumns = payload.rows.flatMap((row) => Object.keys(row).map((key) => key.trim()).filter(Boolean));
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

function resolveDraftDiffSectionKey(payload: DraftDiffPayload): string {
    if (typeof payload.sectionKey === "string" && payload.sectionKey.trim().length > 0) {
        return payload.sectionKey.trim().toLowerCase();
    }

    return payload.section.toLowerCase();
}

function serializeDraftSectionContent(value: unknown): string {
    return JSON.stringify(value ?? null);
}

async function createDraftApplyCheckpoint(
    ctx: ArtifactExecutionContext,
    artifactId: string,
    conversationId: string | null,
    sectionLabel: string,
    draftState: Parameters<typeof buildDraftCheckpointSnapshot>[0],
): Promise<void> {
    await ctx.db.draftCheckpoint.create({
        data: {
            projectId: ctx.projectId,
            workspaceId: ctx.workspaceId,
            label: `Accepted AI draft proposal: ${sectionLabel}`,
            kind: "ai_apply",
            snapshot: buildDraftCheckpointSnapshot(draftState),
            artifactId,
            conversationId: conversationId ?? null,
        },
    });
}

async function applyCriteriaCard(ctx: ArtifactExecutionContext, payload: CriteriaCardPayload) {
    const data = await ensureProtocolWithDb(ctx.db, ctx.projectId);
    data.eligibility.inclusion = payload.inclusion;
    data.eligibility.exclusion = payload.exclusion;
    await saveProtocolTrusted(ctx.db, ctx.projectId, data);
    return {
        postCommitTasks: [{
            kind: "sync_protocol_to_memory" as const,
            projectId: ctx.projectId,
            protocolData: data,
        }],
    };
}

async function applyProtocolSuggestion(ctx: ArtifactExecutionContext, payload: ProtocolSuggestionPayload) {
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
            kind: "sync_protocol_to_memory" as const,
            projectId: ctx.projectId,
            protocolData: data,
        }],
    };
}

async function applyMemoryProposal(
    ctx: ArtifactExecutionContext,
    payload: MemoryProposalPayload,
    conversationId: string | null,
) {
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
            await ctx.db.memoryEmbedding.deleteMany({
                where: { memoryType: "user", memoryId: { in: variantIds } },
            });
            await ctx.db.userMemory.updateMany({
                where: {
                    id: { in: variantIds },
                    userId,
                    status: "active",
                },
                data: {
                    status: "archived",
                    archivedAt: new Date(),
                    embeddingStatus: "pending",
                },
            });
        }

        await setUserMemoryWithDb(ctx.db, {
            userId,
            type: "preference",
            key,
            value: payload.value,
            rationale: payload.rationale,
            source: "artifact_accept",
            authority: "confirmed",
            tags: ["ai-proposed", keyTag],
        });
        await ctx.db.$executeRaw`
            UPDATE "UserMemory"
            SET "acceptedCount" = "acceptedCount" + 1,
                "contradictionCount" = "contradictionCount" + ${hasConflict ? 1 : 0}
            WHERE "userId" = ${userId}
              AND "key" = ${key}
        `;
        return;
    }

    if (payload.memoryType === "project") {
        const normalizedKey = payload.key ? normalizedMemoryKey(payload.key) : "";
        const keyTag = normalizedKey ? `memory-key:${normalizedKey}` : null;
        const normalizedValue = normalizedMemoryValue(payload.value);
        let conflictCount = 0;

        if (keyTag) {
            const existing = await getProjectMemories(ctx.projectId, { status: "active", tags: [keyTag] }, ctx.db);
            const exact = existing.find((memory) => normalizedMemoryValue(memory.statement) === normalizedValue);
            if (exact) {
                await ctx.db.projectMemory.update({
                    where: { id: exact.id },
                    data: {
                        rationale: payload.rationale ?? exact.rationale,
                        embeddingStatus: "pending",
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
                .filter((memory) => normalizedMemoryValue(memory.statement) !== normalizedValue)
                .map((memory) => memory.id);
            conflictCount = conflictingIds.length;
            if (conflictingIds.length > 0) {
                await ctx.db.memoryEmbedding.deleteMany({
                    where: { memoryType: "project", memoryId: { in: conflictingIds } },
                });
                await ctx.db.projectMemory.updateMany({
                    where: { id: { in: conflictingIds } },
                    data: {
                        status: "archived",
                        archivedAt: new Date(),
                        embeddingStatus: "pending",
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
            key: normalizedKey || undefined,
            statement: payload.value,
            rationale: payload.rationale,
            importance: "normal",
            source: "artifact_accept",
            authority: "confirmed",
            tags: keyTag ? ["ai-proposed", keyTag] : ["ai-proposed"],
        });
        await ctx.db.$executeRaw`
            UPDATE "ProjectMemory"
            SET "acceptedCount" = "acceptedCount" + 1,
                "contradictionCount" = "contradictionCount" + ${conflictCount > 0 ? 1 : 0}
            WHERE "id" = ${created.id}
        `;
        return;
    }

    await createNoteTrusted(ctx.db, {
        projectId: ctx.projectId,
        title: payload.key || undefined,
        content: textToTipTapDoc(payload.value),
        source: "conversation",
        sourceConversationId: conversationId ?? undefined,
        tags: ["ai-proposed"],
    });
}

async function applyMemoryForgetProposal(ctx: ArtifactExecutionContext, payload: MemoryForgetProposalPayload) {
    const matchIds = payload.matches.map((match) => match.id);
    if (matchIds.length === 0) return;

    if (payload.memoryType === "user") {
        const userId = ctx.effectiveActorUserId;
        if (!userId) {
            throw new ArtifactError("ARTIFACT_CONTEXT_MISSING", "User memory forget proposals require an acting user.");
        }
        const scopedMatches = await ctx.db.userMemory.findMany({
            where: {
                id: { in: matchIds },
                userId,
                status: "active",
            },
            select: { id: true },
        });
        const scopedIds = scopedMatches.map((memory) => memory.id);
        if (scopedIds.length === 0) return;
        await ctx.db.memoryEmbedding.deleteMany({
            where: { memoryType: "user", memoryId: { in: scopedIds } },
        });
        await ctx.db.userMemory.updateMany({
            where: {
                id: { in: scopedIds },
                userId,
                status: "active",
            },
            data: {
                status: "archived",
                archivedAt: new Date(),
                embeddingStatus: "pending",
            },
        });
        const idValues = scopedIds.map((id) => Prisma.sql`${id}`);
        await ctx.db.$executeRaw`
            UPDATE "UserMemory"
            SET "rejectedCount" = "rejectedCount" + 1
            WHERE "id" IN (${Prisma.join(idValues)})
        `;
        return;
    }

    const scopedMatches = await ctx.db.projectMemory.findMany({
        where: {
            id: { in: matchIds },
            projectId: ctx.projectId,
            status: "active",
        },
        select: { id: true },
    });
    const scopedIds = scopedMatches.map((memory) => memory.id);
    if (scopedIds.length === 0) return;
    await ctx.db.memoryEmbedding.deleteMany({
        where: { memoryType: "project", memoryId: { in: scopedIds } },
    });
    await ctx.db.projectMemory.updateMany({
        where: {
            id: { in: scopedIds },
            projectId: ctx.projectId,
            status: "active",
        },
        data: {
            status: "archived",
            archivedAt: new Date(),
            embeddingStatus: "pending",
        },
    });
    const idValues = scopedIds.map((id) => Prisma.sql`${id}`);
    await ctx.db.$executeRaw`
        UPDATE "ProjectMemory"
        SET "rejectedCount" = "rejectedCount" + 1
        WHERE "id" IN (${Prisma.join(idValues)})
    `;
}

async function applyStudyProposal(ctx: ArtifactExecutionContext, payload: StudyProposalPayload) {
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
}

async function applyStudyUpdate(ctx: ArtifactExecutionContext, artifactId: string, payload: StudyUpdatePayload) {
    const existingArtifact = await ctx.db.artifact.findUnique({
        where: { id: artifactId },
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
}

async function applyDraftDiff(ctx: ArtifactExecutionContext, payload: DraftDiffPayload, artifactId: string, conversationId: string | null) {
    const tipTapContent = textToTipTapDoc(payload.content);
    const currentDraft = await getDraftTrusted(ctx.db, ctx.projectId);
    const sectionKey = resolveDraftDiffSectionKey(payload);
    const currentSectionContent = currentDraft?.contentBySection?.[sectionKey] ?? null;
    const baseSectionContent = Object.prototype.hasOwnProperty.call(payload, "baseSectionContent")
        ? payload.baseSectionContent ?? null
        : currentSectionContent;

    if (serializeDraftSectionContent(currentSectionContent) !== serializeDraftSectionContent(baseSectionContent)) {
        logServerWarn("draft_diff", "rejected stale draft proposal apply because the target section changed", {
            artifactId,
            projectId: ctx.projectId,
            section: payload.section,
            sectionKey,
        });
        throw new ArtifactError(
            "ARTIFACT_APPLY_FAILED",
            `Draft section "${payload.section}" changed after this proposal was created. Re-run the draft proposal from the latest text.`,
        );
    }

    await createDraftVersionTrusted(ctx.db, {
        projectId: ctx.projectId,
        section: payload.section,
        content: tipTapContent as object,
        wordCount: payload.wordCount,
        artifactId,
        conversationId: conversationId ?? undefined,
    });

    const { createDefaultDraftState } = await import("@/lib/draft-storage");
    const draftState = currentDraft ?? createDefaultDraftState();
    draftState.contentBySection[sectionKey] = tipTapContent as typeof draftState.contentBySection[string];

    await saveDraftTrusted(ctx.db, ctx.projectId, draftState);
    await createDraftApplyCheckpoint(ctx, artifactId, conversationId, payload.section, draftState);
}

async function applyEvidenceTable(ctx: ArtifactExecutionContext, payload: EvidenceTablePayload, conversationId: string | null) {
    const content = textToTipTapDoc(buildEvidenceTableMarkdown(payload));
    const existing = await listNotesTrusted(ctx.db, ctx.projectId);
    const evidenceNote = existing.find((note) =>
        note.title?.toLowerCase() === "evidence table"
        || note.linkedSection?.toLowerCase() === "evidence table"
        || note.tags?.some((tag) => tag.toLowerCase() === "evidence-table"),
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
        sourceConversationId: conversationId ?? undefined,
        tags: ["evidence-table"],
    });
}

async function applyScreeningBatch(ctx: ArtifactExecutionContext, payload: ScreeningBatchPayload) {
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
}

export function registerArtifactHandlers({
    applyFunctions,
    snapshotReaders,
    restoreFunctions,
}: ArtifactHandlerMaps) {
    applyFunctions.set("criteria_card", async (ctx, artifact) => {
        return applyCriteriaCard(ctx, artifact.payload as unknown as CriteriaCardPayload);
    });

    applyFunctions.set("protocol_suggestion", async (ctx, artifact) => {
        return applyProtocolSuggestion(ctx, artifact.payload as unknown as ProtocolSuggestionPayload);
    });

    applyFunctions.set("memory_proposal", async (ctx, artifact) => {
        await applyMemoryProposal(ctx, artifact.payload as unknown as MemoryProposalPayload, artifact.conversationId);
    });

    applyFunctions.set("memory_forget_proposal", async (ctx, artifact) => {
        await applyMemoryForgetProposal(ctx, artifact.payload as unknown as MemoryForgetProposalPayload);
    });

    applyFunctions.set("study_proposal", async (ctx, artifact) => {
        await applyStudyProposal(ctx, artifact.payload as unknown as StudyProposalPayload);
    });

    applyFunctions.set("study_update", async (ctx, artifact) => {
        await applyStudyUpdate(ctx, artifact.id, artifact.payload as unknown as StudyUpdatePayload);
    });

    applyFunctions.set("draft_diff", async (ctx, artifact) => {
        await applyDraftDiff(ctx, artifact.payload as unknown as DraftDiffPayload, artifact.id, artifact.conversationId);
    });

    applyFunctions.set("evidence_table", async (ctx, artifact) => {
        await applyEvidenceTable(ctx, artifact.payload as unknown as EvidenceTablePayload, artifact.conversationId);
    });

    applyFunctions.set("screening_batch", async (ctx, artifact) => {
        await applyScreeningBatch(ctx, artifact.payload as unknown as ScreeningBatchPayload);
    });

    snapshotReaders.set("study_update", async (ctx, artifact) => {
        const payload = artifact.payload as unknown as StudyUpdatePayload;
        return ctx.db.study.findFirst({
            where: { id: payload.studyId, deletedAt: null },
            select: { id: true, title: true, authors: true, year: true, status: true, quality: true, details: true },
        });
    });

    snapshotReaders.set("study_proposal", async (ctx, artifact) => {
        const payload = artifact.payload as unknown as StudyProposalPayload;
        return ctx.db.study.findFirst({
            where: { projectId: ctx.projectId, title: payload.title, deletedAt: null },
            select: { id: true, title: true, authors: true, year: true, status: true, quality: true, details: true },
        });
    });

    snapshotReaders.set("protocol_suggestion", async (ctx, artifact) => {
        const payload = artifact.payload as unknown as ProtocolSuggestionPayload;
        const protocol = await ctx.db.protocol.findUnique({
            where: { projectId: ctx.projectId },
            select: { data: true },
        });
        if (!protocol) return null;
        const previousValue = getNestedValue(protocol.data as Record<string, unknown>, payload.field);
        return { field: payload.field, previousValue };
    });

    snapshotReaders.set("criteria_card", async (ctx) => {
        const protocol = await ctx.db.protocol.findUnique({
            where: { projectId: ctx.projectId },
            select: { data: true },
        });
        if (!protocol) return null;
        const data = protocol.data as Record<string, unknown>;
        return (data as { eligibility?: unknown }).eligibility ?? null;
    });

    snapshotReaders.set("draft_diff", async (ctx, artifact) => {
        const payload = artifact.payload as unknown as DraftDiffPayload;
        const currentDraft = await getDraftTrusted(ctx.db, ctx.projectId);
        if (!currentDraft) return null;
        const sectionKey = resolveDraftDiffSectionKey(payload);
        return currentDraft.contentBySection?.[sectionKey] ?? null;
    });

    restoreFunctions.set("study_update", async (ctx, artifact) => {
        const snapshot = artifact.snapshot as {
            id: string;
            title: string;
            authors: string;
            year: number;
            status: string;
            quality: string;
            details: unknown;
        } | null;
        if (!snapshot) return;

        await ctx.db.study.update({
            where: { id: snapshot.id },
            data: {
                title: snapshot.title,
                authors: snapshot.authors,
                year: snapshot.year,
                status: snapshot.status,
                quality: snapshot.quality,
                details: (snapshot.details as object) ?? Prisma.DbNull,
            },
        });
    });

    restoreFunctions.set("study_proposal", async (ctx, artifact) => {
        const payload = artifact.payload as unknown as StudyProposalPayload;
        const study = await ctx.db.study.findFirst({
            where: { projectId: ctx.projectId, title: payload.title, deletedAt: null },
            select: { id: true },
        });
        if (!study) return;

        const snapshot = artifact.snapshot as { id: string; status: string; quality: string; details: unknown } | null;
        if (!snapshot) {
            await ctx.db.study.update({ where: { id: study.id }, data: { deletedAt: new Date() } });
            return;
        }

        await ctx.db.study.update({
            where: { id: study.id },
            data: {
                status: snapshot.status,
                quality: snapshot.quality,
                details: (snapshot.details as object) ?? Prisma.DbNull,
            },
        });
    });

    restoreFunctions.set("protocol_suggestion", async (ctx, artifact) => {
        const snapshot = artifact.snapshot as { field: string; previousValue: unknown } | null;
        if (!snapshot) return;
        const data = await ensureProtocolWithDb(ctx.db, ctx.projectId);
        setNestedValue(data as unknown as Record<string, unknown>, snapshot.field, snapshot.previousValue);
        await saveProtocolTrusted(ctx.db, ctx.projectId, data);
    });

    restoreFunctions.set("criteria_card", async (ctx, artifact) => {
        const previousEligibility = artifact.snapshot as { inclusion: string[]; exclusion: string[] } | null;
        if (!previousEligibility) return;
        const data = await ensureProtocolWithDb(ctx.db, ctx.projectId);
        data.eligibility.inclusion = previousEligibility.inclusion;
        data.eligibility.exclusion = previousEligibility.exclusion;
        await saveProtocolTrusted(ctx.db, ctx.projectId, data);
    });

    restoreFunctions.set("draft_diff", async (ctx, artifact) => {
        const payload = artifact.payload as unknown as DraftDiffPayload;
        const { createDefaultDraftState } = await import("@/lib/draft-storage");
        const sectionKey = resolveDraftDiffSectionKey(payload);

        const currentDraft = await getDraftTrusted(ctx.db, ctx.projectId);
        const draftState = currentDraft ?? createDefaultDraftState();

        if (artifact.snapshot) {
            draftState.contentBySection[sectionKey] = artifact.snapshot as typeof draftState.contentBySection[string];
        } else {
            delete draftState.contentBySection[sectionKey];
        }

        await saveDraftTrusted(ctx.db, ctx.projectId, draftState);
    });
}
