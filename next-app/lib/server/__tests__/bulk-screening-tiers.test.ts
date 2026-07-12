import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    findMany: vi.fn(),
    ensureProtocol: vi.fn(),
    chat: vi.fn(),
    isTieredScreeningEnabled: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        study: {
            findMany: mocks.findMany,
        },
    },
}));

vi.mock("@/lib/server/protocols", () => ({
    ensureProtocol: mocks.ensureProtocol,
}));

vi.mock("@/lib/server/ai/ai-service", () => ({
    getAIService: () => ({
        chat: mocks.chat,
    }),
}));

vi.mock("@/lib/agent/feature-flags", () => ({
    isTieredScreeningEnabled: mocks.isTieredScreeningEnabled,
}));

const { bulkScreeningTool } = await import("@/lib/server/ai/tools/bulk-screening");

type ScreeningBatchResult = {
    studies: Array<{
        studyId?: string;
        year: number;
        recommendation: "keep" | "exclude" | "maybe";
        screeningTier?: "deterministic" | "ai" | "heuristic" | "default";
        confidence: number;
        matchRationale?: string;
    }>;
};

function makeStudy(overrides: Record<string, unknown> = {}) {
    return {
        id: "study-1",
        title: "Example Study",
        authors: "Doe J",
        year: 2021,
        details: { abstract: "Example abstract", studyType: "RCT" },
        ...overrides,
    };
}

describe("bulkScreeningTool tiered routing", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.ensureProtocol.mockResolvedValue({
            eligibility: { inclusion: ["Adults"], exclusion: ["Case reports"] },
            methodology: {
                studyDesigns: ["Randomized Controlled Trials (RCTs)"],
                timeFrameStart: "2018",
                timeFrameEnd: "2023",
                qualityAssessmentTool: "",
                qualityAssessmentNotes: "",
            },
        });
        mocks.isTieredScreeningEnabled.mockReturnValue(true);
    });

    it("Tier 1: deterministic exclusion skips AI call", async () => {
        mocks.findMany.mockResolvedValue([
            makeStudy({ id: "study-outside", year: 2000 }),
        ]);

        const result = await bulkScreeningTool.execute({}, { projectId: "proj-1" });
        expect(result.error).toBeUndefined();
        expect(mocks.chat).not.toHaveBeenCalled();
        const payload = result.result as ScreeningBatchResult;
        expect(payload.studies[0]).toEqual(
            expect.objectContaining({
                studyId: "study-outside",
                recommendation: "exclude",
                screeningTier: "deterministic",
                confidence: 1,
            })
        );
    });

    it("[screening-decision-audit] Tier 2: AI path returns ai tier", async () => {
        mocks.findMany.mockResolvedValue([makeStudy({ id: "study-ai" })]);
        mocks.chat.mockResolvedValue({
            content: '{"decision":"keep","reason":"Matches all criteria","confidence":0.9}',
        });

        const result = await bulkScreeningTool.execute({}, { projectId: "proj-1" });
        expect(result.error).toBeUndefined();
        expect(mocks.chat).toHaveBeenCalledTimes(1);
        const payload = result.result as ScreeningBatchResult;
        expect(payload.studies[0]).toEqual(
            expect.objectContaining({
                studyId: "study-ai",
                recommendation: "keep",
                screeningTier: "ai",
            })
        );
    });

    it("passes the owning cancellation signal to nested screening model calls", async () => {
        const controller = new AbortController();
        mocks.findMany.mockResolvedValue([makeStudy({ id: "study-signal" })]);
        mocks.chat.mockResolvedValue({
            content: '{"decision":"keep","reason":"Matches","confidence":0.9}',
        });

        const result = await bulkScreeningTool.execute({}, {
            projectId: "proj-1",
            signal: controller.signal,
        });

        expect(result.error).toBeUndefined();
        expect(mocks.chat).toHaveBeenCalledWith(
            expect.any(Array),
            expect.objectContaining({ signal: controller.signal }),
        );
    });

    it("stops between studies and does not accept a model result after cancellation", async () => {
        const controller = new AbortController();
        mocks.findMany.mockResolvedValue([
            makeStudy({ id: "study-first" }),
            makeStudy({ id: "study-second" }),
        ]);
        mocks.chat.mockImplementationOnce(async () => {
            controller.abort();
            return {
                content: '{"decision":"keep","reason":"Matches","confidence":0.9}',
            };
        });

        await expect(bulkScreeningTool.execute({}, {
            projectId: "proj-1",
            signal: controller.signal,
        })).rejects.toMatchObject({ name: "AbortError" });

        expect(mocks.chat).toHaveBeenCalledTimes(1);
    });

    it("does not start protocol or study work for a pre-cancelled batch", async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(bulkScreeningTool.execute({}, {
            projectId: "proj-1",
            signal: controller.signal,
        })).rejects.toMatchObject({ name: "AbortError" });

        expect(mocks.ensureProtocol).not.toHaveBeenCalled();
        expect(mocks.findMany).not.toHaveBeenCalled();
        expect(mocks.chat).not.toHaveBeenCalled();
    });

    it("Tier 3: malformed JSON repaired into heuristic tier", async () => {
        mocks.findMany.mockResolvedValue([makeStudy({ id: "study-heuristic" })]);
        mocks.chat.mockResolvedValue({
            content: '{"decision":"exclude","reason":"Wrong population","confidence":0.8,}',
        });

        const result = await bulkScreeningTool.execute({}, { projectId: "proj-1" });
        expect(result.error).toBeUndefined();
        const payload = result.result as ScreeningBatchResult;
        expect(payload.studies[0]).toEqual(
            expect.objectContaining({
                studyId: "study-heuristic",
                recommendation: "exclude",
                screeningTier: "heuristic",
            })
        );
    });

    it("Tier 4: AI failure falls back to default maybe", async () => {
        mocks.findMany.mockResolvedValue([makeStudy({ id: "study-default" })]);
        mocks.chat.mockRejectedValue(new Error("provider down"));

        const result = await bulkScreeningTool.execute({}, { projectId: "proj-1" });
        expect(result.error).toBeUndefined();
        const payload = result.result as ScreeningBatchResult;
        expect(payload.studies[0]).toEqual(
            expect.objectContaining({
                studyId: "study-default",
                recommendation: "maybe",
                screeningTier: "default",
                confidence: 0,
            })
        );
    });

    it("low-confidence AI decision is escalated to maybe", async () => {
        mocks.findMany.mockResolvedValue([makeStudy({ id: "study-low-confidence" })]);
        mocks.chat.mockResolvedValue({
            content: '{"decision":"exclude","reason":"Weak signal","confidence":0.2}',
        });

        const result = await bulkScreeningTool.execute({}, { projectId: "proj-1" });
        expect(result.error).toBeUndefined();
        const payload = result.result as ScreeningBatchResult;
        expect(payload.studies[0]).toEqual(
            expect.objectContaining({
                studyId: "study-low-confidence",
                recommendation: "maybe",
                screeningTier: "ai",
            })
        );
        expect(payload.studies[0]?.matchRationale).toContain("low confidence");
    });

    it("includes studyId for all tiers", async () => {
        mocks.findMany.mockResolvedValue([
            makeStudy({ id: "s1", year: 2000 }), // deterministic
            makeStudy({ id: "s2" }), // ai
            makeStudy({ id: "s3" }), // heuristic
            makeStudy({ id: "s4" }), // default
        ]);
        mocks.chat
            .mockResolvedValueOnce({ content: '{"decision":"keep","reason":"ok","confidence":0.9}' })
            .mockResolvedValueOnce({ content: '{"decision":"exclude","reason":"wrong","confidence":0.7,}' })
            .mockRejectedValueOnce(new Error("network"));

        const result = await bulkScreeningTool.execute({}, { projectId: "proj-1" });
        expect(result.error).toBeUndefined();

        const payload = result.result as ScreeningBatchResult;
        const ids = payload.studies.map((study) => study.studyId);
        expect(ids).toEqual(["s1", "s2", "s3", "s4"]);
    });

    it("preserves unknown study year sentinel (0) in artifact payload", async () => {
        mocks.findMany.mockResolvedValue([
            makeStudy({ id: "s-year", year: 0 }),
        ]);
        mocks.chat.mockResolvedValue({
            content: '{"decision":"keep","reason":"Looks relevant","confidence":0.8}',
        });

        const result = await bulkScreeningTool.execute({}, { projectId: "proj-1" });
        expect(result.error).toBeUndefined();
        const payload = result.result as ScreeningBatchResult;
        expect(payload.studies[0]?.year).toBe(0);
    });
});
