// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearCitationMetadataClientCache } from "@/lib/citation-preview-cache";
import { useMentionedStudyTitles } from "@/lib/ai/use-mentioned-study-titles";
import type { MentionedStudy } from "@/lib/ai/mentioned-studies";

const fetchCitationMetadata = vi.fn();

vi.mock("@/app/actions/citation", () => ({
    fetchCitationMetadata: (...args: unknown[]) => fetchCitationMetadata(...args),
}));

describe("useMentionedStudyTitles", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearCitationMetadataClientCache();
    });

    it("hydrates active untitled mentions and omits stale titles after rerender", async () => {
        fetchCitationMetadata.mockResolvedValue({
            success: true,
            data: {
                title: "Hydrated DOI Study",
                doi: "10.1000/xyz123",
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

        const mentions: MentionedStudy[] = [
            {
                key: "doi:10.1000/xyz123",
                doi: "10.1000/xyz123",
                sourceUrl: "https://doi.org/10.1000/xyz123",
                confidence: "high",
            },
        ];

        const { result, rerender } = renderHook(
            ({ studies }) => useMentionedStudyTitles(studies),
            { initialProps: { studies: mentions } },
        );

        await waitFor(() => {
            expect(result.current["doi:10.1000/xyz123"]).toBe("Hydrated DOI Study");
        });

        rerender({ studies: [] });

        expect(result.current).toEqual({});
    });
});
