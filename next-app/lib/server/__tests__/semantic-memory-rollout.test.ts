import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateSemanticRolloutStatus } from "@/lib/server/memory/semantic-memory";

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        $queryRaw: vi.fn(),
    },
}));

const { prisma } = await import("@/lib/server/prisma");
const mockQueryRaw = vi.mocked(prisma.$queryRaw);

describe("semantic rollout status", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns healthy false without querying counts when embedding table is missing", async () => {
        mockQueryRaw
            .mockResolvedValueOnce([{ installed: true }] as never)
            .mockResolvedValueOnce([{ present: false }] as never);

        const status = await validateSemanticRolloutStatus();

        expect(status.extensionInstalled).toBe(true);
        expect(status.embeddingTablePresent).toBe(false);
        expect(status.hnswIndexPresent).toBe(false);
        expect(status.totalEmbeddings).toBe(0);
        expect(status.healthy).toBe(false);
        expect(mockQueryRaw).toHaveBeenCalledTimes(2);
    });

    it("returns safe fallback status and logs when queries fail", async () => {
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        mockQueryRaw.mockRejectedValueOnce(new Error("db unavailable") as never);

        const status = await validateSemanticRolloutStatus();

        expect(status).toMatchObject({
            extensionInstalled: false,
            embeddingTablePresent: false,
            hnswIndexPresent: false,
            totalEmbeddings: 0,
            healthy: false,
        });
        expect(errorSpy).toHaveBeenCalled();
        errorSpy.mockRestore();
    });
});
