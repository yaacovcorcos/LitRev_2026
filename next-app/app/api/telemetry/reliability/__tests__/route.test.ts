import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  TelemetryAnonymousNotAllowedError,
  TelemetryAnonymousRateLimitedError,
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

  it("returns 400 for invalid telemetry payloads", async () => {
    mocks.ingestReliabilityMetric.mockRejectedValue(new z.ZodError([]));

    const response = await POST(buildRequest({}) as never);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid telemetry payload",
    });
  });
});
