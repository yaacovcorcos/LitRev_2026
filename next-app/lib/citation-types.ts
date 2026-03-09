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

export type CitationResult =
    | { success: true; data: CitationMetadata }
    | { success: false; error: string };
