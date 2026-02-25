import { describe, expect, it, vi } from "vitest";
import {
  executeWithToolMiddleware,
  type ToolExecutionRequest,
  type ToolMiddleware,
} from "@/lib/server/ai/tool-middleware";

describe("tool middleware pipeline", () => {
  it("runs before hooks and allows request transformation", async () => {
    const executor = vi.fn(async (request: ToolExecutionRequest) => ({
      callId: request.callId,
      result: request.args,
    }));

    const middlewares: ToolMiddleware[] = [
      {
        name: "rewrite-query",
        before: (request) => ({
          ...request,
          args: { ...request.args, query: "expanded query" },
        }),
      },
    ];

    const result = await executeWithToolMiddleware(
      { name: "search_pubmed", args: { query: "q" }, callId: "c1" },
      middlewares,
      executor
    );

    expect(executor).toHaveBeenCalledTimes(1);
    expect(executor).toHaveBeenCalledWith({
      name: "search_pubmed",
      args: { query: "expanded query" },
      callId: "c1",
    });
    expect(result.error).toBeUndefined();
  });

  it("blocks execution when before hook returns null", async () => {
    const executor = vi.fn(async () => ({ callId: "c1", result: "ok" }));
    const middlewares: ToolMiddleware[] = [
      {
        name: "policy-gate",
        before: () => null,
      },
    ];

    const result = await executeWithToolMiddleware(
      { name: "delete_study", args: { studyId: "s1" }, callId: "c1" },
      middlewares,
      executor
    );

    expect(executor).not.toHaveBeenCalled();
    expect(result.result).toBeNull();
    expect(result.error).toContain("blocked");
  });

  it("runs after hooks and allows result transformation", async () => {
    const executor = vi.fn(async () => ({
      callId: "c1",
      result: { count: 3 },
    }));
    const middlewares: ToolMiddleware[] = [
      {
        name: "decorate-result",
        after: (_request, result) => ({
          ...result,
          result: { ...(result.result as Record<string, unknown>), source: "middleware" },
        }),
      },
    ];

    const result = await executeWithToolMiddleware(
      { name: "inspect_memory", args: {}, callId: "c1" },
      middlewares,
      executor
    );

    expect(result).toEqual({
      callId: "c1",
      result: { count: 3, source: "middleware" },
    });
  });

  it("continues when after hook throws (fail-open)", async () => {
    const executor = vi.fn(async () => ({ callId: "c1", result: "ok" }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const middlewares: ToolMiddleware[] = [
      {
        name: "broken-after",
        after: () => {
          throw new Error("boom");
        },
      },
    ];

    const result = await executeWithToolMiddleware(
      { name: "search_pubmed", args: {}, callId: "c1" },
      middlewares,
      executor
    );

    expect(result).toEqual({ callId: "c1", result: "ok" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("applies multiple middleware hooks in sequence", async () => {
    const executor = vi.fn(async (request: ToolExecutionRequest) => ({
      callId: request.callId,
      result: { ...(request.args as Record<string, unknown>) },
    }));

    const middlewares: ToolMiddleware[] = [
      {
        name: "before-1",
        before: (request) => ({
          ...request,
          args: { ...request.args, step1: true },
        }),
      },
      {
        name: "before-2",
        before: (request) => ({
          ...request,
          args: { ...request.args, step2: true },
        }),
      },
      {
        name: "after-1",
        after: (_request, result) => ({
          ...result,
          result: { ...(result.result as Record<string, unknown>), post1: true },
        }),
      },
      {
        name: "after-2",
        after: (_request, result) => ({
          ...result,
          result: { ...(result.result as Record<string, unknown>), post2: true },
        }),
      },
    ];

    const result = await executeWithToolMiddleware(
      { name: "inspect_memory", args: { seed: true }, callId: "c1" },
      middlewares,
      executor
    );

    expect(executor).toHaveBeenCalledWith({
      name: "inspect_memory",
      args: { seed: true, step1: true, step2: true },
      callId: "c1",
    });
    expect(result).toEqual({
      callId: "c1",
      result: { seed: true, step1: true, step2: true, post1: true, post2: true },
    });
  });

  it("stops middleware chain when first before hook blocks", async () => {
    const executor = vi.fn(async () => ({ callId: "c1", result: "ok" }));
    const secondBefore = vi.fn(() => undefined);
    const middlewares: ToolMiddleware[] = [
      {
        name: "first-blocker",
        before: () => null,
      },
      {
        name: "second-before",
        before: secondBefore,
      },
      {
        name: "after-never-runs",
        after: () => ({ callId: "c1", result: "never" }),
      },
    ];

    const result = await executeWithToolMiddleware(
      { name: "delete_study", args: { studyId: "s1" }, callId: "c1" },
      middlewares,
      executor
    );

    expect(secondBefore).not.toHaveBeenCalled();
    expect(executor).not.toHaveBeenCalled();
    expect(result.error).toContain("blocked");
  });

  it("returns structured error when executor throws", async () => {
    const executor = vi.fn(async () => {
      throw new Error("executor boom");
    });
    const middlewares: ToolMiddleware[] = [];

    const result = await executeWithToolMiddleware(
      { name: "search_pubmed", args: {}, callId: "c1" },
      middlewares,
      executor
    );

    expect(result).toEqual({
      callId: "c1",
      result: null,
      error: "Tool execution failed: executor boom",
    });
  });
});
