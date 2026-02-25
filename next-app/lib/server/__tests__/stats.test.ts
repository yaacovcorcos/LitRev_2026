import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/prisma", () => ({
  prisma: {
    draft: { findFirst: vi.fn() },
    protocol: { findFirst: vi.fn() },
    study: { findMany: vi.fn() },
  },
}));

const { prisma } = await import("@/lib/server/prisma");
const mockDraftFindFirst = vi.mocked(prisma.draft.findFirst);
const mockProtocolFindFirst = vi.mocked(prisma.protocol.findFirst);
const mockStudyFindMany = vi.mocked(prisma.study.findMany);

const { getDraftStatsAction, getProtocolStatsAction, getLedgerStatsAction } =
  await import("@/app/actions/stats");

describe("getDraftStatsAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when no draft exists", async () => {
    mockDraftFindFirst.mockResolvedValue(null as never);
    const result = await getDraftStatsAction("p1");
    expect(result).toEqual({ success: true, data: null });
  });

  it("counts sections with content as completed", async () => {
    mockDraftFindFirst.mockResolvedValue({
      id: "d1",
      projectId: "p1",
      state: {
        version: 1,
        sectionOrder: ["abstract", "introduction", "methods"],
        contentBySection: {
          abstract: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Some abstract text" }] }] },
          introduction: { type: "doc", content: [{ type: "paragraph" }] },
          methods: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Methods here" }] }] },
        },
        customSections: {},
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await getDraftStatsAction("p1");
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data!.completedCount).toBe(2);
    expect(result.data!.totalCount).toBe(3);
    expect(result.data!.sections[0]).toEqual({ key: "abstract", label: "Abstract", hasContent: true });
    expect(result.data!.sections[1]).toEqual({ key: "introduction", label: "Introduction", hasContent: false });
    expect(result.data!.sections[2]).toEqual({ key: "methods", label: "Methods", hasContent: true });
  });

  it("treats whitespace-only text as empty", async () => {
    mockDraftFindFirst.mockResolvedValue({
      id: "d1",
      projectId: "p1",
      state: {
        version: 1,
        sectionOrder: ["abstract"],
        contentBySection: {
          abstract: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "   " }] }] },
        },
        customSections: {},
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await getDraftStatsAction("p1");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data!.completedCount).toBe(0);
    expect(result.data!.sections[0].hasContent).toBe(false);
  });

  it("resolves labels for custom sections", async () => {
    mockDraftFindFirst.mockResolvedValue({
      id: "d1",
      projectId: "p1",
      state: {
        version: 1,
        sectionOrder: ["custom-1"],
        contentBySection: { "custom-1": { type: "doc", content: [{ type: "paragraph" }] } },
        customSections: { "custom-1": { label: "My Custom Section" } },
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never);

    const result = await getDraftStatsAction("p1");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data!.sections[0].label).toBe("My Custom Section");
  });
});

describe("getProtocolStatsAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when no protocol exists", async () => {
    mockProtocolFindFirst.mockResolvedValue(null as never);
    const result = await getProtocolStatsAction("p1");
    expect(result).toEqual({ success: true, data: null });
  });

  it("counts non-empty eligibility criteria", async () => {
    mockProtocolFindFirst.mockResolvedValue({
      data: {
        researchQuestion: "What is X?",
        eligibility: {
          inclusion: ["Adults over 18", "RCT design", ""],
          exclusion: ["Case reports", ""],
        },
      },
      updatedAt: new Date("2026-02-20T10:00:00Z"),
    } as never);

    const result = await getProtocolStatsAction("p1");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data!.criteriaCount).toBe(3); // 2 inclusion + 1 exclusion (empty strings filtered)
    expect(result.data!.hasResearchQuestion).toBe(true);
    expect(result.data!.updatedAt).toBe("2026-02-20T10:00:00.000Z");
  });

  it("filters blank criteria and whitespace-only entries", async () => {
    mockProtocolFindFirst.mockResolvedValue({
      data: {
        researchQuestion: "",
        eligibility: {
          inclusion: ["", "  ", "Valid criterion"],
          exclusion: [],
        },
      },
      updatedAt: new Date("2026-02-20T10:00:00Z"),
    } as never);

    const result = await getProtocolStatsAction("p1");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data!.criteriaCount).toBe(1);
    expect(result.data!.hasResearchQuestion).toBe(false);
  });
});

describe("getLedgerStatsAction", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when no studies exist", async () => {
    mockStudyFindMany.mockResolvedValue([] as never);
    const result = await getLedgerStatsAction("p1");
    expect(result).toEqual({ success: true, data: null });
  });

  it("counts studies by status", async () => {
    mockStudyFindMany.mockResolvedValue([
      { status: "extracted" },
      { status: "extracted" },
      { status: "excluded" },
      { status: "active" },
      { status: "pending" },
      { status: "pending" },
      { status: "pending" },
    ] as never);

    const result = await getLedgerStatsAction("p1");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      totalStudies: 7,
      extractedCount: 2,
      screenedCount: 2, // excluded + active
      pendingCount: 3,
    });
  });

  it("handles all-pending studies", async () => {
    mockStudyFindMany.mockResolvedValue([
      { status: "pending" },
      { status: "pending" },
    ] as never);

    const result = await getLedgerStatsAction("p1");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data!.extractedCount).toBe(0);
    expect(result.data!.screenedCount).toBe(0);
    expect(result.data!.pendingCount).toBe(2);
  });
});
