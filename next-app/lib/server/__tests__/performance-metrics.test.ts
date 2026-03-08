import { beforeEach, describe, expect, it, vi } from "vitest";

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

const { ingestPerformanceMetric } = await import("@/lib/server/performance-metrics");

const AUTH = {
  userId: "user-1",
  workspaceId: "ws-1",
  role: "owner",
} as const;

describe("performance-metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ingests performance web vitals with scoped identity", async () => {
    mocks.chatMetricCreate.mockResolvedValue({ id: "metric-1" });

    const result = await ingestPerformanceMetric(AUTH, {
      eventId: "evt-1",
      version: 1,
      name: "LCP",
      value: 1780,
      metricId: "metric-lcp-1",
      rating: "good",
      routeTemplate: "/project/[id]",
      surface: "project_conversation",
      projectId: "project-1",
      clientTimestamp: "2026-03-05T10:00:00.000Z",
      dimensions: {
        viewport: "desktop",
        network: "4g",
        online: true,
        synthetic: false,
        appVersion: "0.1.0",
        commitSha: "abc123",
      },
    });

    expect(result).toEqual({ deduped: false, id: "metric-1" });
    expect(mocks.assertProjectAccess).toHaveBeenCalledWith(
      { ownerId: "user-1", workspaceId: "ws-1" },
      "project-1",
    );
    expect(mocks.chatMetricCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "performance_web_vital",
          surface: "project_conversation",
          userId: "user-1",
          workspaceId: "ws-1",
          projectId: "project-1",
        }),
      }),
    );
  });

  it("dedupes duplicate event IDs", async () => {
    mocks.chatMetricCreate.mockRejectedValue({
      code: "P2002",
      meta: { target: ["eventId"] },
    });

    const result = await ingestPerformanceMetric(AUTH, {
      eventId: "evt-dup",
      version: 1,
      name: "INP",
      value: 120,
      metricId: "metric-inp-1",
      rating: "good",
      routeTemplate: "/ai",
      surface: "ai",
      projectId: null,
      clientTimestamp: "2026-03-05T10:00:00.000Z",
      dimensions: {
        viewport: "phone",
        network: "3g",
        online: true,
        synthetic: false,
        appVersion: null,
        commitSha: null,
      },
    });

    expect(result).toEqual({ deduped: true, id: null });
  });

  it("rejects payloads with non-allowlisted fields", async () => {
    await expect(
      ingestPerformanceMetric(AUTH, {
        eventId: "evt-unsafe",
        version: 1,
        name: "CLS",
        value: 0.05,
        metricId: "metric-cls-1",
        rating: "good",
        routeTemplate: "/",
        surface: "home",
        projectId: null,
        clientTimestamp: "2026-03-05T10:00:00.000Z",
        dimensions: {
          viewport: "desktop",
          network: "4g",
          online: true,
          synthetic: false,
          appVersion: "0.1.0",
          commitSha: "abc123",
          promptText: "never allowed",
        },
      }),
    ).rejects.toThrow();
  });

  it("rejects unsupported route templates", async () => {
    await expect(
      ingestPerformanceMetric(AUTH, {
        eventId: "evt-route",
        version: 1,
        name: "TTFB",
        value: 250,
        metricId: "metric-ttfb-1",
        rating: null,
        routeTemplate: "/project/123/private",
        surface: "project_conversation",
        projectId: "project-1",
        clientTimestamp: "2026-03-05T10:00:00.000Z",
        dimensions: {
          viewport: "desktop",
          network: "4g",
          online: true,
          synthetic: false,
          appVersion: null,
          commitSha: null,
        },
      }),
    ).rejects.toThrow();
  });
});
