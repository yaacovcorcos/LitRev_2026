import "server-only";

import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AuthContext } from "@/lib/server/auth/session";
import { prisma } from "@/lib/server/prisma";
import { assertTelemetryProjectAccess } from "@/lib/server/telemetry-policy";
import type { CitationPreviewMetricInput } from "@/types/citation-preview-telemetry";

const METRIC_TYPES = [
    "hover_intent_started",
    "prefetch_started",
    "popover_opened",
    "metadata_request_started",
    "metadata_request_completed",
    "metadata_request_failed",
    "continuation_completed",
    "continuation_failed",
] as const;

const METRIC_SURFACES = ["project", "popup", "ai", "unknown"] as const;
const METRIC_CITATION_TYPES = ["DOI", "PubMed"] as const;
const METRIC_TRIGGERS = ["hover", "focus", "touch", "prefetch"] as const;

const MAX_EVENT_ID_LENGTH = 128;
const MAX_ID_LENGTH = 128;
const MAX_TIMESTAMP_LENGTH = 64;
const MAX_CITATION_KEY_LENGTH = 512;
const MAX_ERROR_CODE_LENGTH = 128;

const CitationPreviewMetricInputSchema: z.ZodType<CitationPreviewMetricInput> = z.object({
    eventId: z.string().trim().min(1).max(MAX_EVENT_ID_LENGTH),
    version: z.literal(1),
    type: z.enum(METRIC_TYPES),
    surface: z.enum(METRIC_SURFACES),
    projectId: z.string().trim().min(1).max(MAX_ID_LENGTH).optional().nullable(),
    conversationId: z.string().trim().min(1).max(MAX_ID_LENGTH).optional().nullable(),
    clientTimestamp: z.string().trim().min(1).max(MAX_TIMESTAMP_LENGTH),
    payload: z.object({
        citationKey: z.string().trim().min(1).max(MAX_CITATION_KEY_LENGTH).nullable(),
        citationType: z.enum(METRIC_CITATION_TYPES).nullable(),
        trigger: z.enum(METRIC_TRIGGERS).optional(),
        fromCache: z.boolean().optional(),
        latencyMs: z.number().finite().min(0).optional(),
        upstreamSource: z.enum(["icite", "crossref", "pubmed", "unknown"]).optional(),
        resolutionPath: z.enum([
            "pubmed_icite",
            "pubmed_crossref_fallback",
            "pubmed_bibliography_only",
            "doi_crossref",
            "doi_no_count",
        ]).optional(),
        reason: z.enum([
            "count_resolved",
            "no_doi_fallback",
            "icite_no_count",
            "icite_timeout",
            "crossref_no_count",
            "crossref_timeout",
            "budget_exhausted",
            "provider_error",
        ]).optional(),
        resolvedWithCitationCount: z.boolean().optional(),
        hadDoiFallbackCandidate: z.boolean().optional(),
        continuationRecoveredCount: z.boolean().optional(),
        errorCode: z.string().trim().min(1).max(MAX_ERROR_CODE_LENGTH).nullable().optional(),
    }),
});

function toStoredMetricType(type: CitationPreviewMetricInput["type"]): string {
    return `citation_preview.${type}`;
}

function shouldPersistMetric(
    type: CitationPreviewMetricInput["type"],
): type is
    | "metadata_request_completed"
    | "metadata_request_failed"
    | "continuation_completed"
    | "continuation_failed" {
    return (
        type === "metadata_request_completed"
        || type === "metadata_request_failed"
        || type === "continuation_completed"
        || type === "continuation_failed"
    );
}

function parseClientTimestamp(input: string): Date | null {
    const timestamp = Date.parse(input);
    return Number.isFinite(timestamp) ? new Date(timestamp) : null;
}

function isEventIdUniqueConflict(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const candidate = error as { code?: unknown; meta?: { target?: unknown } };
    if (candidate.code !== "P2002") return false;
    const target = candidate.meta?.target;
    if (!Array.isArray(target)) return false;
    return target.map((value) => String(value)).includes("eventId");
}

export type IngestCitationPreviewMetricResult = {
    deduped: boolean;
    id: string | null;
};

export async function ingestCitationPreviewMetric(
    auth: AuthContext,
    input: unknown
): Promise<IngestCitationPreviewMetricResult> {
    const parsed = CitationPreviewMetricInputSchema.parse(input);
    if (parsed.projectId) {
        await assertTelemetryProjectAccess(auth, parsed.projectId);
    }

    if (!shouldPersistMetric(parsed.type)) {
        return {
            deduped: false,
            id: null,
        };
    }

    try {
        const created = await prisma.chatUnificationMetric.create({
            data: {
                eventId: parsed.eventId,
                version: parsed.version,
                type: toStoredMetricType(parsed.type),
                surface: parsed.surface,
                userId: auth.userId,
                workspaceId: auth.workspaceId,
                projectId: parsed.projectId ?? null,
                conversationId: parsed.conversationId ?? null,
                payload: parsed.payload as Prisma.InputJsonValue,
                clientTimestamp: parseClientTimestamp(parsed.clientTimestamp),
            },
            select: { id: true },
        });

        return {
            deduped: false,
            id: created.id,
        };
    } catch (error) {
        if (isEventIdUniqueConflict(error)) {
            return {
                deduped: true,
                id: null,
            };
        }
        throw error;
    }
}
