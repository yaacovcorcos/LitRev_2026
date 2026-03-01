"use server";

import { resolveCitationMetadataCached, type CitationMetadata } from "@/lib/server/citation-metadata";

// Re-export CitationMetadata type for client-side usage
export type { CitationMetadata };

export type CitationResult =
    | { success: true; data: CitationMetadata }
    | { success: false; error: string };

/**
 * Server action to fetch citation metadata for a DOI or PubMed URL.
 * Results are cached server-side.
 */
export async function fetchCitationMetadata(url: string): Promise<CitationResult> {
    if (!url || typeof url !== "string") {
        return { success: false, error: "Invalid URL" };
    }

    try {
        const metadata = await resolveCitationMetadataCached(url);
        if (!metadata) {
            return { success: false, error: "Unable to resolve citation" };
        }
        return { success: true, data: metadata };
    } catch (error) {
        console.error("[fetchCitationMetadata] failed:", error);
        return { success: false, error: "Failed to fetch metadata" };
    }
}
