import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    create: vi.fn(),
    createMany: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        studyMemory: {
            create: mocks.create,
            createMany: mocks.createMany,
        },
    },
}));

const { batchCreateStudyMemories, createStudyMemory } = await import("@/lib/server/memory/study-memory");

describe("study memory creation", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.create.mockResolvedValue({ id: "sm-1" });
        mocks.createMany.mockResolvedValue({ count: 1 });
    });

    it("normalizes source, authority, key, and embedding lifecycle for single creates", async () => {
        await createStudyMemory({
            studyId: "study-1",
            projectId: "project-1",
            type: "summary",
            content: "A useful extracted summary.",
            tags: ["deep-analysis", "memory-key:summary-main"],
        });

        expect(mocks.create).toHaveBeenCalledWith({
            data: expect.objectContaining({
                key: "summary-main",
                source: "deep_analysis",
                authority: "inferred",
                polarity: "affirming",
                embeddingStatus: "pending",
                tags: ["deep-analysis", "memory-key:summary-main"],
            }),
        });
    });

    it("uses the same normalization path for batch creates", async () => {
        await batchCreateStudyMemories([{
            studyId: "study-1",
            projectId: "project-1",
            type: "finding",
            key: "primary-outcome",
            content: "Primary outcome improved in the intervention arm.",
            source: "artifact_accept",
            authority: "confirmed",
            polarity: "affirming",
            tags: ["artifact-decision"],
        }]);

        expect(mocks.createMany).toHaveBeenCalledWith({
            data: [expect.objectContaining({
                key: "primary-outcome",
                source: "artifact_accept",
                authority: "confirmed",
                polarity: "affirming",
                embeddingStatus: "pending",
                tags: ["artifact-decision", "memory-key:primary-outcome"],
            })],
        });
    });
});
