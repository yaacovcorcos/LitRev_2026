import type {
    CitationResolutionPath,
    CitationResolutionReason,
} from "@/lib/citation-types";

export type CitationPreviewSurface = "project" | "popup" | "ai" | "unknown";

export type CitationPreviewMetricType =
    | "hover_intent_started"
    | "prefetch_started"
    | "popover_opened"
    | "metadata_request_started"
    | "metadata_request_completed"
    | "metadata_request_failed"
    | "continuation_completed"
    | "continuation_failed";

export type CitationPreviewTrigger = "hover" | "focus" | "touch" | "prefetch";

export type CitationPreviewMetricPayload = {
    citationKey: string | null;
    citationType: "DOI" | "PubMed" | null;
    trigger?: CitationPreviewTrigger;
    fromCache?: boolean;
    latencyMs?: number;
    upstreamSource?: "icite" | "crossref" | "pubmed" | "unknown";
    resolutionPath?: CitationResolutionPath;
    reason?: CitationResolutionReason;
    resolvedWithCitationCount?: boolean;
    hadDoiFallbackCandidate?: boolean;
    continuationRecoveredCount?: boolean;
    errorCode?: string | null;
};

export type CitationPreviewMetricEvent = {
    eventId: string;
    version: 1;
    type: CitationPreviewMetricType;
    surface: CitationPreviewSurface;
    projectId?: string | null;
    conversationId?: string | null;
    timestamp: string;
    payload: CitationPreviewMetricPayload;
};

export type CitationPreviewMetricInput = Omit<CitationPreviewMetricEvent, "timestamp"> & {
    clientTimestamp: string;
};
