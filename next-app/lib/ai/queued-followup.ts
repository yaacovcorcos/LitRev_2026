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

export function bindQueuedFollowUpConversationId(
    queuedFollowUp: QueuedFollowUp | null,
    conversationId: string | null,
): QueuedFollowUp | null {
    if (!queuedFollowUp) return null;
    if (!conversationId) return queuedFollowUp;
    if (queuedFollowUp.conversationId !== null) return queuedFollowUp;
    return {
        ...queuedFollowUp,
        conversationId,
    };
}

export function getQueuedFollowUpScopeKey(
    projectScopeId: string | null | undefined,
    conversationId: string | null | undefined,
): string {
    return `${projectScopeId ?? "__global__"}:${conversationId ?? "__new__"}`;
}

export function reconcileQueuedFollowUpScopeChange(
    queuedFollowUp: QueuedFollowUp | null,
    previousScopeKey: string | null,
    nextScopeKey: string,
): QueuedFollowUp | null {
    if (!queuedFollowUp || previousScopeKey === null || previousScopeKey === nextScopeKey) {
        return queuedFollowUp;
    }

    const [previousProjectScope, previousConversationScope] = previousScopeKey.split(":", 2);
    const [nextProjectScope, nextConversationScope] = nextScopeKey.split(":", 2);
    const canBindLateQueuedFollowUp = queuedFollowUp.conversationId === null
        && previousProjectScope === nextProjectScope
        && previousConversationScope === "__new__"
        && nextConversationScope !== "__new__";

    return canBindLateQueuedFollowUp ? queuedFollowUp : null;
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
    if (state.currentConversationId === null) return false;
    if (state.queuedFollowUp.conversationId !== state.currentConversationId) return false;
    return true;
}
