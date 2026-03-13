import { describe, expect, it } from "vitest";

import { createQueuedFollowUp, isQueuedFollowUpDispatchReady } from "../queued-followup";

describe("queued follow-up helpers", () => {
    it("trims queued follow-up text and preserves send context", () => {
        const queued = createQueuedFollowUp({
            text: "  Review the latest trials  ",
            conversationId: "conv-1",
            page: "overview",
            section: "eligibility",
            model: "gpt-5.2",
            agentMode: "general",
            source: "draft",
        });

        expect(queued.text).toBe("Review the latest trials");
        expect(queued.conversationId).toBe("conv-1");
        expect(queued.page).toBe("overview");
        expect(queued.section).toBe("eligibility");
        expect(queued.model).toBe("gpt-5.2");
        expect(queued.agentMode).toBe("general");
    });

    it("dispatches only when the host is truly sendable and the conversation still matches", () => {
        const queued = createQueuedFollowUp({
            text: "Find one more RCT",
            conversationId: "conv-1",
            page: "overview",
            source: "draft",
        });

        expect(isQueuedFollowUpDispatchReady({
            queuedFollowUp: queued,
            isLoading: false,
            hasPendingChoices: false,
            hasPendingUserInput: false,
            sendLocked: false,
            currentConversationId: "conv-1",
        })).toBe(true);

        expect(isQueuedFollowUpDispatchReady({
            queuedFollowUp: queued,
            isLoading: true,
            hasPendingChoices: false,
            hasPendingUserInput: false,
            sendLocked: false,
            currentConversationId: "conv-1",
        })).toBe(false);

        expect(isQueuedFollowUpDispatchReady({
            queuedFollowUp: queued,
            isLoading: false,
            hasPendingChoices: true,
            hasPendingUserInput: false,
            sendLocked: false,
            currentConversationId: "conv-1",
        })).toBe(false);

        expect(isQueuedFollowUpDispatchReady({
            queuedFollowUp: queued,
            isLoading: false,
            hasPendingChoices: false,
            hasPendingUserInput: true,
            sendLocked: false,
            currentConversationId: "conv-1",
        })).toBe(false);

        expect(isQueuedFollowUpDispatchReady({
            queuedFollowUp: queued,
            isLoading: false,
            hasPendingChoices: false,
            hasPendingUserInput: false,
            sendLocked: false,
            currentConversationId: "conv-2",
        })).toBe(false);
    });
});

