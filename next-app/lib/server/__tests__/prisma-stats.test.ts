import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPRISMAStats } from "../memory/prisma-stats";

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        study: { findMany: vi.fn() },
        projectMemory: { findMany: vi.fn() },
    },
}));

const { prisma } = await import("@/lib/server/prisma");
const mockStudyFindMany = vi.mocked(prisma.study.findMany);
const mockMemoryFindMany = vi.mocked(prisma.projectMemory.findMany);

beforeEach(() => {
    vi.clearAllMocks();
    mockMemoryFindMany.mockResolvedValue([]);
});

describe("getPRISMAStats", () => {
    it("returns all zeros when no studies exist", async () => {
        mockStudyFindMany.mockResolvedValue([]);

        const stats = await getPRISMAStats("proj-1");

        expect(stats).toEqual({
            identification: { total: 0 },
            screening: { screened: 0, excluded: 0, exclusionReasons: [] },
            included: { total: 0 },
            pending: { maybe: 0, unscreened: 0 },
        });
    });

    it("correctly counts studies by triageDecision", async () => {
        mockStudyFindMany.mockResolvedValue([
            { details: { triageDecision: "keep" } },
            { details: { triageDecision: "keep" } },
            { details: { triageDecision: "exclude" } },
            { details: { triageDecision: "maybe" } },
            { details: null },
            { details: {} },
        ] as any);

        const stats = await getPRISMAStats("proj-1");

        expect(stats.identification.total).toBe(6);
        expect(stats.included.total).toBe(2);
        expect(stats.screening.excluded).toBe(1);
        expect(stats.pending.maybe).toBe(1);
        expect(stats.pending.unscreened).toBe(2);
        expect(stats.screening.screened).toBe(4); // 2 + 1 + 1
    });

    it("groups exclusion reasons from ProjectMemory", async () => {
        mockStudyFindMany.mockResolvedValue([
            { details: { triageDecision: "exclude" } },
            { details: { triageDecision: "exclude" } },
            { details: { triageDecision: "exclude" } },
        ] as any);
        mockMemoryFindMany.mockResolvedValue([
            { rationale: "Wrong population" },
            { rationale: "Case study design" },
            { rationale: "Wrong population" },
        ] as any);

        const stats = await getPRISMAStats("proj-1");

        expect(stats.screening.exclusionReasons).toHaveLength(2);
        expect(stats.screening.exclusionReasons[0]).toEqual({
            reason: "Wrong population",
            count: 2,
        });
        expect(stats.screening.exclusionReasons[1]).toEqual({
            reason: "Case study design",
            count: 1,
        });
    });

    it("returns empty exclusionReasons when no exclusion memories exist", async () => {
        mockStudyFindMany.mockResolvedValue([
            { details: { triageDecision: "keep" } },
        ] as any);

        const stats = await getPRISMAStats("proj-1");

        expect(stats.screening.exclusionReasons).toEqual([]);
    });

    it("handles projects with only included studies", async () => {
        mockStudyFindMany.mockResolvedValue([
            { details: { triageDecision: "keep" } },
            { details: { triageDecision: "keep" } },
        ] as any);

        const stats = await getPRISMAStats("proj-1");

        expect(stats.screening.excluded).toBe(0);
        expect(stats.included.total).toBe(2);
        expect(stats.screening.exclusionReasons).toEqual([]);
    });
});
