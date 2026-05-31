import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server/prisma", () => ({
    prisma: {},
}));

const { setUserMemoryWithDb } = await import("@/lib/server/memory/user-memory");

describe("user memory upsert lifecycle", () => {
    const upsert = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        upsert.mockResolvedValue({ id: "um-1" });
    });

    it("reactivates an archived same-key memory when remembering it again", async () => {
        await setUserMemoryWithDb({
            userMemory: { upsert },
        } as never, {
            userId: "user-1",
            type: "preference",
            key: "citation_style",
            value: "Use APA 7th",
            rationale: "User explicitly asked for APA.",
        });

        expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                userId_key: { userId: "user-1", key: "citation_style" },
            },
            update: expect.objectContaining({
                value: "Use APA 7th",
                rationale: "User explicitly asked for APA.",
                status: "active",
                archivedAt: null,
                embeddingStatus: "pending",
            }),
        }));
    });
});
