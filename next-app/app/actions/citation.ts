"use server";

import type { CitationResult } from "@/lib/citation-types";
import { isCitationContinuationServerEnabled } from "@/lib/citation-preview-feature-flags";
import {
    continueCitationMetadataCached,
    resolveCitationMetadataCached,
} from "@/lib/server/citation-metadata";

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

export async function continueCitationMetadata(url: string): Promise<CitationResult> {
    if (!url || typeof url !== "string") {
        return { success: false, error: "Invalid URL" };
    }

    if (!isCitationContinuationServerEnabled()) {
        return { success: false, error: "Citation continuation disabled" };
    }

    try {
        const resolution = await continueCitationMetadataCached(url);
        if (!resolution) {
            return { success: false, error: "Citation continuation unavailable" };
        }
        return {
            success: true,
            data: resolution.metadata,
            meta: {
                diagnostics: resolution.diagnostics,
            },
        };
    } catch (error) {
        console.error("[continueCitationMetadata] failed:", error);
        return { success: false, error: "Failed to continue metadata" };
    }
}
