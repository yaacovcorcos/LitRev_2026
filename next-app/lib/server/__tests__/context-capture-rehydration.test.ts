import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContextCaptureTarget } from "@/types/context-capture";

const mocks = vi.hoisted(() => ({
    studyFindFirst: vi.fn(),
    studyFindMany: vi.fn(),
    noteFindFirst: vi.fn(),
    artifactFindFirst: vi.fn(),
    messageFindFirst: vi.fn(),
    protocolFindUnique: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        study: {
            findFirst: mocks.studyFindFirst,
            findMany: mocks.studyFindMany,
        },
        note: { findFirst: mocks.noteFindFirst },
        artifact: { findFirst: mocks.artifactFindFirst },
        aIMessage: { findFirst: mocks.messageFindFirst },
        protocol: { findUnique: mocks.protocolFindUnique },
    },
}));

const {
    buildContextCapturePromptBlock,
    rehydrateContextCaptureTargets,
} = await import("@/lib/server/ai/context-capture");

describe("context capture rehydration", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.studyFindFirst.mockResolvedValue({
            id: "study-1",
            title: "Authoritative server title",
            authors: "Smith",
            year: 2026,
            quality: "High",
            details: {
                abstract: "Server abstract",
                journal: "Server Journal",
            },
        });
        mocks.studyFindMany.mockResolvedValue([{ id: "study-1" }]);
    });

    it("rehydrates study targets from server data instead of trusting client content", async () => {
        const targets: ContextCaptureTarget[] = [{
            kind: "study",
            projectId: "proj-1",
            studyId: "study-1",
            title: "Client forged title",
            abstract: "Client forged abstract",
            label: "Client forged title",
            preview: "Client preview",
            icon: "article",
        }];

        const [target] = await rehydrateContextCaptureTargets(targets, {
            ownerId: "user-1",
            workspaceId: "ws-1",
            projectId: "proj-1",
        });

        const block = buildContextCapturePromptBlock([target]);

        expect(target).toMatchObject({
            title: "Authoritative server title",
            abstract: "Server abstract",
        });
        expect(block).toContain("Authoritative server title");
        expect(block).not.toContain("Client forged title");
        expect(block).not.toContain("Client forged abstract");
    });

    it("rejects draft selections that cite studies outside the project scope", async () => {
        mocks.studyFindMany.mockResolvedValue([]);
        const targets: ContextCaptureTarget[] = [{
            kind: "draft_selection",
            projectId: "proj-1",
            section: "Results",
            selectedText: "Claim with citation",
            citedStudyIds: ["foreign-study"],
            label: "Results",
            icon: "edit_note",
        }];

        await expect(rehydrateContextCaptureTargets(targets, {
            ownerId: "user-1",
            workspaceId: "ws-1",
            projectId: "proj-1",
        })).rejects.toThrow("cited study");
    });
});
