export interface CitationMetadata {
    title: string;
    authors: string;
    year?: number;
    journal?: string;
    citationCount?: number;
    citationCountSource?: "icite" | "crossref";
    citationCountFetchedAt?: string;
    canonicalUrl?: string;
    doi?: string;
    pmid?: string;
}

export type CitationResolutionPath =
    | "pubmed_icite"
    | "pubmed_crossref_fallback"
    | "pubmed_bibliography_only"
    | "doi_crossref"
    | "doi_no_count";

export type CitationResolutionReason =
    | "count_resolved"
    | "no_doi_fallback"
    | "icite_no_count"
    | "icite_timeout"
    | "crossref_no_count"
    | "crossref_timeout"
    | "budget_exhausted"
    | "provider_error";

export interface CitationResolutionDiagnostics {
    resolutionPath: CitationResolutionPath;
    reason: CitationResolutionReason;
    resolvedWithCitationCount: boolean;
    hadDoiFallbackCandidate: boolean;
}

export interface CitationSuccessResult {
    success: true;
    data: CitationMetadata;
    meta: {
        diagnostics: CitationResolutionDiagnostics;
    };
}

export type CitationResult =
    | CitationSuccessResult
    | { success: false; error: string };
