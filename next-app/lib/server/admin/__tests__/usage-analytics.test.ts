import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  aggregate: vi.fn(),
  groupBy: vi.fn(),
  count: vi.fn(),
  queryRaw: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    aIUsage: {
      aggregate: mocks.aggregate,
      groupBy: mocks.groupBy,
      count: mocks.count,
    },
    $queryRaw: mocks.queryRaw,
  },
}));

const { getAdminUsageAnalytics } = await import("@/lib/server/admin/usage-analytics");

describe("getAdminUsageAnalytics", () => {
  beforeEach(() => {
    mocks.aggregate.mockReset();
    mocks.groupBy.mockReset();
    mocks.count.mockReset();
    mocks.queryRaw.mockReset();
  });

  it("returns aggregated usage with legacy/attributed split", async () => {
    mocks.aggregate.mockResolvedValue({
      _count: { _all: 20 },
      _sum: { inputTokens: 1200, outputTokens: 300 },
    });

    mocks.groupBy
      .mockResolvedValueOnce([
        {
          source: "project_copilot",
          _count: { _all: 12 },
          _sum: { inputTokens: 800, outputTokens: 200 },
        },
        {
          source: "legacy_unknown",
          _count: { _all: 8 },
          _sum: { inputTokens: 400, outputTokens: 100 },
        },
      ])
      .mockResolvedValueOnce([
        {
          contextPage: "ledger",
          _count: { _all: 11 },
          _sum: { inputTokens: 700, outputTokens: 150 },
        },
        {
          contextPage: "legacy_unknown",
          _count: { _all: 9 },
          _sum: { inputTokens: 500, outputTokens: 150 },
        },
      ])
      .mockResolvedValueOnce([
        {
          model: "gpt-5-mini",
          _count: { _all: 15 },
          _sum: { inputTokens: 900, outputTokens: 220 },
        },
      ]);

    mocks.count.mockResolvedValue(8);

    mocks.queryRaw
      .mockResolvedValueOnce([{ count: BigInt(5) }])
      .mockResolvedValueOnce([{ count: BigInt(3) }])
      .mockResolvedValueOnce([
        {
          day: new Date("2026-03-02T00:00:00.000Z"),
          requests: BigInt(6),
          inputTokens: BigInt(360),
          outputTokens: BigInt(90),
        },
      ]);

    const result = await getAdminUsageAnalytics({ windowDays: 30 });

    expect(result.windowDays).toBe(30);
    expect(result.totals).toMatchObject({
      requests: 20,
      inputTokens: 1200,
      outputTokens: 300,
      totalTokens: 1500,
      uniqueUsers: 5,
      uniqueWorkspaces: 3,
      legacyRequests: 8,
      attributedRequests: 12,
    });

    expect(result.bySource[0]).toMatchObject({
      key: "project_copilot",
      requests: 12,
      totalTokens: 1000,
    });

    expect(result.byContextPage[1]).toMatchObject({
      key: "legacy_unknown",
      requests: 9,
      totalTokens: 650,
    });

    expect(result.byModel[0]).toMatchObject({
      key: "gpt-5-mini",
      requests: 15,
      totalTokens: 1120,
    });

    expect(result.byDay).toEqual([
      {
        day: "2026-03-02",
        requests: 6,
        inputTokens: 360,
        outputTokens: 90,
        totalTokens: 450,
      },
    ]);
  });

  it("returns empty-safe defaults", async () => {
    mocks.aggregate.mockResolvedValue({
      _count: { _all: 0 },
      _sum: { inputTokens: null, outputTokens: null },
    });
    mocks.groupBy.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    mocks.queryRaw
      .mockResolvedValueOnce([{ count: BigInt(0) }])
      .mockResolvedValueOnce([{ count: BigInt(0) }])
      .mockResolvedValueOnce([]);

    const result = await getAdminUsageAnalytics({ windowDays: 7 });

    expect(result.totals).toMatchObject({
      requests: 0,
      totalTokens: 0,
      uniqueUsers: 0,
      uniqueWorkspaces: 0,
      legacyRequests: 0,
      attributedRequests: 0,
    });
    expect(result.bySource).toEqual([]);
    expect(result.byContextPage).toEqual([]);
    expect(result.byModel).toEqual([]);
    expect(result.byDay).toEqual([]);
  });
});
