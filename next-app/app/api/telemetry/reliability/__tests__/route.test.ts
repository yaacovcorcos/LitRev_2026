import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  ingestReliabilityMetric: vi.fn(),
}));

vi.mock("@/lib/server/auth/session", () => ({
  requireApiSession: (...args: unknown[]) => mocks.requireApiSession(...args),
}));

vi.mock("@/lib/server/reliability-metrics", () => ({
  ingestReliabilityMetric: (...args: unknown[]) => mocks.ingestReliabilityMetric(...args),
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
  const authContext = {
    userId: "user-1",
    workspaceId: "workspace-1",
  };

  beforeEach(() => {
    mocks.requireApiSession.mockReset();
    mocks.ingestReliabilityMetric.mockReset();
    mocks.requireApiSession.mockResolvedValue({
      ok: true,
      context: authContext,
    });
  });

  it("returns 202 for accepted metric payloads", async () => {
    mocks.ingestReliabilityMetric.mockResolvedValue({
      deduped: false,
      id: "metric-1",
    });

    const response = await POST(buildRequest({
      eventId: "e1",
      version: 1,
      type: "reliability.v1.stream.started",
      surface: "ai",
      payload: { requestKey: "rk", phase: "send" },
    }) as never);

    expect(response.status).toBe(202);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(mocks.ingestReliabilityMetric).toHaveBeenCalledWith(authContext, expect.any(Object));
  });

  it("returns 400 for invalid telemetry payloads", async () => {
    mocks.ingestReliabilityMetric.mockRejectedValue(new z.ZodError([]));

    const response = await POST(buildRequest({}) as never);
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toBe("Invalid telemetry payload");
  });
});
