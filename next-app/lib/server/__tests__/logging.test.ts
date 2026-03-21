import { afterEach, describe, expect, it, vi } from "vitest";

import {
  logServerError,
  logServerInfo,
  logServerWarn,
} from "@/lib/server/logging";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("server logging helper", () => {
  it("emits the formatted message only when no context or error is present", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    logServerInfo("ai-service", "context assembled");

    expect(spy).toHaveBeenCalledWith("[ai-service] context assembled");
  });

  it("preserves structured context on warning logs", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});

    logServerWarn("planner", "plan validation failed", {
      stepCount: 0,
      runId: "run-1",
    });

    expect(spy).toHaveBeenCalledWith("[planner] plan validation failed", {
      stepCount: 0,
      runId: "run-1",
    });
  });

  it("normalizes Error values into structured metadata", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = Object.assign(new Error("database unavailable"), {
      code: "DB_DOWN",
    });

    logServerError("db", "query failed", { projectId: "p1" }, error);

    expect(spy).toHaveBeenCalledWith("[db] query failed", {
      projectId: "p1",
      error: {
        name: "Error",
        message: "database unavailable",
        code: "DB_DOWN",
      },
    });
  });

  it("preserves non-Error object payloads passed as the error value", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    logServerError("telemetry", "ingestion failed", undefined, {
      status: 503,
      retryable: true,
    });

    expect(spy).toHaveBeenCalledWith("[telemetry] ingestion failed", {
      status: 503,
      retryable: true,
    });
  });
});
