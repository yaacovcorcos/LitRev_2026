import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthContext } from "@/lib/server/auth/session";

const mocks = vi.hoisted(() => ({
    chatMetricCreate: vi.fn(),
    assertProjectAccess: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        chatUnificationMetric: {
            create: mocks.chatMetricCreate,
        },
    },
}));

vi.mock("@/lib/server/access", () => ({
    assertProjectAccess: (...args: unknown[]) => mocks.assertProjectAccess(...args),
}));

const { ingestCitationPreviewMetric } = await import("../citation-preview-metrics");

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
        vi.clearAllMocks();
    });

    it("persists valid metric input with scoped identity", async () => {
        mocks.chatMetricCreate.mockResolvedValue({ id: "metric-1" });

        const result = await ingestCitationPreviewMetric(
            AUTH_CONTEXT,
            buildMetricInput({
                type: "metadata_request_completed",
                payload: {
                    citationKey: "pmid:12345678",
                    citationType: "PubMed",
                    latencyMs: 142,
                    upstreamSource: "icite",
                    resolutionPath: "pubmed_icite",
                    reason: "count_resolved",
                    resolvedWithCitationCount: true,
                    hadDoiFallbackCandidate: false,
                },
            }),
        );

        expect(result).toEqual({ deduped: false, id: "metric-1" });
        expect(mocks.chatMetricCreate).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    type: "citation_preview.metadata_request_completed",
                    surface: "project",
                    userId: "user-test",
                    workspaceId: "workspace-test",
                }),
            }),
        );
    });

    it("validates project access when projectId is provided", async () => {
        mocks.chatMetricCreate.mockResolvedValue({ id: "metric-2" });

        await ingestCitationPreviewMetric(
            AUTH_CONTEXT,
            buildMetricInput({
                projectId: "project-123",
            }),
        );

        expect(mocks.assertProjectAccess).toHaveBeenCalledWith(
            { ownerId: "user-test", workspaceId: "workspace-test" },
            "project-123",
        );
    });

    it("treats duplicate event ids as deduped success", async () => {
        mocks.chatMetricCreate.mockRejectedValue({
            code: "P2002",
            meta: { target: ["eventId"] },
        });

        const result = await ingestCitationPreviewMetric(AUTH_CONTEXT, buildMetricInput());
        expect(result).toEqual({ deduped: true, id: null });
    });

    it("rejects oversized event ids", async () => {
        await expect(
            ingestCitationPreviewMetric(
                AUTH_CONTEXT,
                buildMetricInput({ eventId: "x".repeat(129) }),
            ),
        ).rejects.toThrow();
    });

    it("rejects oversized citation keys", async () => {
        await expect(
            ingestCitationPreviewMetric(
                AUTH_CONTEXT,
                buildMetricInput({
                    payload: {
                        citationKey: "k".repeat(513),
                        citationType: "DOI",
                        trigger: "hover",
                    },
                }),
            ),
        ).rejects.toThrow();
    });
});
