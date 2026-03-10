import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/server/prisma", () => ({
    prisma: {
        chatUnificationMetric: {
            findMany: vi.fn(),
        },
        $disconnect: vi.fn(),
    },
}));

const originalArgv = [...process.argv];

describe("report-citation-preview-metrics", () => {
    afterEach(() => {
        process.argv = [...originalArgv];
        vi.resetModules();
    });

    it("builds a global where clause when no scope filters are provided", async () => {
        const { buildMetricReportWhereClause } = await import("../report-citation-preview-metrics");

        const where = buildMetricReportWhereClause(
            new Date("2026-03-10T00:00:00.000Z"),
            new Date("2026-03-11T00:00:00.000Z"),
            { workspaceIds: [], projectIds: [] },
        );

        expect(where).toEqual({
            recordedAt: {
                gte: new Date("2026-03-10T00:00:00.000Z"),
                lte: new Date("2026-03-11T00:00:00.000Z"),
            },
            type: {
                startsWith: "citation_preview.",
            },
        });
    });

    it("adds workspace and project filters when provided", async () => {
        process.argv = [
            "node",
            "scripts/report-citation-preview-metrics.ts",
            "--workspaceIds=ws-1,ws-2",
            "--projectIds=project-1,project-2",
        ];

        const {
            buildMetricReportFilters,
            buildMetricReportWhereClause,
        } = await import("../report-citation-preview-metrics");

        const filters = buildMetricReportFilters();
        const where = buildMetricReportWhereClause(
            new Date("2026-03-10T00:00:00.000Z"),
            new Date("2026-03-11T00:00:00.000Z"),
            filters,
        );

        expect(filters).toEqual({
            workspaceIds: ["ws-1", "ws-2"],
            projectIds: ["project-1", "project-2"],
        });
        expect(where).toEqual({
            recordedAt: {
                gte: new Date("2026-03-10T00:00:00.000Z"),
                lte: new Date("2026-03-11T00:00:00.000Z"),
            },
            type: {
                startsWith: "citation_preview.",
            },
            workspaceId: {
                in: ["ws-1", "ws-2"],
            },
            projectId: {
                in: ["project-1", "project-2"],
            },
        });
    });
});
