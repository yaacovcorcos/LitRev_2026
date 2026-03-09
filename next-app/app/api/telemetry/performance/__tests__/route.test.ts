import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  ingestPerformanceMetric: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  requireApiSession: (...args: unknown[]) => mocks.requireApiSession(...args),
}));

vi.mock("@/lib/server/performance-metrics", () => ({
  ingestPerformanceMetric: (...args: unknown[]) => mocks.ingestPerformanceMetric(...args),
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

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockReset();
    mocks.ingestPerformanceMetric.mockReset();
    consoleErrorSpy.mockClear();
    consoleErrorSpy.mockImplementation(() => {});
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
  });

  it("returns 202 on successful ingestion", async () => {
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      context: { userId: "user-1", workspaceId: "ws-1", role: "owner" },
    });
    mocks.ingestPerformanceMetric.mockResolvedValue({
      deduped: false,
      id: "metric-1",
    });

    const response = await POST(makeRequest({ eventId: "value" }) as never);
    const json = await response.json();

    expect(response.status).toBe(202);
    expect(json).toEqual({
      success: true,
      deduped: false,
      id: "metric-1",
    });
  });

  it("returns 400 for invalid telemetry payloads", async () => {
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      context: { userId: "user-1", workspaceId: "ws-1", role: "owner" },
    });
    mocks.ingestPerformanceMetric.mockRejectedValue(new z.ZodError([]));

    const response = await POST(makeRequest({}) as never);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error).toBe("Invalid telemetry payload");
    expect(Array.isArray(json.issues)).toBe(true);
  });

  it("returns 403 for project access denials", async () => {
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      context: { userId: "user-1", workspaceId: "ws-1", role: "owner" },
    });
    mocks.ingestPerformanceMetric.mockRejectedValue(
      new Error("Project not found or access denied."),
    );

    const response = await POST(makeRequest({ eventId: "value" }) as never);
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toEqual({
      success: false,
      error: "Project not found or access denied",
    });
  });

  it("returns 400 for invalid JSON bodies", async () => {
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      context: { userId: "user-1", workspaceId: "ws-1", role: "owner" },
    });

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
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      context: { userId: "user-1", workspaceId: "ws-1", role: "owner" },
    });
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
});
