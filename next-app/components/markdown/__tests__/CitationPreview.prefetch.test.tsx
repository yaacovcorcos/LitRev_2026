// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CitationPreview } from "../CitationPreview";
import {
    continueCitationMetadata,
    fetchCitationMetadata,
} from "@/app/actions/citation";
import {
    isCitationHoverContinuationEnabled,
    isCitationHoverPrefetchEnabled,
} from "@/lib/citation-preview-feature-flags";
import { recordCitationPreviewMetric } from "@/lib/ai/citation-preview-telemetry";
import {
    clearCitationMetadataClientCache,
    getCitationMetadataFromClientCache,
} from "@/lib/citation-preview-cache";

vi.mock("@/app/actions/citation", () => ({
    fetchCitationMetadata: vi.fn().mockResolvedValue({
        success: true,
        data: {
            title: "Citation title",
            authors: "Doe J",
            year: 2024,
            journal: "Journal of Tests",
            canonicalUrl: "https://doi.org/10.1000/xyz123",
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
    }),
    continueCitationMetadata: vi.fn().mockResolvedValue({
        success: true,
        data: {
            title: "Citation title",
            authors: "Doe J",
            year: 2024,
            journal: "Journal of Tests",
            canonicalUrl: "https://doi.org/10.1000/xyz123",
            doi: "10.1000/xyz123",
            citationCount: 21,
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
    }),
}));

vi.mock("@/lib/citation-preview-feature-flags", () => ({
    isCitationHoverPrefetchEnabled: vi.fn().mockReturnValue(false),
    isCitationHoverContinuationEnabled: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/ai/citation-preview-telemetry", () => ({
    recordCitationPreviewMetric: vi.fn(),
}));

describe("CitationPreview prefetch behavior", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        clearCitationMetadataClientCache();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("prefetches before hover open when flag is enabled", async () => {
        vi.mocked(isCitationHoverPrefetchEnabled).mockReturnValue(true);

        render(
            <CitationPreview href="https://doi.org/10.1000/xyz123" type="DOI">
                DOI
            </CitationPreview>
        );

        const link = screen.getByRole("link", { name: "DOI" });
        fireEvent.mouseEnter(link);

        await act(async () => {
            vi.advanceTimersByTime(140);
        });

        expect(vi.mocked(fetchCitationMetadata)).toHaveBeenCalledTimes(1);
        expect(
            vi.mocked(recordCitationPreviewMetric).mock.calls.some(
                ([event]) => event.type === "prefetch_started"
            )
        ).toBe(true);
    });

    it("keeps previous behavior when prefetch flag is disabled", async () => {
        vi.mocked(isCitationHoverPrefetchEnabled).mockReturnValue(false);

        render(
            <CitationPreview href="https://doi.org/10.1000/xyz123" type="DOI">
                DOI
            </CitationPreview>
        );

        const link = screen.getByRole("link", { name: "DOI" });
        fireEvent.mouseEnter(link);

        await act(async () => {
            vi.advanceTimersByTime(140);
        });
        expect(vi.mocked(fetchCitationMetadata)).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(200);
        });
        expect(vi.mocked(fetchCitationMetadata)).toHaveBeenCalledTimes(1);
    });

    it("records resolver diagnostics on successful metadata loads", async () => {
        vi.mocked(isCitationHoverPrefetchEnabled).mockReturnValue(false);

        render(
            <CitationPreview href="https://doi.org/10.1000/xyz123" type="DOI">
                DOI
            </CitationPreview>
        );

        const link = screen.getByRole("link", { name: "DOI" });
        fireEvent.mouseEnter(link);

        await act(async () => {
            vi.advanceTimersByTime(350);
        });

        expect(
            vi.mocked(recordCitationPreviewMetric).mock.calls.some(
                ([event]) =>
                    event.type === "metadata_request_completed"
                    && event.payload.resolutionPath === "doi_no_count"
                    && event.payload.reason === "crossref_no_count"
            )
        ).toBe(true);
    });

    it("continues in the background for retryable missing-count results and patches the card", async () => {
        vi.mocked(isCitationHoverPrefetchEnabled).mockReturnValue(false);
        vi.mocked(isCitationHoverContinuationEnabled).mockReturnValue(true);
        vi.mocked(fetchCitationMetadata).mockResolvedValueOnce({
            success: true,
            data: {
                title: "Citation title",
                authors: "Doe J",
                year: 2024,
                journal: "Journal of Tests",
                canonicalUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
                pmid: "12345678",
                doi: "10.1000/xyz123",
            },
            meta: {
                diagnostics: {
                    resolutionPath: "pubmed_bibliography_only",
                    reason: "budget_exhausted",
                    resolvedWithCitationCount: false,
                    hadDoiFallbackCandidate: true,
                },
            },
        });

        render(
            <CitationPreview href="https://pubmed.ncbi.nlm.nih.gov/12345678/" type="PubMed">
                PubMed
            </CitationPreview>
        );

        const link = screen.getByRole("link", { name: "PubMed" });
        fireEvent.mouseEnter(link);

        await act(async () => {
            vi.advanceTimersByTime(350);
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(vi.mocked(continueCitationMetadata)).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Cited 21 times")).toBeTruthy();
        expect(
            vi.mocked(recordCitationPreviewMetric).mock.calls.some(
                ([event]) =>
                    event.type === "continuation_completed"
                    && event.payload.continuationRecoveredCount === true
            )
        ).toBe(true);
    });

    it("does not continue for non-retryable missing-count results", async () => {
        vi.mocked(isCitationHoverPrefetchEnabled).mockReturnValue(false);
        vi.mocked(isCitationHoverContinuationEnabled).mockReturnValue(true);
        vi.mocked(fetchCitationMetadata).mockResolvedValueOnce({
            success: true,
            data: {
                title: "Citation title",
                authors: "Doe J",
                year: 2024,
                journal: "Journal of Tests",
                canonicalUrl: "https://doi.org/10.1000/xyz123",
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

        render(
            <CitationPreview href="https://doi.org/10.1000/xyz123" type="DOI">
                DOI
            </CitationPreview>
        );

        const link = screen.getByRole("link", { name: "DOI" });
        fireEvent.mouseEnter(link);

        await act(async () => {
            vi.advanceTimersByTime(350);
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(vi.mocked(continueCitationMetadata)).not.toHaveBeenCalled();
    });

    it("ignores a continuation result that resolves after the popover closes", async () => {
        vi.mocked(isCitationHoverPrefetchEnabled).mockReturnValue(false);
        vi.mocked(isCitationHoverContinuationEnabled).mockReturnValue(true);

        let resolveContinuation!: (value: Awaited<ReturnType<typeof continueCitationMetadata>>) => void;
        vi.mocked(fetchCitationMetadata).mockResolvedValueOnce({
            success: true,
            data: {
                title: "Citation title",
                authors: "Doe J",
                year: 2024,
                journal: "Journal of Tests",
                canonicalUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
                pmid: "12345678",
                doi: "10.1000/xyz123",
            },
            meta: {
                diagnostics: {
                    resolutionPath: "pubmed_bibliography_only",
                    reason: "budget_exhausted",
                    resolvedWithCitationCount: false,
                    hadDoiFallbackCandidate: true,
                },
            },
        });
        vi.mocked(continueCitationMetadata).mockImplementationOnce(
            () => new Promise((resolve) => {
                resolveContinuation = resolve;
            }),
        );

        render(
            <CitationPreview href="https://pubmed.ncbi.nlm.nih.gov/12345678/" type="PubMed">
                PubMed
            </CitationPreview>
        );

        const link = screen.getByRole("link", { name: "PubMed" });
        fireEvent.mouseEnter(link);

        await act(async () => {
            vi.advanceTimersByTime(350);
            await Promise.resolve();
            await Promise.resolve();
        });

        fireEvent.keyDown(link, { key: "Escape" });

        await act(async () => {
            resolveContinuation({
                success: true,
                data: {
                    title: "Citation title",
                    authors: "Doe J",
                    year: 2024,
                    journal: "Journal of Tests",
                    canonicalUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
                    pmid: "12345678",
                    doi: "10.1000/xyz123",
                    citationCount: 21,
                    citationCountSource: "crossref",
                    citationCountFetchedAt: "2026-03-10T15:00:00.000Z",
                },
                meta: {
                    diagnostics: {
                        resolutionPath: "pubmed_crossref_fallback",
                        reason: "count_resolved",
                        resolvedWithCitationCount: true,
                        hadDoiFallbackCandidate: true,
                    },
                },
            });
            await Promise.resolve();
        });

        expect(getCitationMetadataFromClientCache("https://pubmed.ncbi.nlm.nih.gov/12345678/")?.data.citationCount).toBeUndefined();
        expect(
            vi.mocked(recordCitationPreviewMetric).mock.calls.some(
                ([event]) => event.type === "continuation_completed",
            )
        ).toBe(false);
    });

    it("ignores a continuation result that resolves after unmount", async () => {
        vi.mocked(isCitationHoverPrefetchEnabled).mockReturnValue(false);
        vi.mocked(isCitationHoverContinuationEnabled).mockReturnValue(true);

        let resolveContinuation!: (value: Awaited<ReturnType<typeof continueCitationMetadata>>) => void;
        vi.mocked(fetchCitationMetadata).mockResolvedValueOnce({
            success: true,
            data: {
                title: "Citation title",
                authors: "Doe J",
                year: 2024,
                journal: "Journal of Tests",
                canonicalUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
                pmid: "12345678",
                doi: "10.1000/xyz123",
            },
            meta: {
                diagnostics: {
                    resolutionPath: "pubmed_bibliography_only",
                    reason: "budget_exhausted",
                    resolvedWithCitationCount: false,
                    hadDoiFallbackCandidate: true,
                },
            },
        });
        vi.mocked(continueCitationMetadata).mockImplementationOnce(
            () => new Promise((resolve) => {
                resolveContinuation = resolve;
            }),
        );

        const view = render(
            <CitationPreview href="https://pubmed.ncbi.nlm.nih.gov/12345678/" type="PubMed">
                PubMed
            </CitationPreview>
        );

        fireEvent.mouseEnter(screen.getByRole("link", { name: "PubMed" }));

        await act(async () => {
            vi.advanceTimersByTime(350);
            await Promise.resolve();
            await Promise.resolve();
        });

        view.unmount();

        await act(async () => {
            resolveContinuation({
                success: true,
                data: {
                    title: "Citation title",
                    authors: "Doe J",
                    year: 2024,
                    journal: "Journal of Tests",
                    canonicalUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
                    pmid: "12345678",
                    doi: "10.1000/xyz123",
                    citationCount: 21,
                    citationCountSource: "crossref",
                    citationCountFetchedAt: "2026-03-10T15:00:00.000Z",
                },
                meta: {
                    diagnostics: {
                        resolutionPath: "pubmed_crossref_fallback",
                        reason: "count_resolved",
                        resolvedWithCitationCount: true,
                        hadDoiFallbackCandidate: true,
                    },
                },
            });
            await Promise.resolve();
        });

        expect(getCitationMetadataFromClientCache("https://pubmed.ncbi.nlm.nih.gov/12345678/")?.data.citationCount).toBeUndefined();
    });

    it("ignores a continuation result that resolves after the href changes", async () => {
        vi.mocked(isCitationHoverPrefetchEnabled).mockReturnValue(false);
        vi.mocked(isCitationHoverContinuationEnabled).mockReturnValue(true);

        let resolveContinuation!: (value: Awaited<ReturnType<typeof continueCitationMetadata>>) => void;
        vi.mocked(fetchCitationMetadata).mockResolvedValueOnce({
            success: true,
            data: {
                title: "Citation title",
                authors: "Doe J",
                year: 2024,
                journal: "Journal of Tests",
                canonicalUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
                pmid: "12345678",
                doi: "10.1000/xyz123",
            },
            meta: {
                diagnostics: {
                    resolutionPath: "pubmed_bibliography_only",
                    reason: "budget_exhausted",
                    resolvedWithCitationCount: false,
                    hadDoiFallbackCandidate: true,
                },
            },
        });
        vi.mocked(continueCitationMetadata).mockImplementationOnce(
            () => new Promise((resolve) => {
                resolveContinuation = resolve;
            }),
        );

        const view = render(
            <CitationPreview href="https://pubmed.ncbi.nlm.nih.gov/12345678/" type="PubMed">
                PubMed
            </CitationPreview>
        );

        fireEvent.mouseEnter(screen.getByRole("link", { name: "PubMed" }));

        await act(async () => {
            vi.advanceTimersByTime(350);
            await Promise.resolve();
            await Promise.resolve();
        });

        view.rerender(
            <CitationPreview href="https://pubmed.ncbi.nlm.nih.gov/87654321/" type="PubMed">
                PubMed
            </CitationPreview>
        );

        await act(async () => {
            resolveContinuation({
                success: true,
                data: {
                    title: "Citation title",
                    authors: "Doe J",
                    year: 2024,
                    journal: "Journal of Tests",
                    canonicalUrl: "https://pubmed.ncbi.nlm.nih.gov/12345678/",
                    pmid: "12345678",
                    doi: "10.1000/xyz123",
                    citationCount: 21,
                    citationCountSource: "crossref",
                    citationCountFetchedAt: "2026-03-10T15:00:00.000Z",
                },
                meta: {
                    diagnostics: {
                        resolutionPath: "pubmed_crossref_fallback",
                        reason: "count_resolved",
                        resolvedWithCitationCount: true,
                        hadDoiFallbackCandidate: true,
                    },
                },
            });
            await Promise.resolve();
        });

        expect(getCitationMetadataFromClientCache("https://pubmed.ncbi.nlm.nih.gov/12345678/")?.data.citationCount).toBeUndefined();
    });
});
