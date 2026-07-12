import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  TelemetryAnonymousNotAllowedError,
  TelemetryAnonymousRateLimitedError,
  TelemetryProjectAccessDeniedError,
} from "@/lib/server/telemetry-policy";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  resolveTelemetryApiActor: vi.fn(),
  ingestReliabilityMetric: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  requireApiSession: (...args: unknown[]) => mocks.requireApiSession(...args),
  resolveTelemetryApiActor: (...args: unknown[]) =>
    mocks.resolveTelemetryApiActor(...args),
}));

vi.mock("@/lib/server/reliability-metrics", () => ({
  ingestReliabilityMetric: (...args: unknown[]) =>
    mocks.ingestReliabilityMetric(...args),
}));

const { POST } = await import("@/app/api/telemetry/reliability/route");

function buildRequest(body: unknown): Request {
  return new Request("http://localhost/api/telemetry/reliability", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const COMMON_BODY = {
  clientTimestamp: "2026-07-12T09:30:00.000Z",
  dimensions: {
    viewport: "desktop",
    network: "online",
    flags: {
      scrollOwnershipA1: true,
      streamReliabilityA2: null,
      mobileScrollLockV2: false,
    },
  },
} as const;

describe("POST /api/telemetry/reliability", () => {
  const authActor = {
    kind: "authenticated" as const,
    clientIp: "203.0.113.5",
    context: {
      userId: "user-1",
      workspaceId: "workspace-1",
      role: "owner",
    },
  };

  const anonymousActor = {
    kind: "anonymous" as const,
    clientIp: "203.0.113.8",
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveTelemetryApiActor.mockResolvedValue(anonymousActor);
    mocks.ingestReliabilityMetric.mockResolvedValue({
      deduped: false,
      id: "metric-1",
    });
  });

  it("accepts anonymous auth route-ready telemetry for /login", async () => {
    const response = await POST(
      buildRequest({
        ...COMMON_BODY,
        eventId: "e1",
        version: 1,
        type: "reliability.v1.route.ready",
        surface: "auth",
        payload: {
          routeTemplate: "/login",
          state: "signin",
          layoutMode: null,
        },
      }) as never,
    );

    expect(response.status).toBe(202);
    expect(mocks.ingestReliabilityMetric).toHaveBeenCalledWith(
      anonymousActor,
      expect.any(Object),
    );
  });

  it("accepts anonymous home route-flow telemetry for allowed flows", async () => {
    const response = await POST(
      buildRequest({
        ...COMMON_BODY,
        eventId: "e2",
        version: 1,
        type: "reliability.v1.route.flow_completed",
        surface: "home",
        payload: {
          routeTemplate: "/",
          flow: "create_project",
          layoutMode: null,
        },
      }) as never,
    );

    expect(response.status).toBe(202);
  });

  it("returns 403 for anonymous telemetry that fails policy", async () => {
    mocks.ingestReliabilityMetric.mockRejectedValue(
      new TelemetryAnonymousNotAllowedError(),
    );

    const response = await POST(
      buildRequest({
        ...COMMON_BODY,
        eventId: "e3",
        version: 1,
        type: "reliability.v1.stream.started",
        surface: "home",
        payload: { requestKey: "rk", phase: "send" },
      }) as never,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Anonymous telemetry is not allowed for this payload",
    });
  });

  it("returns 429 for anonymous telemetry rate limiting", async () => {
    mocks.ingestReliabilityMetric.mockRejectedValue(
      new TelemetryAnonymousRateLimitedError(42),
    );

    const response = await POST(
      buildRequest({
        ...COMMON_BODY,
        eventId: "e4",
        version: 1,
        type: "reliability.v1.route.ready",
        surface: "auth",
        payload: {
          routeTemplate: "/signup",
          state: "signup",
          layoutMode: null,
        },
      }) as never,
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
  });

  it("accepts authenticated scoped reliability metrics", async () => {
    mocks.resolveTelemetryApiActor.mockResolvedValue(authActor);

    const response = await POST(
      buildRequest({
        ...COMMON_BODY,
        eventId: "e5",
        version: 1,
        type: "reliability.v1.stream.started",
        surface: "project",
        projectId: "project-1",
        conversationId: "conv-1",
        runId: "run-1",
        payload: { requestKey: "rk", phase: "project_stream" },
      }) as never,
    );

    expect(response.status).toBe(202);
    expect(mocks.ingestReliabilityMetric).toHaveBeenCalledWith(
      authActor,
      expect.any(Object),
    );
  });

  it.each([
    "cross-user identifiers",
    "mismatched run-conversation-project identifiers",
  ])("returns 403 for authenticated %s", async () => {
    mocks.resolveTelemetryApiActor.mockResolvedValue(authActor);
    mocks.ingestReliabilityMetric.mockRejectedValue(
      new TelemetryProjectAccessDeniedError(),
    );

    const response = await POST(
      buildRequest({
        ...COMMON_BODY,
        eventId: "event-rejected-attribution",
        version: 1,
        type: "reliability.v1.stream.started",
        surface: "project",
        projectId: "project-1",
        conversationId: "conv-foreign",
        runId: "run-foreign",
        payload: { requestKey: "request-rejected", phase: "project_stream" },
      }) as never,
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Project not found or access denied",
    });
  });

  it("accepts authenticated dead-scroll incidents for server-authoritative measurement", async () => {
    mocks.resolveTelemetryApiActor.mockResolvedValue(authActor);

    const body = {
      ...COMMON_BODY,
      eventId: "e6",
      version: 1,
      type: "reliability.v1.shell.dead_scroll_detected",
      surface: "shell",
      projectId: "project-1",
      payload: {
        sessionId: "shell-session-1",
        input: "wheel",
        blockedDurationMs: 2_100,
        shellMode: "view",
      },
    };

    const response = await POST(buildRequest(body) as never);

    expect(response.status).toBe(202);
    expect(mocks.ingestReliabilityMetric).toHaveBeenCalledWith(authActor, body);
  });

  it("returns 400 for invalid telemetry payloads", async () => {
    mocks.ingestReliabilityMetric.mockRejectedValue(new z.ZodError([]));

    const response = await POST(buildRequest({}) as never);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid telemetry payload",
    });
  });

  it.each(["stale", "future"])("returns 400 for %s client timestamps", async () => {
    mocks.resolveTelemetryApiActor.mockResolvedValue(authActor);
    mocks.ingestReliabilityMetric.mockRejectedValue(new z.ZodError([]));

    const response = await POST(
      buildRequest({
        ...COMMON_BODY,
        eventId: "event-invalid-timestamp",
        version: 1,
        type: "reliability.v1.stream.started",
        surface: "project",
        projectId: "project-1",
        payload: { requestKey: "request-invalid-timestamp", phase: "project_stream" },
      }) as never,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      error: "Invalid telemetry payload",
    });
  });
});
