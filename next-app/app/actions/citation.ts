"use server";

import type { CitationResult } from "@/lib/citation-types";
import { resolveCitationMetadataCached } from "@/lib/server/citation-metadata";

/**
 * Server action to fetch citation metadata for a DOI or PubMed URL.
 * Results are cached server-side.
 */
export async function fetchCitationMetadata(url: string): Promise<CitationResult> {
    if (!url || typeof url !== "string") {
        return { success: false, error: "Invalid URL" };
    }

    try {
        const resolution = await resolveCitationMetadataCached(url);
        if (!resolution) {
            return { success: false, error: "Unable to resolve citation" };
        }
        return {
            success: true,
            data: resolution.metadata,
            meta: {
                diagnostics: resolution.diagnostics,
            },
        };
    } catch (error) {
        console.error("[fetchCitationMetadata] failed:", error);
        return { success: false, error: "Failed to fetch metadata" };
    }
}
