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

const { ingestReliabilityMetric } = await import("@/lib/server/reliability-metrics");

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
  clientIp: "203.0.113.11",
};

describe("reliability-metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("accepts compact viewport telemetry and scopes project access", async () => {
    mocks.chatMetricCreate.mockResolvedValue({ id: "metric-1" });

    const result = await ingestReliabilityMetric(AUTH, {
      eventId: "evt-1",
      version: 1,
      type: "reliability.v1.stream.started",
      surface: "project",
      projectId: "project-1",
      conversationId: "conv-1",
      runId: "run-1",
      clientTimestamp: "2026-03-08T10:00:00.000Z",
      dimensions: {
        viewport: "compact",
        network: "online",
        flags: {
          scrollOwnershipA1: null,
          streamReliabilityA2: null,
          mobileScrollLockV2: true,
        },
      },
      payload: {
        requestKey: "req-1",
        phase: "project_stream",
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
          type: "reliability.v1.stream.started",
          surface: "project",
          userId: "user-1",
          workspaceId: "ws-1",
          projectId: "project-1",
        }),
      }),
    );
  });

  it("accepts responsive route-ready telemetry for auth without project access", async () => {
    mocks.chatMetricCreate.mockResolvedValue({ id: "metric-2" });

    const result = await ingestReliabilityMetric(ANONYMOUS, {
      eventId: "evt-2",
      version: 1,
      type: "reliability.v1.route.ready",
      surface: "auth",
      clientTimestamp: "2026-03-09T08:00:00.000Z",
      dimensions: {
        viewport: "phone",
        network: "online",
        flags: {
          scrollOwnershipA1: null,
          streamReliabilityA2: null,
          mobileScrollLockV2: true,
        },
      },
      payload: {
        routeTemplate: "/login",
        state: "signin",
        layoutMode: null,
      },
    });

    expect(result).toEqual({ deduped: false, id: "metric-2" });
    expect(mocks.assertProjectAccess).not.toHaveBeenCalled();
    expect(mocks.chatMetricCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "reliability.v1.route.ready",
          surface: "auth",
          userId: null,
          workspaceId: null,
          projectId: null,
        }),
      }),
    );
  });

  it("accepts responsive route-flow telemetry for allowed home flows", async () => {
    mocks.chatMetricCreate.mockResolvedValue({ id: "metric-3" });

    const result = await ingestReliabilityMetric(ANONYMOUS, {
      eventId: "evt-3",
      version: 1,
      type: "reliability.v1.route.flow_completed",
      surface: "home",
      clientTimestamp: "2026-03-09T08:00:00.000Z",
      dimensions: {
        viewport: "phone",
        network: "online",
        flags: {
          scrollOwnershipA1: null,
          streamReliabilityA2: null,
          mobileScrollLockV2: true,
        },
      },
      payload: {
        routeTemplate: "/",
        flow: "enter_workspace",
        layoutMode: null,
      },
    });

    expect(result).toEqual({ deduped: false, id: "metric-3" });
    expect(mocks.assertProjectAccess).not.toHaveBeenCalled();
  });

  it("rejects anonymous telemetry with scoped identifiers", async () => {
    await expect(
      ingestReliabilityMetric(ANONYMOUS, {
        eventId: "evt-4",
        version: 1,
        type: "reliability.v1.route.ready",
        surface: "auth",
        projectId: "project-1",
        clientTimestamp: "2026-03-09T08:00:00.000Z",
        dimensions: {
          viewport: "phone",
          network: "online",
          flags: {
            scrollOwnershipA1: null,
            streamReliabilityA2: null,
            mobileScrollLockV2: true,
          },
        },
        payload: {
          routeTemplate: "/login",
          state: "signin",
          layoutMode: null,
        },
      }),
    ).rejects.toBeInstanceOf(TelemetryAnonymousNotAllowedError);
    expect(mocks.chatMetricCreate).not.toHaveBeenCalled();
  });

  it("rejects anonymous stream telemetry", async () => {
    await expect(
      ingestReliabilityMetric(ANONYMOUS, {
        eventId: "evt-5",
        version: 1,
        type: "reliability.v1.stream.started",
        surface: "home",
        clientTimestamp: "2026-03-09T08:00:00.000Z",
        dimensions: {
          viewport: "phone",
          network: "online",
          flags: {
            scrollOwnershipA1: null,
            streamReliabilityA2: null,
            mobileScrollLockV2: true,
          },
        },
        payload: {
          requestKey: "request-1",
          phase: "send",
        },
      }),
    ).rejects.toBeInstanceOf(TelemetryAnonymousNotAllowedError);
  });
});
