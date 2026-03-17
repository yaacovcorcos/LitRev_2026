import { beforeEach, describe, expect, it, vi } from "vitest";
import { TelemetryAnonymousNotAllowedError } from "@/lib/server/telemetry-policy";

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
  kind: "authenticated" as const,
  clientIp: "203.0.113.10",
  context: {
    userId: "user-1",
    workspaceId: "ws-1",
    role: "owner",
  },
};

const ANONYMOUS = {
  kind: "anonymous" as const,
  clientIp: "203.0.113.12",
};

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

  it("accepts anonymous home performance metrics with null identity", async () => {
    mocks.chatMetricCreate.mockResolvedValue({ id: "metric-2" });

    const result = await ingestPerformanceMetric(ANONYMOUS, {
      eventId: "evt-home",
      version: 1,
      name: "FCP",
      value: 420,
      metricId: "metric-fcp-1",
      rating: "good",
      routeTemplate: "/",
      surface: "home",
      projectId: null,
      clientTimestamp: "2026-03-05T10:00:00.000Z",
      dimensions: {
        viewport: "phone",
        network: "4g",
        online: true,
        synthetic: false,
        appVersion: null,
        commitSha: null,
      },
    });

    expect(result).toEqual({ deduped: false, id: "metric-2" });
    expect(mocks.assertProjectAccess).not.toHaveBeenCalled();
    expect(mocks.chatMetricCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: null,
          workspaceId: null,
          surface: "home",
        }),
      }),
    );
  });

  it("rejects anonymous performance metrics with mismatched route semantics", async () => {
    await expect(
      ingestPerformanceMetric(ANONYMOUS, {
        eventId: "evt-route-anon",
        version: 1,
        name: "TTFB",
        value: 250,
        metricId: "metric-ttfb-2",
        rating: null,
        routeTemplate: "/project/[id]",
        surface: "other",
        projectId: null,
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
    ).rejects.toBeInstanceOf(TelemetryAnonymousNotAllowedError);
    expect(mocks.chatMetricCreate).not.toHaveBeenCalled();
  });

  it("rejects anonymous performance metrics with project scope", async () => {
    await expect(
      ingestPerformanceMetric(ANONYMOUS, {
        eventId: "evt-project-anon",
        version: 1,
        name: "LCP",
        value: 250,
        metricId: "metric-lcp-2",
        rating: "good",
        routeTemplate: "/",
        surface: "home",
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
    ).rejects.toBeInstanceOf(TelemetryAnonymousNotAllowedError);
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
