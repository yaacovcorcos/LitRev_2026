import { beforeEach, describe, expect, it, vi } from "vitest";
import { SINGLE_USER_SCOPE } from "@/lib/server/scope";
import { getProjectRecentActivity } from "@/lib/server/activity";

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        project: { findFirst: vi.fn() },
        study: { findMany: vi.fn() },
        note: { findMany: vi.fn() },
        fileAsset: { findMany: vi.fn() },
        protocol: { findUnique: vi.fn() },
        draft: { findUnique: vi.fn() },
        artifact: { findMany: vi.fn() },
        aIConversation: { findMany: vi.fn() },
    },
}));

const { prisma } = await import("@/lib/server/prisma");
const mockProjectFindFirst = vi.mocked(prisma.project.findFirst);
const mockStudyFindMany = vi.mocked(prisma.study.findMany);
const mockNoteFindMany = vi.mocked(prisma.note.findMany);
const mockFileFindMany = vi.mocked(prisma.fileAsset.findMany);
const mockProtocolFindUnique = vi.mocked(prisma.protocol.findUnique);
const mockDraftFindUnique = vi.mocked(prisma.draft.findUnique);
const mockArtifactFindMany = vi.mocked(prisma.artifact.findMany);
const mockConversationFindMany = vi.mocked(prisma.aIConversation.findMany);

describe("getProjectRecentActivity", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockProjectFindFirst.mockResolvedValue({ id: "project-1" } as never);
        mockStudyFindMany.mockResolvedValue([] as never);
        mockNoteFindMany.mockResolvedValue([] as never);
        mockFileFindMany.mockResolvedValue([] as never);
        mockProtocolFindUnique.mockResolvedValue(null as never);
        mockDraftFindUnique.mockResolvedValue(null as never);
        mockArtifactFindMany.mockResolvedValue([] as never);
        mockConversationFindMany.mockResolvedValue([] as never);
    });

    it("merges interleaved source events in descending timestamp order", async () => {
        mockStudyFindMany.mockResolvedValue([
            {
                id: "study-1",
                title: "Study One",
                year: 2024,
                createdAt: new Date("2026-02-20T10:00:00.000Z"),
            },
        ] as never);
        mockNoteFindMany.mockResolvedValue([
            {
                id: "note-1",
                title: "Protocol note",
                createdAt: new Date("2026-02-20T10:59:55.000Z"),
                updatedAt: new Date("2026-02-20T11:00:00.000Z"),
            },
        ] as never);
        mockArtifactFindMany.mockResolvedValue([
            {
                id: "artifact-1",
                type: "protocol_suggestion",
                title: "Eligibility criteria update",
                createdAt: new Date("2026-02-20T12:00:00.000Z"),
            },
        ] as never);

        const activity = await getProjectRecentActivity(SINGLE_USER_SCOPE, "project-1", 8);

        expect(activity).toHaveLength(3);
        expect(activity.map((item) => item.kind)).toEqual([
            "artifact_applied",
            "note_created",
            "study_created",
        ]);
    });

    it("coalesces rapid duplicates for the same entity and appends count suffix", async () => {
        mockConversationFindMany.mockResolvedValue([
            {
                id: "conv-1",
                title: "Screening chat",
                createdAt: new Date("2026-02-20T10:00:00.000Z"),
                updatedAt: new Date("2026-02-20T10:02:00.000Z"),
            },
            {
                id: "conv-1",
                title: "Screening chat",
                createdAt: new Date("2026-02-20T10:00:00.000Z"),
                updatedAt: new Date("2026-02-20T10:01:30.000Z"),
            },
            {
                id: "conv-1",
                title: "Screening chat",
                createdAt: new Date("2026-02-20T10:00:00.000Z"),
                updatedAt: new Date("2026-02-20T10:00:35.000Z"),
            },
        ] as never);

        const activity = await getProjectRecentActivity(SINGLE_USER_SCOPE, "project-1", 8);

        expect(activity).toHaveLength(2);
        expect(activity[0]?.coalescedCount).toBe(2);
        expect(activity[0]?.label).toContain("(+1 more)");
    });

    it("throws when project is outside the scoped workspace/user", async () => {
        mockProjectFindFirst.mockResolvedValue(null as never);

        await expect(getProjectRecentActivity(SINGLE_USER_SCOPE, "project-1", 8)).rejects.toThrow(
            "Project not found or access denied.",
        );
    });
});
