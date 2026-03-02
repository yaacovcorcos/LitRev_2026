import { beforeEach, describe, expect, it } from "vitest";
import type { AuthContext } from "@/lib/server/auth/session";
import {
    __clearCitationPreviewMetricDedupeForTests,
    ingestCitationPreviewMetric,
} from "../citation-preview-metrics";

const AUTH_CONTEXT: AuthContext = {
    userId: "user-test",
    workspaceId: "workspace-test",
    role: "owner",
};

function buildMetricInput(overrides: Record<string, unknown> = {}) {
    return {
        eventId: "event-1",
        version: 1,
        type: "hover_intent_started",
        surface: "project",
        projectId: null,
        conversationId: null,
        clientTimestamp: new Date("2026-03-02T00:00:00.000Z").toISOString(),
        payload: {
            citationKey: "doi:10.1000/xyz123",
            citationType: "DOI",
            trigger: "hover",
        },
        ...overrides,
    };
}

describe("citation-preview metrics ingestion", () => {
    beforeEach(() => {
        __clearCitationPreviewMetricDedupeForTests();
    });

    it("accepts valid metric input and dedupes repeated event ids", async () => {
        const input = buildMetricInput();

        const first = await ingestCitationPreviewMetric(AUTH_CONTEXT, input);
        const second = await ingestCitationPreviewMetric(AUTH_CONTEXT, input);

        expect(first).toEqual({ deduped: false });
        expect(second).toEqual({ deduped: true });
    });

    it("rejects oversized event ids", async () => {
        const input = buildMetricInput({ eventId: "x".repeat(129) });
        await expect(ingestCitationPreviewMetric(AUTH_CONTEXT, input)).rejects.toThrow();
    });

    it("rejects oversized citation keys", async () => {
        const input = buildMetricInput({
            payload: {
                citationKey: "k".repeat(513),
                citationType: "DOI",
                trigger: "hover",
            },
        });

        await expect(ingestCitationPreviewMetric(AUTH_CONTEXT, input)).rejects.toThrow();
    });
});
