import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    study: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

const { prisma } = await import("@/lib/server/prisma");
const mockFindMany = vi.mocked(prisma.study.findMany);
const mockCount = vi.mocked(prisma.study.count);

const { computeStudyLedger, computeLedgerCounts } = await import("@/lib/server/ledger-utils");

describe("ledger-utils", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes ledger snapshot counts, list, and recommendation seeds", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "s1",
        title: "Trial A",
        authors: "Smith",
        year: 2020,
        details: { triageDecision: "keep", doi: "10.1/abc" },
      },
      {
        id: "s2",
        title: "Trial B",
        authors: "Jones",
        year: 2021,
        details: { triageDecision: "exclude" },
      },
      {
        id: "s3",
        title: "Trial C",
        authors: "Lee",
        year: 2022,
        details: {},
      },
    ] as never);

    const snapshot = await computeStudyLedger("p1", { maxList: 50, listThreshold: 200 });

    expect(snapshot.counts).toEqual({
      total: 3,
      included: 1,
      excluded: 1,
      maybe: 0,
      unscreened: 1,
    });
    expect(snapshot.list).toHaveLength(3);
    expect(snapshot.list[0]?.status).toBe("keep");
    expect(snapshot.hasRecommendationSeeds).toBe(true);
    expect(snapshot.truncated).toBe(false);
  });

  it("omits list when total exceeds threshold", async () => {
    mockFindMany.mockResolvedValueOnce([
      {
        id: "s1",
        title: "Trial A",
        authors: "Smith",
        year: 2020,
        details: { triageDecision: "keep" },
      },
      {
        id: "s2",
        title: "Trial B",
        authors: "Jones",
        year: 2021,
        details: { triageDecision: "maybe" },
      },
    ] as never);

    const snapshot = await computeStudyLedger("p1", { maxList: 50, listThreshold: 1 });

    expect(snapshot.list).toHaveLength(0);
    expect(snapshot.truncated).toBe(true);
  });

  it("computes lightweight counts using count queries", async () => {
    mockCount
      .mockResolvedValueOnce(10 as never)
      .mockResolvedValueOnce(3 as never)
      .mockResolvedValueOnce(2 as never)
      .mockResolvedValueOnce(1 as never);

    const counts = await computeLedgerCounts("p1");

    expect(counts).toEqual({
      total: 10,
      included: 3,
      excluded: 2,
      maybe: 1,
      unscreened: 4,
    });
    expect(mockCount).toHaveBeenCalledTimes(4);
  });
});
