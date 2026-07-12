import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateCriteriaTool } from "@/lib/server/ai/tools/update-criteria";

const mockProtocolFindUnique = vi.fn();

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    protocol: {
      findUnique: (...args: unknown[]) => mockProtocolFindUnique(...args),
    },
  },
}));

function makeProtocolData(data: Record<string, unknown>) {
  return { data };
}

describe("updateCriteriaTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProtocolFindUnique.mockResolvedValue(
      makeProtocolData({
        eligibility: {
          inclusion: ["Adults over 18"],
          exclusion: ["Case reports"],
        },
      })
    );
  });

  it("requires project context", async () => {
    const result = await updateCriteriaTool.execute({ action: "add", type: "inclusion", criterion: "RCT" });
    expect(result.error).toContain("No project context available");
  });

  it("fails closed when protocol is missing rather than creating state during proposal generation", async () => {
    mockProtocolFindUnique.mockResolvedValueOnce(null);
    const result = await updateCriteriaTool.execute(
      { action: "add", type: "inclusion", criterion: "RCT" },
      { projectId: "proj-1" }
    );
    expect(result.error).toContain("No protocol exists");
  });

  it("returns a reviewable full criteria payload without persisting protocol", async () => {
    const result = await updateCriteriaTool.execute(
      { action: "add", type: "inclusion", criterion: " Randomized controlled trials " },
      { projectId: "proj-1" }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      inclusion: ["Adults over 18", "Randomized controlled trials"],
      exclusion: ["Case reports"],
      rationale: "Add inclusion criterion: Randomized controlled trials",
      mutation: { action: "add", type: "inclusion", criterion: "Randomized controlled trials" },
    });
    expect(mockProtocolFindUnique).toHaveBeenCalledWith({
      where: { projectId: "proj-1" },
      select: { data: true },
    });
  });

  it("returns a no-op error for duplicate add so no review artifact is created", async () => {
    const result = await updateCriteriaTool.execute(
      { action: "add", type: "inclusion", criterion: "adults over 18" },
      { projectId: "proj-1" }
    );

    expect(result.error).toContain("already exists");
    expect(result.result).toBeNull();
  });

  it("removes an existing criterion", async () => {
    const result = await updateCriteriaTool.execute(
      { action: "remove", type: "exclusion", criterion: "case reports" },
      { projectId: "proj-1" }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      inclusion: ["Adults over 18"],
      exclusion: [],
      rationale: "Remove exclusion criterion: case reports",
      mutation: { action: "remove", type: "exclusion", criterion: "Case reports" },
    });
  });

  it("removes criteria using fuzzy unicode/whitespace matching fallback", async () => {
    mockProtocolFindUnique.mockResolvedValueOnce(
      makeProtocolData({
        eligibility: {
          inclusion: ["Adults\u00A0over\u00A018\u2014years"],
          exclusion: [],
        },
      })
    );

    const result = await updateCriteriaTool.execute(
      { action: "remove", type: "inclusion", criterion: "Adults over 18-years" },
      { projectId: "proj-1" }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      inclusion: [],
      exclusion: [],
      rationale: "Remove inclusion criterion: Adults over 18-years",
      mutation: { action: "remove", type: "inclusion", criterion: "Adults\u00A0over\u00A018\u2014years" },
    });
  });

  it("returns error when removing a missing criterion", async () => {
    const result = await updateCriteriaTool.execute(
      { action: "remove", type: "inclusion", criterion: "Children" },
      { projectId: "proj-1" }
    );

    expect(result.error).toContain("Criterion not found");
  });

  it("removes criterion with case-insensitive fuzzy fallback", async () => {
    mockProtocolFindUnique.mockResolvedValueOnce(
      makeProtocolData({
        eligibility: {
          inclusion: ["Adults Over 18 Years"],
          exclusion: [],
        },
      })
    );

    const result = await updateCriteriaTool.execute(
      { action: "remove", type: "inclusion", criterion: "ADULTS OVER 18 YEARS" },
      { projectId: "proj-1" }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      inclusion: [],
      exclusion: [],
      rationale: "Remove inclusion criterion: ADULTS OVER 18 YEARS",
      mutation: { action: "remove", type: "inclusion", criterion: "Adults Over 18 Years" },
    });
  });
});
