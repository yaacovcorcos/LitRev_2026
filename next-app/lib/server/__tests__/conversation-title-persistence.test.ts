import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
    transaction: vi.fn(),
    messageCreate: vi.fn(),
    conversationUpdateMany: vi.fn(),
    conversationUpdate: vi.fn(),
    assertRunWritable: vi.fn(),
    emitEvent: vi.fn(),
    noteRunActivity: vi.fn(),
}));

vi.mock("@/lib/server/prisma", () => ({
    prisma: {
        $transaction: mocks.transaction,
    },
}));

vi.mock("@/lib/server/agent/run", () => ({
    assertRunWritableInTransaction: mocks.assertRunWritable,
    noteObservedRunActivity: mocks.noteRunActivity,
}));

vi.mock("@/lib/server/agent/events", () => ({
    emitEventWithinTransaction: mocks.emitEvent,
}));

vi.mock("@/lib/server/access", () => ({
    assertProjectAccess: vi.fn(),
    assertStudyAccess: vi.fn(),
}));

const { addAssistantMessageToConversationForRun } = await import("@/lib/server/ai/memory");

describe("assistant message title persistence", () => {
    const createdAt = new Date("2026-07-12T12:00:00.000Z");
    const tx = {
        aIMessage: { create: mocks.messageCreate },
        aIConversation: {
            updateMany: mocks.conversationUpdateMany,
            update: mocks.conversationUpdate,
        },
    };

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.transaction.mockImplementation(async (operation) => operation(tx));
        mocks.assertRunWritable.mockResolvedValue(undefined);
        mocks.messageCreate.mockResolvedValue({
            id: "message-1",
            role: "assistant",
            content: "Answer",
            toolCalls: null,
            toolResultId: null,
            createdAt,
        });
        mocks.conversationUpdateMany.mockResolvedValue({ count: 1 });
        mocks.conversationUpdate.mockResolvedValue({ id: "conversation-1" });
        mocks.emitEvent.mockResolvedValue({ id: "event-1", createdAt });
    });

    it("claims a null title atomically with the first assistant message", async () => {
        const result = await addAssistantMessageToConversationForRun({
            runId: "run-1",
            conversationId: "conversation-1",
            content: "Answer",
            fallbackConversationTitle: "Exercise and blood pressure",
        });

        expect(mocks.conversationUpdateMany).toHaveBeenCalledWith({
            where: { id: "conversation-1", title: null },
            data: {
                title: "Exercise and blood pressure",
                updatedAt: expect.any(Date),
            },
        });
        expect(mocks.conversationUpdate).not.toHaveBeenCalled();
        expect(result).toMatchObject({
            id: "message-1",
            conversationTitle: "Exercise and blood pressure",
        });
        expect(mocks.noteRunActivity).toHaveBeenCalledWith("run-1", createdAt);
    });

    it("does not overwrite an existing title", async () => {
        mocks.conversationUpdateMany.mockResolvedValueOnce({ count: 0 });

        const result = await addAssistantMessageToConversationForRun({
            runId: "run-1",
            conversationId: "conversation-1",
            content: "Answer",
            fallbackConversationTitle: "Fallback title",
        });

        expect(mocks.conversationUpdate).toHaveBeenCalledWith({
            where: { id: "conversation-1" },
            data: { updatedAt: expect.any(Date) },
        });
        expect(result).not.toHaveProperty("conversationTitle");
    });
});
