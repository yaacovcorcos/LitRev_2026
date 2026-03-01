import { beforeEach, describe, expect, it, vi } from "vitest";
import { deleteStudyTool } from "@/lib/server/ai/tools/delete-study";

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        study: {
            findFirst: vi.fn(),
            updateMany: vi.fn(),
        },
    },
}));

const { prisma } = await import("@/lib/server/prisma");
const mockFindStudy = vi.mocked(prisma.study.findFirst);
const mockUpdateMany = vi.mocked(prisma.study.updateMany);

describe("deleteStudyTool", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFindStudy.mockResolvedValue({
            id: "study-1",
            title: "Example Study",
        } as never);
        mockUpdateMany.mockResolvedValue({ count: 1 } as never);
    });

    it("has expected definition and autonomy", () => {
        expect(deleteStudyTool.definition.name).toBe("delete_study");
        expect(deleteStudyTool.autonomy).toEqual({
            defaultLevel: 1,
            allowedRange: [1, 2],
            hardCap: 2,
        });
    });

    it("requires study context", async () => {
        const result = await deleteStudyTool.execute({}, { projectId: "proj-1" });
        expect(result.error).toContain("No study specified");
    });

    it("requires project context", async () => {
        const result = await deleteStudyTool.execute({}, { studyId: "study-1" });
        expect(result.error).toContain("No project context available");
    });

    it("returns an error when study does not exist", async () => {
        mockFindStudy.mockResolvedValueOnce(null as never);
        const result = await deleteStudyTool.execute({ studyId: "missing" }, { projectId: "proj-1" });
        expect(result.error).toContain("Study not found");
    });

    it("soft-deletes the study and returns confirmation payload", async () => {
        const result = await deleteStudyTool.execute(
            { studyId: "study-1", reason: "Duplicate imported row" },
            { projectId: "proj-1" }
        );

        expect(result.error).toBeUndefined();
        expect(mockUpdateMany).toHaveBeenCalledWith({
            where: { id: "study-1", projectId: "proj-1", deletedAt: null },
            data: { deletedAt: expect.any(Date) },
        });
        expect(result.result).toEqual({
            success: true,
            studyId: "study-1",
            title: "Example Study",
            reason: "Duplicate imported row",
        });
    });

    it("uses context.studyId when args.studyId is omitted", async () => {
        const result = await deleteStudyTool.execute(
            { reason: "Requested removal" },
            { projectId: "proj-1", studyId: "study-1" }
        );

        expect(result.error).toBeUndefined();
        expect(mockFindStudy).toHaveBeenCalledWith({
            where: { id: "study-1", projectId: "proj-1", deletedAt: null },
            select: { id: true, title: true },
        });
        expect(mockUpdateMany).toHaveBeenCalledWith({
            where: { id: "study-1", projectId: "proj-1", deletedAt: null },
            data: { deletedAt: expect.any(Date) },
        });
        expect(result.result).toEqual({
            success: true,
            studyId: "study-1",
            title: "Example Study",
            reason: "Requested removal",
        });
    });

    it("returns a stable error message on unexpected failures", async () => {
        mockUpdateMany.mockRejectedValueOnce(new Error("db down"));
        const result = await deleteStudyTool.execute({ studyId: "study-1" }, { projectId: "proj-1" });
        expect(result.error).toContain("db down");
    });
});
