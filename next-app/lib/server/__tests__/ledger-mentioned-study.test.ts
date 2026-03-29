import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/access", () => ({
    assertProjectAccess: vi.fn(async (scope: unknown) => scope),
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        study: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        studyProcessingJob: {
            findMany: vi.fn(),
        },
    },
}));

const { prisma } = await import("@/lib/server/prisma");
const mockFindMany = vi.mocked(prisma.study.findMany);
const mockFindFirst = vi.mocked(prisma.study.findFirst);
const mockCreate = vi.mocked(prisma.study.create);
const mockJobFindMany = vi.mocked(prisma.studyProcessingJob.findMany);

const { addMentionedStudy } = await import("@/lib/server/ledger");

function makeStudyRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "study_existing",
        title: "Existing Study",
        authors: "Doe",
        year: 2024,
        status: "pending",
        quality: "-",
        details: {},
        ...overrides,
    };
}

describe("addMentionedStudy", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockFindMany.mockResolvedValue([] as never);
        mockFindFirst.mockResolvedValue(null as never);
        mockJobFindMany.mockResolvedValue([] as never);
        mockCreate.mockResolvedValue(
            makeStudyRow({
                id: "study_new",
                title: "Turner et al. 2016",
                authors: "Unknown",
                year: 2016,
                details: { doi: "10.1097/j.pain.0000000000000635", addedVia: "chat_mention" },
            }) as never
        );
    });

    it("returns existing study when DOI already exists in ledger", async () => {
        mockFindMany.mockResolvedValueOnce([
            makeStudyRow({ details: { doi: "10.1097/j.pain.0000000000000635" } }),
        ] as never);

        const result = await addMentionedStudy(
            { ownerId: "owner-1", workspaceId: "workspace-1" },
            "project-1",
            { doi: "https://doi.org/10.1097/j.pain.0000000000000635", title: "Turner" }
        );

        expect(result.created).toBe(false);
        expect(result.matchedBy).toBe("doi");
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("creates a pending study with chat mention provenance", async () => {
        const result = await addMentionedStudy(
            { ownerId: "owner-1", workspaceId: "workspace-1" },
            "project-1",
            {
                title: "Turner et al. 2016",
                year: 2016,
                doi: "10.1097/j.pain.0000000000000635",
                sourceUrl: "https://doi.org/10.1097/j.pain.0000000000000635",
            }
        );

        expect(result.created).toBe(true);
        expect(mockCreate).toHaveBeenCalledTimes(1);

        const createArg = mockCreate.mock.calls[0]?.[0] as { data: Record<string, unknown> };
        expect(String(createArg.data.id)).toMatch(/^study_[a-f0-9]{16}$/);
        expect(createArg.data.status).toBe("pending");
        expect(createArg.data.quality).toBe("-");

        const details = createArg.data.details as Record<string, unknown>;
        expect(details.addedVia).toBe("chat_mention");
        expect(details.source).toBe("copilot");
        expect(details.doi).toBe("10.1097/j.pain.0000000000000635");
    });

    it("enforces idempotency via duplicate matching on subsequent add", async () => {
        mockFindMany
            .mockResolvedValueOnce([] as never)
            .mockResolvedValueOnce([
                makeStudyRow({
                    id: "study_new",
                    title: "Turner et al. 2016",
                    details: { doi: "10.1097/j.pain.0000000000000635", addedVia: "chat_mention" },
                }),
            ] as never)
            .mockResolvedValueOnce([
                makeStudyRow({
                    id: "study_new",
                    title: "Turner et al. 2016",
                    details: { doi: "10.1097/j.pain.0000000000000635" },
                }),
            ] as never);

        const first = await addMentionedStudy(
            { ownerId: "owner-1", workspaceId: "workspace-1" },
            "project-1",
            { doi: "10.1097/j.pain.0000000000000635", title: "Turner et al. 2016", year: 2016 }
        );
        const second = await addMentionedStudy(
            { ownerId: "owner-1", workspaceId: "workspace-1" },
            "project-1",
            { doi: "10.1097/j.pain.0000000000000635", title: "Turner et al. 2016", year: 2016 }
        );

        expect(first.created).toBe(true);
        expect(second.created).toBe(false);
        expect(second.matchedBy).toBe("doi");
        expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("falls back to title-year duplicate matching even when mention includes DOI", async () => {
        mockFindMany.mockResolvedValueOnce([
            makeStudyRow({
                title: "Turner et al. 2016",
                year: 2016,
                details: {},
            }),
        ] as never);

        const result = await addMentionedStudy(
            { ownerId: "owner-1", workspaceId: "workspace-1" },
            "project-1",
            { title: "Turner et al. 2016", year: 2016, doi: "10.1097/j.pain.0000000000000635" }
        );

        expect(result.created).toBe(false);
        expect(result.matchedBy).toBe("titleYear");
        expect(mockCreate).not.toHaveBeenCalled();
    });

    it("handles create races by returning existing deterministic-id row", async () => {
        mockFindMany.mockResolvedValueOnce([] as never);
        mockFindFirst
            .mockResolvedValueOnce(null as never)
            .mockResolvedValueOnce(
                makeStudyRow({
                    id: "study_raced",
                    title: "Turner et al. 2016",
                    year: 2016,
                    details: { doi: "10.1097/j.pain.0000000000000635" },
                }) as never
            );
        mockCreate.mockRejectedValueOnce(new Error("Unique constraint failed on the fields: (`id`)"));

        const result = await addMentionedStudy(
            { ownerId: "owner-1", workspaceId: "workspace-1" },
            "project-1",
            { title: "Turner et al. 2016", year: 2016, doi: "10.1097/j.pain.0000000000000635" }
        );

        expect(result.created).toBe(false);
        expect(result.matchedBy).toBe("doi");
        expect(result.study.id).toBe("study_raced");
    });
});
