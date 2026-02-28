import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/ledger-utils", () => ({
  computeStudyLedger: vi.fn(),
  computeLedgerCounts: vi.fn(),
}));

const { computeStudyLedger, computeLedgerCounts } = await import("@/lib/server/ledger-utils");
const mockComputeStudyLedger = vi.mocked(computeStudyLedger);
const mockComputeLedgerCounts = vi.mocked(computeLedgerCounts);

const { readLedgerTool } = await import("@/lib/server/ai/tools/read-ledger");

describe("readLedgerTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns counts + studies by default", async () => {
    mockComputeStudyLedger.mockResolvedValueOnce({
      counts: { total: 2, included: 1, excluded: 0, maybe: 1, unscreened: 0 },
      list: [
        { id: "s1", title: "Trial A", authors: "Smith", year: 2020, status: "keep" },
        { id: "s2", title: "Trial B", authors: "Jones", year: 2021, status: "maybe" },
      ],
      truncated: false,
      hasRecommendationSeeds: true,
    });

    const result = await readLedgerTool.execute({}, { projectId: "p1" });

    expect(result.error).toBeUndefined();
    expect(mockComputeStudyLedger).toHaveBeenCalledWith("p1");
    const payload = result.result as { studies: Array<{ id: string }>; hasRecommendationSeeds: boolean; ledgerContext: string };
    expect(payload.studies).toHaveLength(2);
    expect(payload.hasRecommendationSeeds).toBe(true);
    expect(payload.ledgerContext).toContain("[LEDGER_CONTEXT]");
  });

  it("returns counts only when includeStudies=false", async () => {
    mockComputeLedgerCounts.mockResolvedValueOnce({
      total: 5,
      included: 2,
      excluded: 1,
      maybe: 1,
      unscreened: 1,
    });

    const result = await readLedgerTool.execute({ includeStudies: false }, { projectId: "p1" });

    expect(result.error).toBeUndefined();
    expect(mockComputeStudyLedger).not.toHaveBeenCalled();
    expect(mockComputeLedgerCounts).toHaveBeenCalledWith("p1");
    const payload = result.result as { studies: unknown[] };
    expect(payload.studies).toHaveLength(0);
  });

  it("errors without project context", async () => {
    const result = await readLedgerTool.execute({});
    expect(result.error).toContain("No project context available");
  });
});
