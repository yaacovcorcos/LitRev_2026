import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateStudyTool } from "@/lib/server/ai/tools/update-study";

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        study: {
            findFirst: vi.fn(),
        },
    },
}));

const { prisma } = await import("@/lib/server/prisma");
const mockFindStudy = vi.mocked(prisma.study.findFirst);

describe("updateStudyTool", () => {
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
    });

    it("has expected definition and autonomy", () => {
        expect(updateStudyTool.definition.name).toBe("update_study");
        expect(updateStudyTool.autonomy).toEqual({
            defaultLevel: 2,
            allowedRange: [1, 2],
            hardCap: 2,
        });
    });

    it("requires study context", async () => {
        const result = await updateStudyTool.execute({ rationale: "fix metadata", abstract: "New" }, { projectId: "proj-1" });
        expect(result.error).toContain("No study specified");
    });

    it("returns a typed patch + change list for normal update", async () => {
        const result = await updateStudyTool.execute(
            { abstract: "Updated abstract", quality: "High", rationale: "User asked" },
            { projectId: "proj-1", studyId: "study-1" }
        );

        expect(result.error).toBeUndefined();
        const payload = result.result as {
            studyId: string;
            patch: { top?: { quality?: string }; details?: Record<string, unknown> };
            changes: Array<{ field: string; operation: string; typedNewValue: unknown }>;
            idempotencyKey: string;
        };

        expect(payload.studyId).toBe("study-1");
        expect(payload.patch.top?.quality).toBe("High");
        expect(payload.patch.details?.abstract).toBe("Updated abstract");
        expect(payload.idempotencyKey).toBeTruthy();
        expect(payload.changes.map((c) => c.field)).toEqual(["quality", "details.abstract"]);
        expect(payload.changes.map((c) => c.operation)).toEqual(["set", "set"]);
    });

    it("supports clear operation via empty string", async () => {
        const result = await updateStudyTool.execute(
            { doi: "", rationale: "DOI is invalid" },
            { projectId: "proj-1", studyId: "study-1" }
        );

        expect(result.error).toBeUndefined();
        const payload = result.result as {
            patch: { details?: Record<string, unknown> };
            changes: Array<{ field: string; operation: string; typedNewValue: unknown; displayNew: string }>;
        };

        expect(payload.patch.details?.doi).toBeNull();
        expect(payload.changes[0]).toMatchObject({
            field: "details.doi",
            operation: "clear",
            typedNewValue: null,
            displayNew: "(cleared)",
        });
    });

    it("supports keyword append operation", async () => {
        const result = await updateStudyTool.execute(
            {
                keywords: ["efficacy", "trial"],
                keywordsOperation: "append",
                rationale: "Add missing keyword",
            },
            { projectId: "proj-1", studyId: "study-1" }
        );

        expect(result.error).toBeUndefined();
        const payload = result.result as {
            patch: { details?: Record<string, unknown> };
            changes: Array<{ operation: string; typedNewValue: unknown }>;
        };
        expect(payload.changes[0]?.operation).toBe("append");
        expect(payload.patch.details?.keywords).toEqual(["statin", "trial", "efficacy"]);
    });

    it("validates DOI format", async () => {
        const result = await updateStudyTool.execute(
            { doi: "not-a-doi", rationale: "test" },
            { projectId: "proj-1", studyId: "study-1" }
        );
        expect(result.error).toContain("Invalid DOI format");
    });

    it("returns protocol-specific sourceUrl error for non-http URLs", async () => {
        const result = await updateStudyTool.execute(
            { sourceUrl: "ftp://example.org/paper", rationale: "test" },
            { projectId: "proj-1", studyId: "study-1" }
        );
        expect(result.error).toContain("Source URL must use http/https");
    });
});
