// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
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

        const events = getCitationPreviewMetricEvents();
        expect(events).toHaveLength(2);
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
