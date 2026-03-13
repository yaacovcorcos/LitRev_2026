import type { QueuedFollowUp } from "@/types/queued-followup";

type CreateQueuedFollowUpInput = Omit<QueuedFollowUp, "id" | "createdAt">;

export function createQueuedFollowUp(input: CreateQueuedFollowUpInput): QueuedFollowUp {
    const trimmed = input.text.trim();
    if (!trimmed) {
        throw new Error("Queued follow-up text must be non-empty.");
    }

    const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `queued-follow-up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    return {
        ...input,
        id,
        text: trimmed,
        createdAt: Date.now(),
    };
}

export type QueuedFollowUpDispatchState = {
    queuedFollowUp: QueuedFollowUp | null;
    isLoading: boolean;
    hasPendingChoices: boolean;
    hasPendingUserInput: boolean;
    sendLocked: boolean;
    currentConversationId: string | null;
};

export function isQueuedFollowUpDispatchReady(state: QueuedFollowUpDispatchState): boolean {
    if (!state.queuedFollowUp) return false;
    if (state.isLoading) return false;
    if (state.hasPendingChoices) return false;
    if (state.hasPendingUserInput) return false;
    if (state.sendLocked) return false;
    if (state.queuedFollowUp.conversationId !== state.currentConversationId) return false;
    return true;
}

