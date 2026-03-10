// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    clearCitationPreviewMetrics,
    flushCitationPreviewMetricsForTests,
    getCitationPreviewMetricEvents,
    recordCitationPreviewMetric,
    setCitationPreviewMetricShippingOverrideForTests,
} from "@/lib/ai/citation-preview-telemetry";

describe("citation preview telemetry", () => {
    beforeEach(() => {
        clearCitationPreviewMetrics();
        setCitationPreviewMetricShippingOverrideForTests(null);
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it("records structured events in local storage", () => {
        recordCitationPreviewMetric({
            type: "hover_intent_started",
            surface: "project",
            payload: {
                citationKey: "doi:10.1000/xyz123",
                citationType: "DOI",
                trigger: "hover",
            },
        });

        recordCitationPreviewMetric({
            type: "metadata_request_completed",
            surface: "project",
            payload: {
                citationKey: "doi:10.1000/xyz123",
                citationType: "DOI",
                fromCache: true,
                latencyMs: 23,
                upstreamSource: "crossref",
            },
        });

        recordCitationPreviewMetric({
            type: "metadata_request_completed",
            surface: "project",
            payload: {
                citationKey: "pmid:12345678",
                citationType: "PubMed",
                fromCache: false,
                latencyMs: 31,
                upstreamSource: "icite",
                resolutionPath: "pubmed_icite",
                reason: "count_resolved",
                resolvedWithCitationCount: true,
                hadDoiFallbackCandidate: false,
            },
        });

        const events = getCitationPreviewMetricEvents();
        expect(events).toHaveLength(3);
        expect(events[0]).toMatchObject({
            version: 1,
            type: "hover_intent_started",
            surface: "project",
            payload: {
                citationKey: "doi:10.1000/xyz123",
                citationType: "DOI",
                trigger: "hover",
            },
        });
        expect(typeof events[0].eventId).toBe("string");
        expect(typeof events[0].timestamp).toBe("string");
        expect(events[2]).toMatchObject({
            type: "metadata_request_completed",
            payload: {
                citationKey: "pmid:12345678",
                citationType: "PubMed",
                upstreamSource: "icite",
                resolutionPath: "pubmed_icite",
                reason: "count_resolved",
            },
        });
    });

    it("keeps server shipping disabled by default until explicitly enabled", async () => {
        vi.useFakeTimers();
        vi.stubEnv("NODE_ENV", "development");

        try {
            const fetchMock = vi.fn().mockResolvedValue({ ok: true } as Response);
            vi.stubGlobal("fetch", fetchMock);

            recordCitationPreviewMetric({
                type: "hover_intent_started",
                surface: "project",
                payload: {
                    citationKey: "doi:10.1000/default-off",
                    citationType: "DOI",
                    trigger: "hover",
                },
            });

            await vi.advanceTimersByTimeAsync(600);
            await flushCitationPreviewMetricsForTests();

            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });

    it("flushes metrics enqueued while a flush is in progress", async () => {
        vi.useFakeTimers();
        setCitationPreviewMetricShippingOverrideForTests(true);

        try {
            const firstPostState: { resolve?: () => void } = {};
            const fetchMock = vi.fn().mockImplementation(() => {
                if (!firstPostState.resolve) {
                    return new Promise((resolve) => {
                        firstPostState.resolve = () => resolve({ ok: true } as Response);
                    });
                }
                return Promise.resolve({ ok: true } as Response);
            });
            vi.stubGlobal("fetch", fetchMock);

            recordCitationPreviewMetric({
                type: "hover_intent_started",
                surface: "project",
                payload: {
                    citationKey: "doi:10.1000/queued-1",
                    citationType: "DOI",
                    trigger: "hover",
                },
            });

            await vi.advanceTimersByTimeAsync(500);
            expect(fetchMock).toHaveBeenCalledTimes(1);

            recordCitationPreviewMetric({
                type: "metadata_request_started",
                surface: "project",
                payload: {
                    citationKey: "doi:10.1000/queued-2",
                    citationType: "DOI",
                },
            });

            await vi.advanceTimersByTimeAsync(500);
            expect(fetchMock).toHaveBeenCalledTimes(1);

            if (!firstPostState.resolve) {
                throw new Error("First telemetry request was not started");
            }
            firstPostState.resolve();
            await flushCitationPreviewMetricsForTests();
            await vi.advanceTimersByTimeAsync(500);

            expect(fetchMock).toHaveBeenCalledTimes(2);
        } finally {
            vi.useRealTimers();
        }
    });
});
