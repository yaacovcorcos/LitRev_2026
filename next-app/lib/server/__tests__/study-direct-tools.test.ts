import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateStudyDirectTool } from "@/lib/server/ai/tools/update-study-direct";
import { previewStudyPdfUpdateTool } from "@/lib/server/ai/tools/preview-study-pdf-update";

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        study: {
            findFirst: vi.fn(),
        },
        fileAsset: {
            findFirst: vi.fn(),
        },
    },
}));

vi.mock("@/lib/server/pdf-extraction", () => ({
    extractStudyFromPdf: vi.fn(),
    deepAnalyzeStudyFromPdf: vi.fn(),
}));

const { prisma } = await import("@/lib/server/prisma");
const { extractStudyFromPdf, deepAnalyzeStudyFromPdf } = await import("@/lib/server/pdf-extraction");

const mockFindStudy = vi.mocked(prisma.study.findFirst);
const mockFindFile = vi.mocked(prisma.fileAsset.findFirst);
const mockExtractStudyFromPdf = vi.mocked(extractStudyFromPdf);
const mockDeepAnalyzeStudyFromPdf = vi.mocked(deepAnalyzeStudyFromPdf);

describe("study direct-edit tools", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFindStudy.mockResolvedValue({
            id: "study-1",
            title: "Original title",
            authors: "Doe J",
            year: 2023,
            quality: "Medium",
            status: "pending",
            details: {
                abstract: "Original abstract",
                doi: "10.1000/original",
                keywords: ["statin", "trial"],
            },
            updatedAt: new Date("2026-01-10T00:00:00.000Z"),
        } as never);
        mockFindFile.mockResolvedValue({
            id: "file-1",
            projectId: "proj-1",
            studyId: "study-1",
            kind: "source",
            filename: "study.pdf",
            mimeType: "application/pdf",
            storagePath: "study-assets/projects/proj-1/studies/study-1/study.pdf",
            publicUrl: "https://example.com/study.pdf",
        } as never);
    });

    it("configures update_study_direct as a fixed auto-apply tool", () => {
        expect(updateStudyDirectTool.definition.name).toBe("update_study_direct");
        expect(updateStudyDirectTool.autonomy).toEqual({
            defaultLevel: 3,
            allowedRange: [3, 3],
            hardCap: 3,
        });
    });

    it("applies safe direct fields only", async () => {
        const result = await updateStudyDirectTool.execute(
            { abstract: "Updated abstract", aiSummary: "Short summary", rationale: "User asked" },
            { projectId: "proj-1", studyId: "study-1" }
        );

        expect(result.error).toBeUndefined();
        expect(result.result).toMatchObject({
            studyId: "study-1",
            patch: {
                details: {
                    abstract: "Updated abstract",
                    aiSummary: "Short summary",
                },
            },
        });
    });

    it("rejects risky study fields from the direct tool", async () => {
        const result = await updateStudyDirectTool.execute(
            { title: "New title", rationale: "User asked" },
            { projectId: "proj-1", studyId: "study-1" }
        );

        expect(result.error).toContain("Direct study edits only support");
    });

    it("rejects mixed safe and risky edits from the direct tool", async () => {
        const result = await updateStudyDirectTool.execute(
            { abstract: "Updated", title: "New title", rationale: "User asked" },
            { projectId: "proj-1", studyId: "study-1" }
        );

        expect(result.error).toContain("Direct study edits only support");
    });

    it("returns safe-only PDF previews without mutating", async () => {
        const controller = new AbortController();
        mockExtractStudyFromPdf.mockResolvedValue({
            success: true,
            details: {
                abstract: "Extracted abstract",
                doi: "10.1000/new",
                journal: "Lancet",
            },
            confidence: {},
            missingFields: [],
        });

        const result = await previewStudyPdfUpdateTool.execute(
            {},
            { projectId: "proj-1", studyId: "study-1", signal: controller.signal }
        );

        expect(result.error).toBeUndefined();
        expect(result.result).toMatchObject({
            success: true,
            classification: "safe_only",
            safeUpdates: {
                abstract: "Extracted abstract",
                doi: "10.1000/new",
                journal: "Lancet",
            },
            riskyUpdates: {},
        });
        expect(mockFindStudy).toHaveBeenCalledTimes(1);
        expect(mockFindFile).toHaveBeenCalledTimes(1);
        expect(mockExtractStudyFromPdf).toHaveBeenCalledWith(
            expect.objectContaining({ id: "file-1" }),
            "proj-1",
            { signal: controller.signal },
        );
    });

    it("classifies mixed PDF previews when risky fields are present", async () => {
        mockExtractStudyFromPdf.mockResolvedValue({
            success: true,
            title: "PDF title",
            authors: "Doe J; Smith A",
            year: 2024,
            details: {
                abstract: "Extracted abstract",
                doi: "10.1000/new",
            },
            confidence: {},
            missingFields: [],
        });

        const result = await previewStudyPdfUpdateTool.execute(
            {},
            { projectId: "proj-1", studyId: "study-1" }
        );

        expect(result.error).toBeUndefined();
        expect(result.result).toMatchObject({
            success: true,
            classification: "mixed_or_risky",
            safeUpdates: {
                abstract: "Extracted abstract",
                doi: "10.1000/new",
            },
            riskyUpdates: {
                title: "PDF title",
                authors: "Doe J; Smith A",
                year: 2024,
            },
        });
    });

    it("supports non-mutating deep preview for risky-only PDF findings", async () => {
        const controller = new AbortController();
        mockDeepAnalyzeStudyFromPdf.mockResolvedValue({
            success: true,
            details: {
                studyType: "RCT",
                qualityRationale: "Well-powered multicenter trial",
            },
            quality: "High",
        });

        const result = await previewStudyPdfUpdateTool.execute(
            { deep: true },
            { projectId: "proj-1", studyId: "study-1", signal: controller.signal }
        );

        expect(result.error).toBeUndefined();
        expect(result.result).toMatchObject({
            success: true,
            classification: "mixed_or_risky",
            riskyUpdates: {
                studyType: "RCT",
                quality: "High",
                qualityRationale: "Well-powered multicenter trial",
            },
        });
        expect(mockDeepAnalyzeStudyFromPdf).toHaveBeenCalledWith(
            expect.objectContaining({ id: "file-1" }),
            expect.objectContaining({ title: "Original title" }),
            "proj-1",
            { signal: controller.signal },
        );
    });
});
