import { describe, expect, it, vi } from "vitest";
import {
  createIdempotencyMiddleware,
  executeWithToolMiddleware,
  isIdempotencyReplayResult,
  type ToolExecutionRequest,
  type ToolMiddleware,
} from "@/lib/server/ai/tool-middleware";
import type {
  ToolIdempotencyReservationInput,
  ToolIdempotencyStore,
} from "@/lib/server/ai/tool-idempotency-store";
import type { ToolResult } from "@/types/ai";

function createFakeIdempotencyStore(): ToolIdempotencyStore {
  const records = new Map<string, {
    id: string;
    status: "running" | "completed";
    result?: ToolResult;
  }>();
  let nextId = 1;
  const keyFor = (input: ToolIdempotencyReservationInput) => `${input.scopeKey}:${input.toolName}:${input.fingerprint}`;

  const reserve = vi.fn<ToolIdempotencyStore["reserve"]>(async (input) => {
    const key = keyFor(input);
    const existing = records.get(key);
    if (existing?.status === "completed" && existing.result) {
      return { status: "replay", result: existing.result };
    }
    if (existing) {
      return { status: "in_flight", reservationId: existing.id };
    }
    const id = `receipt-${nextId++}`;
    records.set(key, { id, status: "running" });
    return { status: "reserved", reservationId: id };
  });

  const complete = vi.fn<ToolIdempotencyStore["complete"]>(async (input) => {
    const key = keyFor(input);
    records.set(key, {
      id: input.reservationId ?? `receipt-${nextId++}`,
      status: "completed",
      result: { ...input.result, callId: "" },
    });
  });

  const release = vi.fn<ToolIdempotencyStore["release"]>(async (input) => {
    const key = `${input.scopeKey}:${input.toolName}:${input.fingerprint}`;
    records.delete(key);
  });

  return { reserve, complete, release };
}

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

  it("replays cached result for duplicate protected mutation calls", async () => {
    const executor = vi.fn(async (request: ToolExecutionRequest) => ({
      callId: request.callId,
      result: { added: 1 },
    }));
    const middleware = createIdempotencyMiddleware({
      ttlMs: 60_000,
      toolNames: ["add_to_ledger"],
      store: null,
    });

    const first = await executeWithToolMiddleware(
      {
        name: "add_to_ledger",
        args: { results: [{ title: "Study A", authors: "A", year: 2024 }] },
        callId: "c1",
        context: { projectId: "p1", userId: "u1", runId: "r1" },
      },
      [middleware],
      executor
    );
    const second = await executeWithToolMiddleware(
      {
        name: "add_to_ledger",
        args: { results: [{ title: "Study A", authors: "A", year: 2024 }] },
        callId: "c2",
        context: { projectId: "p1", userId: "u1", runId: "r1" },
      },
      [middleware],
      executor
    );

    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    expect(executor).toHaveBeenCalledTimes(1);
    expect(second.callId).toBe("c2");
    expect(second.result).toEqual(first.result);
  });

  it("does not replay non-protected tools", async () => {
    const executor = vi.fn(async (request: ToolExecutionRequest) => ({
      callId: request.callId,
      result: { query: request.args.query },
    }));
    const middleware = createIdempotencyMiddleware({
      ttlMs: 60_000,
      toolNames: ["add_to_ledger"],
      store: null,
    });

    await executeWithToolMiddleware(
      { name: "inspect_memory", args: { query: "q1" }, callId: "c1", context: { userId: "u1", runId: "r1" } },
      [middleware],
      executor
    );
    await executeWithToolMiddleware(
      { name: "inspect_memory", args: { query: "q1" }, callId: "c2", context: { userId: "u1", runId: "r1" } },
      [middleware],
      executor
    );

    expect(executor).toHaveBeenCalledTimes(2);
  });

  it("keeps process-local idempotency coverage when no durable run lineage exists", async () => {
    const executor = vi.fn(async (request: ToolExecutionRequest) => ({
      callId: request.callId,
      result: { remembered: true },
    }));
    const store: ToolIdempotencyStore = {
      reserve: vi.fn<ToolIdempotencyStore["reserve"]>(async () => ({ status: "reserved", reservationId: "unused" })),
      complete: vi.fn(),
      release: vi.fn(),
    };
    const middleware = createIdempotencyMiddleware({
      toolNames: ["store_memory"],
      store,
    });

    await executeWithToolMiddleware(
      { name: "store_memory", args: { key: "tone", value: "concise" }, callId: "c1", context: { userId: "u1" } },
      [middleware],
      executor
    );
    const replay = await executeWithToolMiddleware(
      { name: "store_memory", args: { key: "tone", value: "concise" }, callId: "c2", context: { userId: "u1" } },
      [middleware],
      executor
    );

    expect(store.reserve).not.toHaveBeenCalled();
    expect(executor).toHaveBeenCalledTimes(1);
    expect(replay.result).toEqual({ remembered: true });
    expect(isIdempotencyReplayResult(replay)).toBe(true);
  });

  it("replays protected mutation calls across retry runs in the same lineage", async () => {
    const executor = vi.fn(async (request: ToolExecutionRequest) => ({
      callId: request.callId,
      result: { added: 1 },
    }));
    const store = createFakeIdempotencyStore();
    const middleware = createIdempotencyMiddleware({
      ttlMs: 60_000,
      toolNames: ["add_to_ledger"],
      store,
    });

    const first = await executeWithToolMiddleware(
      {
        name: "add_to_ledger",
        args: { results: [{ title: "Study A", authors: "A", year: 2024 }] },
        callId: "c1",
        context: { projectId: "p1", userId: "u1", runId: "r1", rootRunId: "root-1" },
      },
      [middleware],
      executor
    );
    const second = await executeWithToolMiddleware(
      {
        name: "add_to_ledger",
        args: { results: [{ title: "Study A", authors: "A", year: 2024 }] },
        callId: "c2",
        context: { projectId: "p1", userId: "u1", runId: "r2", rootRunId: "root-1" },
      },
      [middleware],
      executor
    );

    expect(first.error).toBeUndefined();
    expect(second.error).toBeUndefined();
    expect(executor).toHaveBeenCalledTimes(1);
    expect(second.callId).toBe("c2");
    expect(second.result).toEqual(first.result);
    expect(isIdempotencyReplayResult(second)).toBe(true);
  });

  it("persists idempotency receipts beyond one middleware instance", async () => {
    const executor = vi.fn(async (request: ToolExecutionRequest) => ({
      callId: request.callId,
      result: { updated: true },
    }));
    const store = createFakeIdempotencyStore();
    const firstMiddleware = createIdempotencyMiddleware({
      toolNames: ["update_study"],
      store,
    });
    const secondMiddleware = createIdempotencyMiddleware({
      toolNames: ["update_study"],
      store,
    });

    await executeWithToolMiddleware(
      {
        name: "update_study",
        args: { studyId: "s1", patch: { status: "included" } },
        callId: "c1",
        context: { projectId: "p1", userId: "u1", runId: "r1", rootRunId: "root-1" },
      },
      [firstMiddleware],
      executor
    );
    const replay = await executeWithToolMiddleware(
      {
        name: "update_study",
        args: { studyId: "s1", patch: { status: "included" } },
        callId: "c2",
        context: { projectId: "p1", userId: "u1", runId: "r2", rootRunId: "root-1" },
      },
      [secondMiddleware],
      executor
    );

    expect(executor).toHaveBeenCalledTimes(1);
    expect(replay.result).toEqual({ updated: true });
    expect(isIdempotencyReplayResult(replay)).toBe(true);
  });

  it("does not replay protected mutation calls across unrelated lineages", async () => {
    const executor = vi.fn(async (request: ToolExecutionRequest) => ({
      callId: request.callId,
      result: { added: 1 },
    }));
    const store = createFakeIdempotencyStore();
    const middleware = createIdempotencyMiddleware({
      toolNames: ["add_to_ledger"],
      store,
    });

    await executeWithToolMiddleware(
      {
        name: "add_to_ledger",
        args: { results: [{ title: "Study A", authors: "A", year: 2024 }] },
        callId: "c1",
        context: { projectId: "p1", userId: "u1", runId: "r1", rootRunId: "root-1" },
      },
      [middleware],
      executor
    );
    await executeWithToolMiddleware(
      {
        name: "add_to_ledger",
        args: { results: [{ title: "Study A", authors: "A", year: 2024 }] },
        callId: "c2",
        context: { projectId: "p1", userId: "u1", runId: "r2", rootRunId: "root-2" },
      },
      [middleware],
      executor
    );

    expect(executor).toHaveBeenCalledTimes(2);
  });

  it("blocks duplicate in-flight mutations instead of executing a second side effect", async () => {
    const executor = vi.fn(async (request: ToolExecutionRequest) => ({
      callId: request.callId,
      result: { added: 1 },
    }));
    const store: ToolIdempotencyStore = {
      reserve: vi.fn<ToolIdempotencyStore["reserve"]>(async () => ({ status: "in_flight", reservationId: "receipt-1" })),
      complete: vi.fn(),
      release: vi.fn(),
    };
    const middleware = createIdempotencyMiddleware({
      toolNames: ["add_to_ledger"],
      store,
    });

    const result = await executeWithToolMiddleware(
      {
        name: "add_to_ledger",
        args: { results: [{ title: "Study A", authors: "A", year: 2024 }] },
        callId: "c2",
        context: { projectId: "p1", userId: "u1", runId: "r2", rootRunId: "root-1" },
      },
      [middleware],
      executor
    );

    expect(executor).not.toHaveBeenCalled();
    expect(result.error).toContain("already running");
    expect(isIdempotencyReplayResult(result)).toBe(false);
  });

  it("releases a persistent reservation when the protected tool returns an error", async () => {
    const executor = vi.fn(async (request: ToolExecutionRequest) => ({
      callId: request.callId,
      result: null,
      error: "tool failed",
    }));
    const store = createFakeIdempotencyStore();
    const middleware = createIdempotencyMiddleware({
      toolNames: ["add_to_ledger"],
      store,
    });

    await executeWithToolMiddleware(
      {
        name: "add_to_ledger",
        args: { results: [{ title: "Study A", authors: "A", year: 2024 }] },
        callId: "c1",
        context: { projectId: "p1", userId: "u1", runId: "r1", rootRunId: "root-1" },
      },
      [middleware],
      executor
    );

    expect(store.reserve).toHaveBeenCalledTimes(1);
    expect(store.complete).not.toHaveBeenCalled();
    expect(store.release).toHaveBeenCalledTimes(1);
  });
});
