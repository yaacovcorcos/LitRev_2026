/**
 * Artifact Type Definitions + Zod Schemas
 * (planC Phase 0.3)
 */

import { z } from "zod";
import { AGENT_MODES, type AgentMode } from "@/types/agent";

// ── Artifact Types ───────────────────────────────────────────────────────────

export type ArtifactType =
    | "study_proposal"
    | "study_update"
    | "draft_diff"
    | "screening_batch"
    | "protocol_suggestion"
    | "scoping_report"
    | "criteria_card"
    | "evidence_table"
    | "plan"
    | "memory_proposal"
    | "memory_forget_proposal";

export type ArtifactStatus =
    | "proposed"
    | "accepted"
    | "rejected"
    | "edited"
    | "auto_applied"
    | "expired"
    | "collapsed"
    | "running";

// ── Per-Type Payloads ────────────────────────────────────────────────────────

export interface StudyProposalPayload {
    studyId?: string;
    pmid?: string;
    doi?: string;
    title: string;
    authors: string;
    year: number;
    journal?: string;
    abstract?: string;
    studyType?: string;
    sampleSize?: number;
    keyDetail?: string;
    source: string;
    sourceUrl?: string;
    recommendation: "keep" | "exclude" | "maybe";
    confidence: number;
    screeningTier?: "deterministic" | "ai" | "heuristic" | "default";
    modelUsed?: string;
    criteriaMatch?: Record<string, boolean>;
    matchRationale?: string;
}

export interface StudyFieldChange {
    field: string;
    label: string;
    operation: "set" | "clear" | "append";
    typedOldValue: unknown;
    typedNewValue: unknown;
    displayOld: string;
    displayNew: string;
}

export interface StudyUpdatePayload {
    studyId: string;
    studyTitle: string;
    snapshotAt: string;
    idempotencyKey: string;
    patch: {
        top?: {
            title?: string;
            authors?: string;
            year?: number;
            quality?: "High" | "Medium" | "Low" | "-";
            status?: "pending" | "extracted" | "active" | "excluded";
        };
        details?: Record<string, unknown>;
    };
    changes: StudyFieldChange[];
    rationale: string;
}

export interface DraftDiffPayload {
    section: string;
    sectionKey?: string;
    subsection?: string;
    content: string;
    citations: { studyId: string; label: string }[];
    wordCount: number;
    baseSectionContent?: unknown | null;
}

export interface ScreeningBatchPayload {
    studies: StudyProposalPayload[];
    summary: {
        total: number;
        keepCount: number;
        excludeCount: number;
        maybeCount: number;
    };
}

export interface ProtocolSuggestionPayload {
    field: string;
    value: string | string[];
    oldValue?: string | string[] | null;
    rationale: string;
}

export interface ScopingSearchEntry {
    database: string;
    query: string;
    resultCount?: number;
    angle?: string;
}

export interface ScopingQuestionRecommendation {
    question: string;
    rationale: string;
    feasibility: "low" | "medium" | "high";
    novelty: "low" | "medium" | "high";
}

export type ScopingEntryIntent = "explore" | "draft_bootstrap";

export type ScopingWorkflowPhase = "discover" | "synthesize" | "propose" | "handoff";

export interface ScopingWorkflowSnapshot {
    entryIntent: ScopingEntryIntent;
    phase: ScopingWorkflowPhase;
    handoffOffered: boolean;
    recommendedDefaultQuestionIndex?: number;
}

export interface ScopingReportPayload {
    topic: string;
    searchesRun: ScopingSearchEntry[];
    landscape: {
        majorThemes: string[];
        evidenceGaps: string[];
        methodologicalPatterns: string[];
        evidenceDensity: "sparse" | "moderate" | "dense";
        timeframe?: {
            earliest?: number;
            latest?: number;
        };
    };
    recommendedQuestions: ScopingQuestionRecommendation[];
    nextStep: string;
    workflow?: ScopingWorkflowSnapshot;
}

export interface CriteriaCardPayload {
    inclusion: string[];
    exclusion: string[];
    rationale?: string;
}

export interface EvidenceTablePayload {
    columns: string[];
    rows: Record<string, string>[];
}

export interface PlanPayload {
    steps: PlanStep[];
    estimatedActions: number;
    execution?: PlanExecutionMetadata;
}

export interface PlanStep {
    label: string;
    toolName?: string;
    description?: string;
    status: "pending" | "running" | "completed" | "failed" | "skipped";
}

export interface PlanExecutionMetadata {
    originAgentMode: AgentMode;
    allowedToolNames: string[];
    createdFromConversationId: string | null;
    createdFromProjectId: string | null;
    enforceOrder: true;
}

export interface MemoryProposalPayload {
    memoryType: "user" | "project" | "study" | "note";
    key?: string;
    value: string;
    rationale?: string;
}

export interface MemoryForgetMatch {
    id: string;
    label: string;
    value: string;
}

export interface MemoryForgetProposalPayload {
    memoryType: "user" | "project";
    key: string;
    mode: "archive";
    reason?: string;
    matches: MemoryForgetMatch[];
}

// ── Zod Schemas ──────────────────────────────────────────────────────────────

export const StudyProposalSchema = z.object({
    studyId: z.string().optional(),
    pmid: z.string().optional(),
    doi: z.string().optional(),
    title: z.string().min(1),
    authors: z.string().min(1),
    // `0` is allowed as "unknown year" to match ledger storage semantics.
    year: z.number().int().min(0).max(2100),
    journal: z.string().optional(),
    abstract: z.string().optional(),
    studyType: z.string().optional(),
    sampleSize: z.number().int().positive().optional(),
    keyDetail: z.string().optional(),
    source: z.string(),
    sourceUrl: z.string().optional(),
    recommendation: z.enum(["keep", "exclude", "maybe"]),
    confidence: z.number().min(0).max(1),
    screeningTier: z.enum(["deterministic", "ai", "heuristic", "default"]).optional(),
    modelUsed: z.string().optional(),
    criteriaMatch: z.record(z.string(), z.boolean()).optional(),
    matchRationale: z.string().optional(),
});

export const StudyFieldChangeSchema = z.object({
    field: z.string(),
    label: z.string(),
    operation: z.enum(["set", "clear", "append"]),
    typedOldValue: z.unknown(),
    typedNewValue: z.unknown(),
    displayOld: z.string(),
    displayNew: z.string(),
});

const StudyPatchTopSchema = z.object({
    title: z.string().min(1).optional(),
    authors: z.string().min(1).optional(),
    year: z.number().int().min(1900).max(2100).optional(),
    quality: z.enum(["High", "Medium", "Low", "-"]).optional(),
    status: z.enum(["pending", "extracted", "active", "excluded"]).optional(),
});

export const StudyUpdateSchema = z.object({
    studyId: z.string().min(1),
    studyTitle: z.string().min(1),
    snapshotAt: z.string().min(1),
    idempotencyKey: z.string().min(1),
    patch: z.object({
        top: StudyPatchTopSchema.optional(),
        details: z.record(z.string(), z.unknown()).optional(),
    }),
    changes: z.array(StudyFieldChangeSchema).min(1),
    rationale: z.string().min(1),
});

export const DraftDiffSchema = z.object({
    section: z.string().min(1),
    sectionKey: z.string().min(1).optional(),
    subsection: z.string().optional(),
    content: z.string().min(1),
    citations: z.array(z.object({ studyId: z.string(), label: z.string() })),
    wordCount: z.number().int().nonnegative(),
    baseSectionContent: z.unknown().nullable().optional(),
});

export const ScreeningBatchSchema = z.object({
    studies: z.array(StudyProposalSchema),
    summary: z.object({
        total: z.number().int().nonnegative(),
        keepCount: z.number().int().nonnegative(),
        excludeCount: z.number().int().nonnegative(),
        maybeCount: z.number().int().nonnegative(),
    }),
});

export const ProtocolSuggestionSchema = z.object({
    field: z.string().min(1),
    value: z.union([z.string(), z.array(z.string())]),
    oldValue: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
    rationale: z.string(),
});

const ScopingScoreSchema = z.enum(["low", "medium", "high"]);
const ScopingDensitySchema = z.enum(["sparse", "moderate", "dense"]);

export const ScopingSearchEntrySchema = z.object({
    database: z.string().min(1),
    query: z.string().min(1),
    resultCount: z.number().int().nonnegative().optional(),
    angle: z.string().min(1).optional(),
});

export const ScopingQuestionRecommendationSchema = z.object({
    question: z.string().min(1),
    rationale: z.string().min(1),
    feasibility: ScopingScoreSchema,
    novelty: ScopingScoreSchema,
});

export const ScopingEntryIntentSchema = z.enum(["explore", "draft_bootstrap"]);
export const ScopingWorkflowPhaseSchema = z.enum(["discover", "synthesize", "propose", "handoff"]);
export const ScopingWorkflowSnapshotSchema = z.object({
    entryIntent: ScopingEntryIntentSchema,
    phase: ScopingWorkflowPhaseSchema,
    handoffOffered: z.boolean(),
    recommendedDefaultQuestionIndex: z.number().int().positive().optional(),
});

export const ScopingReportSchema = z.object({
    topic: z.string().min(1),
    searchesRun: z.array(ScopingSearchEntrySchema),
    landscape: z.object({
        majorThemes: z.array(z.string()),
        evidenceGaps: z.array(z.string()),
        methodologicalPatterns: z.array(z.string()),
        evidenceDensity: ScopingDensitySchema,
        timeframe: z.object({
            earliest: z.number().int().optional(),
            latest: z.number().int().optional(),
        }).optional(),
    }),
    recommendedQuestions: z.array(ScopingQuestionRecommendationSchema).max(5),
    nextStep: z.string().min(1),
    workflow: ScopingWorkflowSnapshotSchema.optional(),
});

export const CriteriaCardSchema = z.object({
    inclusion: z.array(z.string()),
    exclusion: z.array(z.string()),
    rationale: z.string().optional(),
});

export const EvidenceTableSchema = z.object({
    columns: z.array(z.string()),
    rows: z.array(z.record(z.string(), z.string())),
});

export const PlanStepSchema = z.object({
    label: z.string().min(1),
    toolName: z.string().optional(),
    description: z.string().optional(),
    status: z.enum(["pending", "running", "completed", "failed", "skipped"]),
});

export const PlanExecutionMetadataSchema = z.object({
    originAgentMode: z.enum(AGENT_MODES),
    allowedToolNames: z.array(z.string().min(1)),
    createdFromConversationId: z.string().nullable(),
    createdFromProjectId: z.string().nullable(),
    enforceOrder: z.literal(true),
});

export const PlanSchema = z.object({
    steps: z.array(PlanStepSchema),
    estimatedActions: z.number().int().nonnegative(),
    execution: PlanExecutionMetadataSchema.optional(),
});

export const MemoryProposalSchema = z.object({
    memoryType: z.enum(["user", "project", "study", "note"]),
    key: z.string().optional(),
    value: z.string().min(1),
    rationale: z.string().optional(),
});

export const MemoryForgetProposalSchema = z.object({
    memoryType: z.enum(["user", "project"]),
    key: z.string().min(1),
    mode: z.literal("archive"),
    reason: z.string().optional(),
    matches: z.array(z.object({
        id: z.string().min(1),
        label: z.string().min(1),
        value: z.string().min(1),
    })).min(1),
});

/** Map artifact type → Zod schema for payload validation */
export const ARTIFACT_PAYLOAD_SCHEMAS: Record<ArtifactType, z.ZodType> = {
    study_proposal: StudyProposalSchema,
    study_update: StudyUpdateSchema,
    draft_diff: DraftDiffSchema,
    screening_batch: ScreeningBatchSchema,
    protocol_suggestion: ProtocolSuggestionSchema,
    scoping_report: ScopingReportSchema,
    criteria_card: CriteriaCardSchema,
    evidence_table: EvidenceTableSchema,
    plan: PlanSchema,
    memory_proposal: MemoryProposalSchema,
    memory_forget_proposal: MemoryForgetProposalSchema,
};

// ── Client-facing Artifact Data ──────────────────────────────────────────────

export interface ArtifactData {
    id: string;
    runId: string;
    projectId: string;
    conversationId: string | null;
    type: ArtifactType;
    status: ArtifactStatus;
    title: string;
    payload: unknown;
    version: number;
    sourceEventId: string | null;
    appliedAt: string | null;
    reviewedAt: string | null;
    reviewNote: string | null;
    createdAt: string;
}
