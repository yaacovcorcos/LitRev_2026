// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import {
    clearCitationPreviewMetrics,
    getCitationPreviewMetricEvents,
    recordCitationPreviewMetric,
} from "@/lib/ai/citation-preview-telemetry";

describe("citation preview telemetry", () => {
    beforeEach(() => {
        clearCitationPreviewMetrics();
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
});
