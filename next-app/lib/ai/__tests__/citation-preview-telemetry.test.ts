// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    clearCitationPreviewMetrics,
    flushCitationPreviewMetricsForTests,
    getCitationPreviewMetricEvents,
    recordCitationPreviewMetric,
} from "@/lib/ai/citation-preview-telemetry";

describe("citation preview telemetry", () => {
    beforeEach(() => {
        clearCitationPreviewMetrics();
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
});
