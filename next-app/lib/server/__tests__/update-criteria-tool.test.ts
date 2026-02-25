import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateCriteriaTool } from "@/lib/server/ai/tools/update-criteria";

const mockSyncProtocolToMemory = vi.fn();

vi.mock("@/lib/server/memory/protocol-sync", () => ({
  syncProtocolToMemory: (...args: unknown[]) => mockSyncProtocolToMemory(...args),
}));

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    protocol: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

const { prisma } = await import("@/lib/server/prisma");
const mockFindProtocol = vi.mocked(prisma.protocol.findUnique);
const mockUpdateProtocol = vi.mocked(prisma.protocol.update);

function makeProtocol(data: Record<string, unknown>) {
  return {
    id: "protocol-1",
    projectId: "proj-1",
    data,
  };
}

describe("updateCriteriaTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindProtocol.mockResolvedValue(
      makeProtocol({
        eligibility: {
          inclusion: ["Adults over 18"],
          exclusion: ["Case reports"],
        },
      }) as never
    );
    mockUpdateProtocol.mockResolvedValue({} as never);
    mockSyncProtocolToMemory.mockResolvedValue(undefined);
  });

  it("requires project context", async () => {
    const result = await updateCriteriaTool.execute({ action: "add", type: "inclusion", criterion: "RCT" });
    expect(result.error).toContain("No project context available");
  });

  it("returns error when protocol is missing", async () => {
    mockFindProtocol.mockResolvedValueOnce(null as never);
    const result = await updateCriteriaTool.execute(
      { action: "add", type: "inclusion", criterion: "RCT" },
      { projectId: "proj-1" }
    );
    expect(result.error).toContain("No protocol found");
  });

  it("adds a new criterion and persists protocol", async () => {
    const result = await updateCriteriaTool.execute(
      { action: "add", type: "inclusion", criterion: " Randomized controlled trials " },
      { projectId: "proj-1" }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      success: true,
      action: "add",
      type: "inclusion",
      criteria: ["Adults over 18", "Randomized controlled trials"],
    });
    expect(mockUpdateProtocol).toHaveBeenCalledTimes(1);
    expect(mockSyncProtocolToMemory).toHaveBeenCalledWith(
      "proj-1",
      expect.objectContaining({ eligibility: expect.any(Object) })
    );
  });

  it("treats duplicate add as idempotent", async () => {
    const result = await updateCriteriaTool.execute(
      { action: "add", type: "inclusion", criterion: "adults over 18" },
      { projectId: "proj-1" }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      success: true,
      action: "add",
      type: "inclusion",
      criteria: ["Adults over 18"],
    });
    expect(mockUpdateProtocol).not.toHaveBeenCalled();
  });

  it("removes an existing criterion", async () => {
    const result = await updateCriteriaTool.execute(
      { action: "remove", type: "exclusion", criterion: "case reports" },
      { projectId: "proj-1" }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      success: true,
      action: "remove",
      type: "exclusion",
      criteria: [],
    });
    expect(mockUpdateProtocol).toHaveBeenCalledTimes(1);
  });

  it("removes criteria using fuzzy unicode/whitespace matching fallback", async () => {
    mockFindProtocol.mockResolvedValueOnce(
      makeProtocol({
        eligibility: {
          inclusion: ["Adults\u00A0over\u00A018\u2014years"],
          exclusion: [],
        },
      }) as never
    );

    const result = await updateCriteriaTool.execute(
      { action: "remove", type: "inclusion", criterion: "Adults over 18-years" },
      { projectId: "proj-1" }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      success: true,
      action: "remove",
      type: "inclusion",
      criteria: [],
    });
    expect(mockUpdateProtocol).toHaveBeenCalledTimes(1);
  });

  it("returns error when removing a missing criterion", async () => {
    const result = await updateCriteriaTool.execute(
      { action: "remove", type: "inclusion", criterion: "Children" },
      { projectId: "proj-1" }
    );

    expect(result.error).toContain("Criterion not found");
    expect(mockUpdateProtocol).not.toHaveBeenCalled();
  });

  it("removes criterion with case-insensitive fuzzy fallback", async () => {
    mockFindProtocol.mockResolvedValueOnce(
      makeProtocol({
        eligibility: {
          inclusion: ["Adults Over 18 Years"],
          exclusion: [],
        },
      }) as never
    );

    const result = await updateCriteriaTool.execute(
      { action: "remove", type: "inclusion", criterion: "ADULTS OVER 18 YEARS" },
      { projectId: "proj-1" }
    );

    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({
      success: true,
      action: "remove",
      type: "inclusion",
      criteria: [],
    });
    expect(mockUpdateProtocol).toHaveBeenCalledTimes(1);
  });
});
