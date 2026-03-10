import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CitationResult } from "@/lib/citation-types";
import {
    clearCitationMetadataClientCache,
    loadCitationMetadataWithClientCache,
    markCitationContinuationAttempted,
    patchCitationMetadataInClientCache,
    shouldAttemptCitationContinuation,
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

    it("patches cached success results with continuation count fields only", async () => {
        const loader = vi.fn().mockResolvedValue({
            success: true,
            data: {
                title: "Initial title",
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

        await loadCitationMetadataWithClientCache(DOI_URL, loader);
        const patched = patchCitationMetadataInClientCache(DOI_URL, {
            success: true,
            data: {
                title: "Different title that should not replace cached bibliography",
                authors: "Different author",
                year: 1999,
                doi: "10.1000/xyz123",
                citationCount: 44,
                citationCountSource: "crossref",
                citationCountFetchedAt: "2026-03-10T15:00:00.000Z",
            },
            meta: {
                diagnostics: {
                    resolutionPath: "doi_crossref",
                    reason: "count_resolved",
                    resolvedWithCitationCount: true,
                    hadDoiFallbackCandidate: false,
                },
            },
        });

        expect(patched.data).toMatchObject({
            title: "Initial title",
            authors: "Doe J",
            year: 2024,
            citationCount: 44,
            citationCountSource: "crossref",
        });
        expect(patched.meta.diagnostics).toMatchObject({
            resolutionPath: "doi_crossref",
            reason: "count_resolved",
            resolvedWithCitationCount: true,
        });
    });

    it("keeps an existing count-bearing cached result when a stale no-count patch arrives", async () => {
        const loader = vi.fn().mockResolvedValue({
            success: true,
            data: {
                title: "Initial title",
                authors: "Doe J",
                year: 2024,
                doi: "10.1000/xyz123",
                citationCount: 44,
                citationCountSource: "crossref",
                citationCountFetchedAt: "2026-03-10T15:00:00.000Z",
            },
            meta: {
                diagnostics: {
                    resolutionPath: "doi_crossref",
                    reason: "count_resolved",
                    resolvedWithCitationCount: true,
                    hadDoiFallbackCandidate: false,
                },
            },
        } satisfies CitationResult);

        await loadCitationMetadataWithClientCache(DOI_URL, loader);
        const patched = patchCitationMetadataInClientCache(DOI_URL, {
            success: true,
            data: {
                title: "Stale title",
                authors: "Stale author",
                year: 1999,
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

        expect(patched.data.citationCount).toBe(44);
        expect(patched.data.citationCountSource).toBe("crossref");
        expect(patched.meta.diagnostics).toMatchObject({
            resolutionPath: "doi_crossref",
            reason: "count_resolved",
            resolvedWithCitationCount: true,
        });
    });

    it("suppresses repeated continuation attempts for the same unresolved retryable state", () => {
        const diagnostics = {
            resolutionPath: "pubmed_bibliography_only" as const,
            reason: "budget_exhausted" as const,
            resolvedWithCitationCount: false,
            hadDoiFallbackCandidate: true,
        };

        expect(shouldAttemptCitationContinuation(DOI_URL, diagnostics)).toBe(true);
        markCitationContinuationAttempted(DOI_URL, diagnostics);
        expect(shouldAttemptCitationContinuation(DOI_URL, diagnostics)).toBe(false);
    });
});
