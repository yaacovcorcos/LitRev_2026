"use client";

import { useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";

import { listConversations } from "@/app/actions/conversations";
import {
    decideConversationRestore,
    markConversationActive,
    readProjectEntryState,
} from "@/lib/project-entry-restore";
import type { ProjectCopilotState } from "@/lib/projectCopilotStorage";
import type { ConversationListItem } from "@/types/copilot-context";

type UseCopilotConversationBootstrapOptions = {
    projectId: string;
    routeConversationId: string | null;
    projectEntryRestoreEnabled: boolean;
    currentConversationIdRef: MutableRefObject<string | null>;
    studyFilterRef: MutableRefObject<string | undefined>;
    selectConversationRef: MutableRefObject<(id: string) => Promise<boolean>>;
    setConversations: Dispatch<SetStateAction<ConversationListItem[]>>;
    setCurrentConversationId: (conversationId: string | null) => void;
    setState: Dispatch<SetStateAction<ProjectCopilotState>>;
    setIsLoadingConversations: Dispatch<SetStateAction<boolean>>;
};

export function useCopilotConversationBootstrap({
    projectId,
    routeConversationId,
    projectEntryRestoreEnabled,
    currentConversationIdRef,
    studyFilterRef,
    selectConversationRef,
    setConversations,
    setCurrentConversationId,
    setState,
    setIsLoadingConversations,
}: UseCopilotConversationBootstrapOptions) {
    useEffect(() => {
        let isActive = true;

        const initializeConversations = async () => {
            if (!projectId) return;

            setIsLoadingConversations(true);
            try {
                const result = await listConversations({
                    projectId,
                    studyId: studyFilterRef.current,
                });
                if (!result.success) {
                    console.error("Failed to load conversations:", result.error);
                    return;
                }
                const mapped = result.data.map((c) => ({
                    id: c.id,
                    title: c.title,
                    messageCount: c.messageCount,
                    updatedAt: c.updatedAt,
                }));

                if (!isActive) return;
                setConversations(mapped);
                if (!currentConversationIdRef.current && mapped.length > 0) {
                    if (routeConversationId) {
                        setCurrentConversationId(null);
                        setState((prev) => ({ ...prev, messages: [] }));
                        return;
                    }
                    if (!projectEntryRestoreEnabled) {
                        await selectConversationRef.current(mapped[0].id);
                        return;
                    }
                    const entryState = readProjectEntryState(projectId);
                    const decision = decideConversationRestore(
                        entryState,
                        Date.now(),
                        new Set(mapped.map((c) => c.id)),
                    );
                    if (decision.shouldRestore) {
                        await selectConversationRef.current(decision.conversationId);
                        return;
                    }
                    if (process.env.NODE_ENV !== "production") {
                        console.debug("[project-entry-restore] conversation init decision", {
                            projectId,
                            reason: decision.reason,
                        });
                    }
                    if (decision.reason === "id_invalid" || decision.reason === "no_state") {
                        await selectConversationRef.current(mapped[0].id);
                        return;
                    }
                    setCurrentConversationId(null);
                    setState((prev) => ({ ...prev, messages: [] }));
                }
            } catch (err) {
                console.error("Failed to load conversations:", err);
            } finally {
                if (isActive) {
                    setIsLoadingConversations(false);
                }
            }
        };

        initializeConversations();

        return () => {
            isActive = false;
        };
    }, [
        currentConversationIdRef,
        projectEntryRestoreEnabled,
        projectId,
        routeConversationId,
        selectConversationRef,
        setConversations,
        setCurrentConversationId,
        setIsLoadingConversations,
        setState,
        studyFilterRef,
    ]);
}

export function markProjectConversationActive(
    projectEntryRestoreEnabled: boolean,
    projectId: string,
    conversationId: string,
) {
    if (!projectEntryRestoreEnabled) return;
    markConversationActive(projectId, conversationId);
}
