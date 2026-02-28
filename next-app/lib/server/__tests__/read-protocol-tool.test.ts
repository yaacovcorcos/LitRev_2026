import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    protocol: {
      findFirst: vi.fn(),
    },
  },
}));

const { prisma } = await import("@/lib/server/prisma");
const mockFindFirst = vi.mocked(prisma.protocol.findFirst);

const { readProtocolTool } = await import("@/lib/server/ai/tools/read-protocol");

describe("readProtocolTool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns protocol context when a protocol exists", async () => {
    mockFindFirst.mockResolvedValueOnce({
      data: {
        researchQuestion: "Does X improve Y?",
        pico: { population: "Adults", intervention: "X", comparison: "Control", outcome: "Y" },
        eligibility: { inclusion: ["RCT"], exclusion: [] },
        searchStrategy: { query: "", databases: [] },
        methodology: { studyDesigns: [], timeFrameStart: "", timeFrameEnd: "", qualityAssessmentTool: "", qualityAssessmentNotes: "" },
      },
    } as never);

    const result = await readProtocolTool.execute({}, { projectId: "p1" });

    expect(result.error).toBeUndefined();
    const payload = result.result as { hasProtocol: boolean; protocolContext: string };
    expect(payload.hasProtocol).toBe(true);
    expect(payload.protocolContext).toContain("[PROTOCOL_CONTEXT]");
    expect(payload.protocolContext).toContain("Research Question: Does X improve Y?");
  });

  it("returns fallback context when protocol is missing", async () => {
    mockFindFirst.mockResolvedValueOnce(null as never);

    const result = await readProtocolTool.execute({}, { projectId: "p1" });

    expect(result.error).toBeUndefined();
    const payload = result.result as { hasProtocol: boolean; protocolContext: string };
    expect(payload.hasProtocol).toBe(false);
    expect(payload.protocolContext).toContain("No protocol defined yet");
  });

  it("errors without project context", async () => {
    const result = await readProtocolTool.execute({});
    expect(result.error).toContain("No project context available");
  });
});
