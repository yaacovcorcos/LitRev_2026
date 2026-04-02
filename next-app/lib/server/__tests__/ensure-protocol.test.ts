import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { createDefaultProtocolData } from "@/types/protocol";

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    protocol: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const { prisma } = await import("@/lib/server/prisma");
const mockFindUnique = vi.mocked(prisma.protocol.findUnique);
const mockUpsert = vi.mocked(prisma.protocol.upsert);

// Import after mocks are set up
const { ensureProtocol } = await import("@/lib/server/protocols");

describe("ensureProtocol", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns existing protocol data without writing", async () => {
    const existingData = {
      researchQuestion: "Does X improve Y?",
      pico: { population: "Adults", intervention: "", comparison: "", outcome: "" },
      eligibility: { inclusion: ["RCTs"], exclusion: [] },
      searchStrategy: { query: "", databases: [] },
      methodology: { studyDesigns: [], timeFrameStart: "", timeFrameEnd: "", qualityAssessmentTool: "", qualityAssessmentNotes: "" },
    };
    mockFindUnique.mockResolvedValueOnce({ id: "p1", projectId: "proj-1", data: existingData } as never);

    const result = await ensureProtocol("proj-1");

    expect(result).toEqual(existingData);
    expect(mockFindUnique).toHaveBeenCalledWith({ where: { projectId: "proj-1" } });
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("creates default protocol when none exists", async () => {
    const defaults = createDefaultProtocolData();
    mockFindUnique.mockResolvedValueOnce(null as never);
    mockUpsert.mockResolvedValueOnce({ id: "p2", projectId: "proj-2", data: defaults } as never);

    const result = await ensureProtocol("proj-2");

    expect(result).toEqual(defaults);
    expect(mockUpsert).toHaveBeenCalledWith({
      where: { projectId: "proj-2" },
      create: { projectId: "proj-2", data: defaults as unknown as Prisma.InputJsonValue },
      update: {},
    });
  });

  it("does not overwrite populated data on repeat call", async () => {
    const populated = {
      researchQuestion: "My question",
      pico: { population: "Adults", intervention: "X", comparison: "Y", outcome: "Z" },
      eligibility: { inclusion: ["RCTs"], exclusion: ["Case reports"] },
      searchStrategy: { query: "test", databases: ["PubMed"] },
      methodology: { studyDesigns: ["RCTs"], timeFrameStart: "2020", timeFrameEnd: "2025", qualityAssessmentTool: "RoB 2", qualityAssessmentNotes: "" },
    };
    mockFindUnique.mockResolvedValue({ id: "p3", projectId: "proj-3", data: populated } as never);

    const first = await ensureProtocol("proj-3");
    const second = await ensureProtocol("proj-3");

    expect(first).toEqual(populated);
    expect(second).toEqual(populated);
    expect(mockUpsert).not.toHaveBeenCalled();
  });
});
