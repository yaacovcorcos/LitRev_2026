import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CitationResult } from "@/lib/citation-types";
import {
    clearCitationMetadataClientCache,
    loadCitationMetadataWithClientCache,
} from "@/lib/citation-preview-cache";

const DOI_URL = "https://doi.org/10.1000/xyz123";

describe("citation preview client cache", () => {
    beforeEach(() => {
        clearCitationMetadataClientCache();
    });

    it("returns cached success on repeated loads", async () => {
        const loader = vi.fn().mockResolvedValue({
            success: true,
            data: {
                title: "Test title",
                authors: "Doe J",
                year: 2024,
                doi: "10.1000/xyz123",
            },
            meta: {
                diagnostics: {
                    resolutionPath: "doi_no_count",
                    reason: "crossref_no_count",
                    resolvedWithCitationCount: false,
                    hadDoiFallbackCandidate: false,
                },
            },
        } satisfies CitationResult);

        const first = await loadCitationMetadataWithClientCache(DOI_URL, loader);
        const second = await loadCitationMetadataWithClientCache(DOI_URL, loader);

        expect(first.fromCache).toBe(false);
        expect(second.fromCache).toBe(true);
        expect(second.result.success && second.result.meta.diagnostics.reason).toBe("crossref_no_count");
        expect(loader).toHaveBeenCalledTimes(1);
    });

    it("dedupes concurrent in-flight requests by citation key", async () => {
        let resolvePromise!: (value: CitationResult) => void;
        const loader = vi.fn().mockImplementation(
            () =>
                new Promise<CitationResult>((resolve) => {
                    resolvePromise = resolve;
                })
        );

        const firstPromise = loadCitationMetadataWithClientCache(DOI_URL, loader);
        const secondPromise = loadCitationMetadataWithClientCache(DOI_URL, loader);
        expect(loader).toHaveBeenCalledTimes(1);

        resolvePromise({
            success: true,
            data: {
                title: "Concurrent title",
                authors: "Smith A",
                doi: "10.1000/xyz123",
            },
            meta: {
                diagnostics: {
                    resolutionPath: "doi_no_count",
                    reason: "crossref_no_count",
                    resolvedWithCitationCount: false,
                    hadDoiFallbackCandidate: false,
                },
            },
        });

        const [first, second] = await Promise.all([firstPromise, secondPromise]);
        expect(first.dedupedInFlight).toBe(false);
        expect(second.dedupedInFlight).toBe(true);
    });

    it("does not cache failed responses", async () => {
        const loader = vi
            .fn()
            .mockResolvedValueOnce({ success: false, error: "temporary failure" } satisfies CitationResult)
            .mockResolvedValueOnce({
                success: true,
                data: {
                    title: "Recovered",
                    authors: "Brown K",
                    doi: "10.1000/xyz123",
                },
                meta: {
                    diagnostics: {
                        resolutionPath: "doi_no_count",
                        reason: "crossref_no_count",
                        resolvedWithCitationCount: false,
                        hadDoiFallbackCandidate: false,
                    },
                },
            } satisfies CitationResult);

        const first = await loadCitationMetadataWithClientCache(DOI_URL, loader);
        const second = await loadCitationMetadataWithClientCache(DOI_URL, loader);

        expect(first.result.success).toBe(false);
        expect(second.result.success).toBe(true);
        expect(loader).toHaveBeenCalledTimes(2);
    });
});
