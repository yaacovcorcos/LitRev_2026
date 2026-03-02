import "server-only";

import { z } from "zod";
import type { AuthContext } from "@/lib/server/auth/session";
import { assertProjectAccess } from "@/lib/server/access";
import type { CitationPreviewMetricInput } from "@/types/citation-preview-telemetry";

const METRIC_TYPES = [
    "hover_intent_started",
    "prefetch_started",
    "popover_opened",
    "metadata_request_started",
    "metadata_request_completed",
    "metadata_request_failed",
] as const;

const METRIC_SURFACES = ["project", "popup", "ai", "unknown"] as const;
const METRIC_CITATION_TYPES = ["DOI", "PubMed"] as const;
const METRIC_TRIGGERS = ["hover", "focus", "touch", "prefetch"] as const;

const CitationPreviewMetricInputSchema: z.ZodType<CitationPreviewMetricInput> = z.object({
    eventId: z.string().trim().min(1),
    version: z.literal(1),
    type: z.enum(METRIC_TYPES),
    surface: z.enum(METRIC_SURFACES),
    projectId: z.string().trim().min(1).optional().nullable(),
    conversationId: z.string().trim().min(1).optional().nullable(),
    clientTimestamp: z.string().trim().min(1),
    payload: z.object({
        citationKey: z.string().trim().min(1).nullable(),
        citationType: z.enum(METRIC_CITATION_TYPES).nullable(),
        trigger: z.enum(METRIC_TRIGGERS).optional(),
        fromCache: z.boolean().optional(),
        latencyMs: z.number().finite().min(0).optional(),
        upstreamSource: z.enum(["crossref", "pubmed", "unknown"]).optional(),
        errorCode: z.string().trim().min(1).nullable().optional(),
    }),
});

const EVENT_ID_TTL_MS = 1000 * 60 * 60 * 24;
const EVENT_ID_LIMIT = 5000;
const seenEventIds = new Map<string, number>();

function pruneSeenEventIds(now: number): void {
    for (const [eventId, timestamp] of seenEventIds) {
        if (now - timestamp > EVENT_ID_TTL_MS) {
            seenEventIds.delete(eventId);
        }
    }
    if (seenEventIds.size <= EVENT_ID_LIMIT) return;
    const sorted = [...seenEventIds.entries()].sort((a, b) => a[1] - b[1]);
    for (const [eventId] of sorted.slice(0, seenEventIds.size - EVENT_ID_LIMIT)) {
        seenEventIds.delete(eventId);
    }
}

function markEventId(eventId: string): { deduped: boolean } {
    const now = Date.now();
    pruneSeenEventIds(now);
    if (seenEventIds.has(eventId)) return { deduped: true };
    seenEventIds.set(eventId, now);
    return { deduped: false };
}

export type IngestCitationPreviewMetricResult = {
    deduped: boolean;
};

export async function ingestCitationPreviewMetric(
    auth: AuthContext,
    input: unknown
): Promise<IngestCitationPreviewMetricResult> {
    const parsed = CitationPreviewMetricInputSchema.parse(input);
    if (parsed.projectId) {
        await assertProjectAccess(
            { ownerId: auth.userId, workspaceId: auth.workspaceId },
            parsed.projectId
        );
    }

    const dedupeState = markEventId(parsed.eventId);
    return {
        deduped: dedupeState.deduped,
    };
}
