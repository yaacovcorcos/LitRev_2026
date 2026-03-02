// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { CitationPreview } from "../CitationPreview";
import { fetchCitationMetadata } from "@/app/actions/citation";
import { isCitationHoverPrefetchEnabled } from "@/lib/citation-preview-feature-flags";
import { recordCitationPreviewMetric } from "@/lib/ai/citation-preview-telemetry";
import { clearCitationMetadataClientCache } from "@/lib/citation-preview-cache";

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
    }),
}));

vi.mock("@/lib/citation-preview-feature-flags", () => ({
    isCitationHoverPrefetchEnabled: vi.fn().mockReturnValue(false),
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
});
