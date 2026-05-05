import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    toolIdempotencyRecord: {
      create: mocks.create,
      findUnique: mocks.findUnique,
      updateMany: mocks.updateMany,
      upsert: mocks.upsert,
      deleteMany: mocks.deleteMany,
    },
  },
}));

const { createPrismaToolIdempotencyStore } = await import("@/lib/server/ai/tool-idempotency-store");

describe("tool idempotency store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reserves a new mutating tool call by composite lineage key", async () => {
    mocks.create.mockResolvedValue({ id: "receipt-1" });
    const store = createPrismaToolIdempotencyStore();

    const result = await store.reserve({
      scopeKey: "root-1",
      toolName: "add_to_ledger",
      fingerprint: "fp",
      callId: "c1",
      runId: "run-1",
      projectId: "project-1",
      userId: "user-1",
      studyId: null,
    });

    expect(result).toEqual({ status: "reserved", reservationId: "receipt-1" });
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        scopeKey: "root-1",
        toolName: "add_to_ledger",
        fingerprint: "fp",
        status: "running",
        callId: "c1",
      }),
    }));
  });

  it("replays a completed receipt after a unique reservation collision", async () => {
    mocks.create.mockRejectedValue({ code: "P2002" });
    mocks.findUnique.mockResolvedValue({
      id: "receipt-1",
      status: "completed",
      result: { callId: "", result: { added: 1 } },
    });
    const store = createPrismaToolIdempotencyStore();

    const result = await store.reserve({
      scopeKey: "root-1",
      toolName: "add_to_ledger",
      fingerprint: "fp",
      callId: "c2",
    });

    expect(result).toEqual({
      status: "replay",
      result: { callId: "", result: { added: 1 } },
    });
    expect(mocks.findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        scopeKey_toolName_fingerprint: {
          scopeKey: "root-1",
          toolName: "add_to_ledger",
          fingerprint: "fp",
        },
      },
    }));
  });

  it("reports an unresolved in-flight receipt instead of allowing a second execution", async () => {
    mocks.create.mockRejectedValue({ code: "P2002" });
    mocks.findUnique.mockResolvedValue({
      id: "receipt-1",
      status: "running",
      result: null,
    });
    const store = createPrismaToolIdempotencyStore();

    const result = await store.reserve({
      scopeKey: "root-1",
      toolName: "add_to_ledger",
      fingerprint: "fp",
      callId: "c2",
    });

    expect(result).toEqual({ status: "in_flight", reservationId: "receipt-1" });
  });

  it("completes a reservation with a replay-safe callId-neutral result", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const store = createPrismaToolIdempotencyStore();

    await store.complete({
      scopeKey: "root-1",
      toolName: "add_to_ledger",
      fingerprint: "fp",
      callId: "c1",
      reservationId: "receipt-1",
      result: { callId: "c1", result: { added: 1 }, error: undefined },
    });

    expect(mocks.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "receipt-1", status: "running" },
      data: expect.objectContaining({
        status: "completed",
        result: { callId: "", result: { added: 1 } },
        completedAt: expect.any(Date),
      }),
    }));
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("upserts a completed receipt when the original reservation row is gone", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.upsert.mockResolvedValue({ id: "receipt-1" });
    const store = createPrismaToolIdempotencyStore();

    await store.complete({
      scopeKey: "root-1",
      toolName: "add_to_ledger",
      fingerprint: "fp",
      callId: "c1",
      reservationId: "receipt-1",
      result: { callId: "c1", result: { added: 1 } },
    });

    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        scopeKey_toolName_fingerprint: {
          scopeKey: "root-1",
          toolName: "add_to_ledger",
          fingerprint: "fp",
        },
      },
      update: expect.objectContaining({ status: "completed" }),
      create: expect.objectContaining({
        scopeKey: "root-1",
        toolName: "add_to_ledger",
        fingerprint: "fp",
        status: "completed",
      }),
    }));
  });

  it("releases an unresolved reservation after a tool-level error", async () => {
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    const store = createPrismaToolIdempotencyStore();

    await store.release({
      scopeKey: "root-1",
      toolName: "add_to_ledger",
      fingerprint: "fp",
      reservationId: "receipt-1",
    });

    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        id: "receipt-1",
        status: "running",
      },
    });
  });
});
