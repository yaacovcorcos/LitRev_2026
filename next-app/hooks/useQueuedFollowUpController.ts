"use client";

import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";

import {
    bindQueuedFollowUpConversationId,
    getQueuedFollowUpScopeKey,
    isQueuedFollowUpDispatchReady,
    reconcileQueuedFollowUpScopeChange,
} from "@/lib/ai/queued-followup";
import type { QueuedFollowUp } from "@/types/queued-followup";

type QueuedFollowUpControllerOptions = {
    projectScopeId: string | null | undefined;
    currentConversationId: string | null;
    queuedFollowUp: QueuedFollowUp | null;
    setQueuedFollowUp: Dispatch<SetStateAction<QueuedFollowUp | null>>;
    isLoading: boolean;
    hasPendingChoices: boolean;
    hasPendingUserInput: boolean;
    sendLocked: boolean;
    dispatchQueuedFollowUp: (queuedFollowUp: QueuedFollowUp) => void | Promise<void>;
};

export function useQueuedFollowUpController({
    projectScopeId,
    currentConversationId,
    queuedFollowUp,
    setQueuedFollowUp,
    isLoading,
    hasPendingChoices,
    hasPendingUserInput,
    sendLocked,
    dispatchQueuedFollowUp,
}: QueuedFollowUpControllerOptions) {
    const dispatchRef = useRef<string | null>(null);
    const scopeRef = useRef<string | null>(null);

    useEffect(() => {
        if (!currentConversationId) return;
        setQueuedFollowUp((current) => bindQueuedFollowUpConversationId(current, currentConversationId));
    }, [currentConversationId, setQueuedFollowUp]);

    useEffect(() => {
        const nextScopeKey = getQueuedFollowUpScopeKey(projectScopeId, currentConversationId);
        const previousScopeKey = scopeRef.current;
        const nextQueuedFollowUp = reconcileQueuedFollowUpScopeChange(
            queuedFollowUp,
            previousScopeKey,
            nextScopeKey,
        );

        scopeRef.current = nextScopeKey;

        if (nextQueuedFollowUp === queuedFollowUp) return;

        dispatchRef.current = null;
        setQueuedFollowUp(nextQueuedFollowUp);
    }, [
        currentConversationId,
        projectScopeId,
        queuedFollowUp,
        setQueuedFollowUp,
    ]);

    useEffect(() => {
        const ready = isQueuedFollowUpDispatchReady({
            queuedFollowUp,
            isLoading,
            hasPendingChoices,
            hasPendingUserInput,
            sendLocked,
            currentConversationId,
        });

        if (!ready || !queuedFollowUp) {
            if (!queuedFollowUp) {
                dispatchRef.current = null;
            }
            return;
        }

        if (dispatchRef.current === queuedFollowUp.id) return;

        dispatchRef.current = queuedFollowUp.id;
        setQueuedFollowUp(null);
        void dispatchQueuedFollowUp(queuedFollowUp);
    }, [
        currentConversationId,
        dispatchQueuedFollowUp,
        hasPendingChoices,
        hasPendingUserInput,
        isLoading,
        queuedFollowUp,
        sendLocked,
        setQueuedFollowUp,
    ]);
}
