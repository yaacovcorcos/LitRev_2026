import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    resolveCitationMetadataCached: vi.fn(),
    continueCitationMetadataCached: vi.fn(),
    isCitationContinuationServerEnabled: vi.fn(),
}));

vi.mock("@/lib/server/citation-metadata", () => ({
    resolveCitationMetadataCached: (...args: unknown[]) => mocks.resolveCitationMetadataCached(...args),
    continueCitationMetadataCached: (...args: unknown[]) => mocks.continueCitationMetadataCached(...args),
}));

vi.mock("@/lib/citation-preview-feature-flags", () => ({
    isCitationContinuationServerEnabled: (...args: unknown[]) =>
        mocks.isCitationContinuationServerEnabled(...args),
}));

const { fetchCitationMetadata, continueCitationMetadata } = await import("../citation");

describe("citation actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.isCitationContinuationServerEnabled.mockReturnValue(true);
    });

    it("returns successful metadata fetches with diagnostics", async () => {
        mocks.resolveCitationMetadataCached.mockResolvedValue({
            metadata: {
                title: "Citation title",
                authors: "Doe J",
                doi: "10.1000/xyz123",
            },
            diagnostics: {
                resolutionPath: "doi_no_count",
                reason: "crossref_no_count",
                resolvedWithCitationCount: false,
                hadDoiFallbackCandidate: false,
            },
        });

        await expect(fetchCitationMetadata("https://doi.org/10.1000/xyz123")).resolves.toMatchObject({
            success: true,
            meta: {
                diagnostics: {
                    resolutionPath: "doi_no_count",
                },
            },
        });
    });

    it("blocks continuation when the server flag is disabled", async () => {
        mocks.isCitationContinuationServerEnabled.mockReturnValue(false);

        await expect(continueCitationMetadata("https://doi.org/10.1000/xyz123")).resolves.toEqual({
            success: false,
            error: "Citation continuation disabled",
        });
        expect(mocks.continueCitationMetadataCached).not.toHaveBeenCalled();
    });

    it("returns a successful continuation result when the server cache can continue", async () => {
        mocks.continueCitationMetadataCached.mockResolvedValue({
            metadata: {
                title: "Citation title",
                authors: "Doe J",
                doi: "10.1000/xyz123",
                citationCount: 33,
                citationCountSource: "crossref",
            },
            diagnostics: {
                resolutionPath: "doi_crossref",
                reason: "count_resolved",
                resolvedWithCitationCount: true,
                hadDoiFallbackCandidate: false,
            },
        });

        await expect(continueCitationMetadata("https://doi.org/10.1000/xyz123")).resolves.toMatchObject({
            success: true,
            data: {
                citationCount: 33,
            },
            meta: {
                diagnostics: {
                    reason: "count_resolved",
                },
            },
        });
    });
});
