/**
 * Artifact Type Definitions + Zod Schemas
 * (planC Phase 0.3)
 */

import { z } from "zod";

// ── Artifact Types ───────────────────────────────────────────────────────────

export type ArtifactType =
    | "study_proposal"
    | "draft_diff"
    | "screening_batch"
    | "protocol_suggestion"
    | "criteria_card"
    | "evidence_table"
    | "plan"
    | "memory_proposal";

export type ArtifactStatus =
    | "proposed"
    | "accepted"
    | "rejected"
    | "edited"
    | "auto_applied"
    | "expired"
    | "collapsed";

// ── Per-Type Payloads ────────────────────────────────────────────────────────

export interface StudyProposalPayload {
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
    criteriaMatch?: Record<string, boolean>;
    matchRationale?: string;
}

export interface DraftDiffPayload {
    section: string;
    subsection?: string;
    content: string;
    citations: { studyId: string; label: string }[];
    wordCount: number;
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
    value: unknown;
    oldValue?: unknown;
    rationale: string;
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
}

export interface PlanStep {
    label: string;
    toolName?: string;
    description?: string;
    status: "pending" | "running" | "completed" | "failed" | "skipped";
}

export interface MemoryProposalPayload {
    memoryType: "user" | "project" | "study" | "note";
    key?: string;
    value: string;
    rationale?: string;
}

// ── Zod Schemas ──────────────────────────────────────────────────────────────

export const StudyProposalSchema = z.object({
    pmid: z.string().optional(),
    doi: z.string().optional(),
    title: z.string().min(1),
    authors: z.string().min(1),
    year: z.number().int().min(1900).max(2100),
    journal: z.string().optional(),
    abstract: z.string().optional(),
    studyType: z.string().optional(),
    sampleSize: z.number().int().positive().optional(),
    keyDetail: z.string().optional(),
    source: z.string(),
    sourceUrl: z.string().optional(),
    recommendation: z.enum(["keep", "exclude", "maybe"]),
    confidence: z.number().min(0).max(1),
    criteriaMatch: z.record(z.string(), z.boolean()).optional(),
    matchRationale: z.string().optional(),
});

export const DraftDiffSchema = z.object({
    section: z.string().min(1),
    subsection: z.string().optional(),
    content: z.string().min(1),
    citations: z.array(z.object({ studyId: z.string(), label: z.string() })),
    wordCount: z.number().int().nonnegative(),
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
    value: z.unknown(),
    oldValue: z.unknown().optional(),
    rationale: z.string(),
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

export const PlanSchema = z.object({
    steps: z.array(PlanStepSchema),
    estimatedActions: z.number().int().nonnegative(),
});

export const MemoryProposalSchema = z.object({
    memoryType: z.enum(["user", "project", "study", "note"]),
    key: z.string().optional(),
    value: z.string().min(1),
    rationale: z.string().optional(),
});

/** Map artifact type → Zod schema for payload validation */
export const ARTIFACT_PAYLOAD_SCHEMAS: Record<ArtifactType, z.ZodType> = {
    study_proposal: StudyProposalSchema,
    draft_diff: DraftDiffSchema,
    screening_batch: ScreeningBatchSchema,
    protocol_suggestion: ProtocolSuggestionSchema,
    criteria_card: CriteriaCardSchema,
    evidence_table: EvidenceTableSchema,
    plan: PlanSchema,
    memory_proposal: MemoryProposalSchema,
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
