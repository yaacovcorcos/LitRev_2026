import { afterEach, describe, expect, it, vi } from "vitest";

import { cancelAgentRun, requestAgentRunCancellation } from "@/lib/ai/run-cancel-client";

describe("run cancel client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not call the cancel endpoint without a run id", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(cancelAgentRun("   ")).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the authenticated cancel endpoint with an encoded run id", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(cancelAgentRun("run/id 1")).resolves.toBe("cancelled");

    expect(fetchMock).toHaveBeenCalledWith("/api/ai/runs/run%2Fid%201/cancel", { method: "POST" });
  });

  it("normalizes expected non-success states", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 404 }))
      .mockResolvedValueOnce(new Response("{}", { status: 409 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(cancelAgentRun("missing-run")).resolves.toBe("not_found");
    await expect(cancelAgentRun("raced-run")).resolves.toBe("conflict");
  });

  it("throws on unexpected cancel endpoint failure", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 500 })));

    await expect(cancelAgentRun("run-1")).rejects.toThrow("HTTP 500");
  });

  it("suppresses fire-and-forget cancellation failures", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    });
    vi.stubGlobal("fetch", fetchMock);

    requestAgentRunCancellation("run-1");
    await Promise.resolve();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
