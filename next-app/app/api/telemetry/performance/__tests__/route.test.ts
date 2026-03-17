import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  TelemetryAnonymousNotAllowedError,
  TelemetryAnonymousRateLimitedError,
  TelemetryProjectAccessDeniedError,
} from "@/lib/server/telemetry-policy";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  resolveTelemetryApiActor: vi.fn(),
  ingestPerformanceMetric: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  requireApiSession: (...args: unknown[]) => mocks.requireApiSession(...args),
  resolveTelemetryApiActor: (...args: unknown[]) =>
    mocks.resolveTelemetryApiActor(...args),
}));

vi.mock("@/lib/server/performance-metrics", () => ({
  ingestPerformanceMetric: (...args: unknown[]) =>
    mocks.ingestPerformanceMetric(...args),
}));

const { POST } = await import("@/app/api/telemetry/performance/route");

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/telemetry/performance", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/telemetry/performance", () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  const originalE2ETestMode = process.env.E2E_TEST_MODE;
  const anonymousActor = {
    kind: "anonymous" as const,
    clientIp: "203.0.113.55",
  };
  const authActor = {
    kind: "authenticated" as const,
    clientIp: "203.0.113.56",
    context: { userId: "user-1", workspaceId: "ws-1", role: "owner" },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    consoleErrorSpy.mockClear();
    consoleErrorSpy.mockImplementation(() => {});
    delete process.env.E2E_TEST_MODE;
    mocks.resolveTelemetryApiActor.mockResolvedValue(anonymousActor);
    mocks.ingestPerformanceMetric.mockResolvedValue({
      deduped: false,
      id: "metric-1",
    });
  });

  afterAll(() => {
    process.env.E2E_TEST_MODE = originalE2ETestMode;
    consoleErrorSpy.mockRestore();
  });

  it("returns 202 on anonymous home telemetry", async () => {
    const response = await POST(
      makeRequest({
        eventId: "value",
        version: 1,
        name: "LCP",
        value: 123,
        metricId: "metric-1",
        rating: "good",
        routeTemplate: "/",
        surface: "home",
        projectId: null,
        clientTimestamp: "2026-03-17T12:00:00.000Z",
        dimensions: {
          viewport: "phone",
          network: "4g",
          online: true,
          synthetic: false,
          appVersion: null,
          commitSha: null,
        },
      }) as never,
    );

    expect(response.status).toBe(202);
  });

  it("returns 202 on authenticated scoped telemetry", async () => {
    mocks.resolveTelemetryApiActor.mockResolvedValue(authActor);

    const response = await POST(
      makeRequest({
        eventId: "value-2",
        version: 1,
        name: "INP",
        value: 150,
        metricId: "metric-2",
        rating: "good",
        routeTemplate: "/project/[id]",
        surface: "project_conversation",
        projectId: "project-1",
        clientTimestamp: "2026-03-17T12:00:00.000Z",
        dimensions: {
          viewport: "desktop",
          network: "4g",
          online: true,
          synthetic: false,
          appVersion: null,
          commitSha: null,
        },
      }) as never,
    );

    expect(response.status).toBe(202);
    expect(mocks.ingestPerformanceMetric).toHaveBeenCalledWith(
      authActor,
      expect.any(Object),
    );
  });

  it("returns 403 for anonymous telemetry that fails policy", async () => {
    mocks.ingestPerformanceMetric.mockRejectedValue(
      new TelemetryAnonymousNotAllowedError(),
    );

    const response = await POST(makeRequest({ eventId: "value" }) as never);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Anonymous telemetry is not allowed for this payload",
    });
    expect(response.status).toBe(403);
  });

  it("returns 403 for project access denials", async () => {
    mocks.resolveTelemetryApiActor.mockResolvedValue(authActor);
    mocks.ingestPerformanceMetric.mockRejectedValue(
      new TelemetryProjectAccessDeniedError(),
    );

    const response = await POST(makeRequest({ eventId: "value" }) as never);
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Project not found or access denied",
    });
  });

  it("returns 429 for anonymous rate limiting", async () => {
    mocks.ingestPerformanceMetric.mockRejectedValue(
      new TelemetryAnonymousRateLimitedError(12),
    );

    const response = await POST(makeRequest({ eventId: "value" }) as never);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("12");
  });

  it("returns 400 for invalid telemetry payloads", async () => {
    mocks.ingestPerformanceMetric.mockRejectedValue(new z.ZodError([]));

    const response = await POST(makeRequest({}) as never);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Invalid telemetry payload");
    expect(Array.isArray(json.issues)).toBe(true);
  });

  it("returns 400 for invalid JSON bodies", async () => {
    const request = {
      headers: new Headers({ "Content-Type": "application/json" }),
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected end of JSON input")),
    } as unknown as Request;

    const response = await POST(request as never);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({
      success: false,
      error: "Invalid JSON payload",
    });
  });

  it("returns opaque 500 errors and logs details server-side", async () => {
    mocks.ingestPerformanceMetric.mockRejectedValue(
      new Error("internal stack trace: secret"),
    );

    const response = await POST(makeRequest({ eventId: "value" }) as never);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({
      success: false,
      error: "Telemetry ingestion failed",
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it("suppresses telemetry error logging in explicit E2E mode", async () => {
    process.env.E2E_TEST_MODE = "1";
    mocks.ingestPerformanceMetric.mockRejectedValue(new Error("aborted"));

    const response = await POST(makeRequest({ eventId: "value" }) as never);
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({
      success: false,
      error: "Telemetry ingestion failed",
    });
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
