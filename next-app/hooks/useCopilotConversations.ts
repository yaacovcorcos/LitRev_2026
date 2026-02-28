/**
 * Custom hook encapsulating all conversation management logic
 * extracted from ProjectCopilotContext.tsx for maintainability.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type {
    CopilotMessage,
    ProjectCopilotState,
} from "@/lib/projectCopilotStorage";
import type { ArtifactData, ArtifactStatus, ArtifactType } from "@/types/artifacts";
import type { ChoiceOption, CopilotPage, UserInputRequest } from "@/types/ai";
import type { ConversationListItem } from "@/types/copilot-context";
import {
    listConversations,
    getConversation,
    getConversationMessages,
    createConversation,
    archiveConversation,
    branchConversation as branchConversationAction,
    updateConversationTitle,
} from "@/app/actions/conversations";
import { summarizeConversationAction } from "@/app/actions/summarize-conversation";

/** Dependencies injected by the provider. */
export type CopilotConversationsDeps = {
    projectId: string;
    updateState: (updater: (prev: ProjectCopilotState) => ProjectCopilotState) => void;
    setState: React.Dispatch<React.SetStateAction<ProjectCopilotState>>;
    stateRef: React.MutableRefObject<ProjectCopilotState>;
    artifacts: Map<string, ArtifactData>;
    setArtifacts: React.Dispatch<React.SetStateAction<Map<string, ArtifactData>>>;
    streamGenRef: React.MutableRefObject<number>;
    abortControllerRef: React.MutableRefObject<AbortController | null>;
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
    setCurrentRunId: React.Dispatch<React.SetStateAction<string | null>>;
    setPendingChoices: React.Dispatch<React.SetStateAction<ChoiceOption[]>>;
    setPendingUserInput: React.Dispatch<React.SetStateAction<UserInputRequest | null>>;
};

export function useCopilotConversations(deps: CopilotConversationsDeps) {
    const {
        projectId,
        updateState,
        setState,
        stateRef,
        artifacts,
        setArtifacts,
        streamGenRef,
        abortControllerRef,
        setIsLoading,
        setCurrentRunId,
        setPendingChoices,
        setPendingUserInput,
    } = deps;

    // Conversation management state
    const [conversations, setConversations] = useState<ConversationListItem[]>([]);
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
    const [isLoadingConversations, setIsLoadingConversations] = useState(false);
    const [showConversationList, setShowConversationList] = useState(false);
    const [isConversationLoading, setIsConversationLoading] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [isLoadingOlder, setIsLoadingOlder] = useState(false);
    // Generation counter for selectConversation — last-wins guard against rapid switches
    const selectGenRef = useRef(0);

    // Study filter for conversation scoping (ref to avoid re-render loops)
    const studyFilterRef = useRef<string | undefined>(undefined);

    // Per-scope conversation memory: scope key → conversation ID
    const scopeConversationMapRef = useRef<Map<string, string>>(new Map());
    // Mirror currentConversationId to ref so setStudyFilter can read without deps
    const currentConversationIdRef = useRef<string | null>(null);
    // Ref for selectConversation (defined later) to avoid forward-reference in setStudyFilter
    const selectConversationRef = useRef<(id: string) => Promise<void>>(async () => {});

    // Summarize state
    const [isSummarizing, setIsSummarizing] = useState(false);

    // Mirror currentConversationId to ref for scope-switch reads
    useEffect(() => { currentConversationIdRef.current = currentConversationId; }, [currentConversationId]);

    // Project switch guard: clear scope-cached conversation IDs and active conversation state.
    // Prevents restoring/selecting a conversation from a previous project.
    useEffect(() => {
        streamGenRef.current++;
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsLoading(false);
        setCurrentRunId(null);
        setPendingChoices([]);
        setPendingUserInput(null);
        setConversations([]);
        setCurrentConversationId(null);
        currentConversationIdRef.current = null;
        studyFilterRef.current = undefined;
        scopeConversationMapRef.current.clear();
        setState((prev) => ({ ...prev, messages: [] }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);

    // Load conversations list (uses studyFilterRef for scoping)
    const loadConversations = useCallback(async (): Promise<void> => {
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
            setConversations(mapped);
        } catch (err) {
            console.error("Failed to load conversations:", err);
        } finally {
            setIsLoadingConversations(false);
        }
    }, [projectId]);

    // Set study filter for conversation scoping (scope-keyed save/restore)
    const setStudyFilter = useCallback((id: string | undefined) => {
        if (studyFilterRef.current === id) return;

        // Scope switch must invalidate any in-flight stream to prevent cross-scope ghost updates.
        streamGenRef.current++;
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsLoading(false);
        setCurrentRunId(null);
        setPendingChoices([]);
        setPendingUserInput(null);

        const projectScope = projectId || "no-project";
        const toScopeKey = (v: string | undefined) => (
            v ? `${projectScope}:study:${v}` : `${projectScope}:project`
        );
        const oldScope = toScopeKey(studyFilterRef.current);
        const newScope = toScopeKey(id);

        // Save current conversation ID for the old scope
        const curId = currentConversationIdRef.current;
        if (curId) {
            scopeConversationMapRef.current.set(oldScope, curId);
        }

        // Update filter
        studyFilterRef.current = id;

        // Check if we have a saved conversation for the new scope
        const savedId = scopeConversationMapRef.current.get(newScope);
        if (savedId) {
            // Restore from DB (source of truth) via ref
            selectConversationRef.current(savedId).catch(() => {
                // Conversation may have been deleted — clear stale entry
                scopeConversationMapRef.current.delete(newScope);
                setCurrentConversationId(null);
                setState((prev) => ({ ...prev, messages: [] }));
            });
        } else {
            // No saved conversation for this scope — clear
            setCurrentConversationId(null);
            setState((prev) => ({ ...prev, messages: [] }));
        }

        loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadConversations, projectId]);

    // Initial load: get conversations and auto-select the most recent one
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
                    const scopeKey = studyFilterRef.current
                        ? `${projectId}:study:${studyFilterRef.current}`
                        : `${projectId}:project`;
                    const saved = scopeConversationMapRef.current.get(scopeKey);
                    const targetConversationId = saved && mapped.some((c) => c.id === saved)
                        ? saved
                        : mapped[0].id;
                    scopeConversationMapRef.current.set(scopeKey, targetConversationId);
                    await selectConversationRef.current(targetConversationId);
                }
            } catch (err) {
                console.error("Failed to load conversations:", err);
            } finally {
                if (isActive) setIsLoadingConversations(false);
            }
        };

        initializeConversations();

        return () => {
            isActive = false;
        };
    // Only run once on mount, not when currentConversationId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);

    const toggleConversationList = useCallback(() => {
        setShowConversationList((prev) => !prev);
    }, []);

    const selectConversation = useCallback(async (conversationId: string) => {
        // Each call claims a generation slot. State writes after the await are
        // guarded so only the last caller (newest selection) applies results.
        const gen = ++selectGenRef.current;
        try {
            // Switching conversations must invalidate any in-flight stream to prevent ghost updates.
            streamGenRef.current++;
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
            setIsLoading(false);
            setCurrentRunId(null);
            setPendingChoices([]);
            setPendingUserInput(null);
            if (!projectId) return;
            setIsConversationLoading(true);
            const convoResult = await getConversation(conversationId, { expectedProjectId: projectId });
            // Bail if a newer selectConversation call has already taken over.
            if (gen !== selectGenRef.current) return;
            const convo = convoResult.success ? convoResult.data : null;
            if (convo) {
                setCurrentConversationId(convo.id);
                setHasMore(convo.hasMore);
                // Convert conversation messages to CopilotMessages
                const persistedMessages: CopilotMessage[] = convo.messages
                    .filter((m) => m.role !== "system")
                    .map((m) => ({
                        id: m.id,
                        sender: m.role === "user" ? "user" : "ai",
                        text: m.content,
                        createdAt: m.createdAt,
                        context: { page: convo.page as CopilotPage },
                        attachments: m.attachments?.map((a) => ({
                            fileAssetId: a.fileAssetId,
                            filename: a.filename,
                            size: a.size,
                            mimeType: a.mimeType,
                            isExisting: a.isExisting,
                        })),
                    }));
                // Filter artifacts to only those within the loaded message time range
                const oldestMessageTime = persistedMessages.length > 0
                    ? new Date(persistedMessages[0].createdAt).getTime()
                    : 0;
                const artifactMessages: CopilotMessage[] = (convo.artifacts ?? [])
                    .filter((a) => new Date(a.createdAt).getTime() >= oldestMessageTime)
                    .map((artifact) => ({
                        id: `artifact-${artifact.id}`,
                        sender: "ai",
                        text: `[${artifact.type}] ${artifact.title}`,
                        createdAt: artifact.createdAt,
                        context: { page: convo.page as CopilotPage },
                        artifact: {
                            id: artifact.id,
                            type: artifact.type,
                            status: artifact.status,
                            title: artifact.title,
                            payload: (artifact.payload ?? {}) as Record<string, unknown>,
                            version: artifact.version,
                        },
                    }));
                const copilotMessages: CopilotMessage[] = [...persistedMessages, ...artifactMessages].sort(
                    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
                );
                setArtifacts(() => {
                    const next = new Map<string, ArtifactData>();
                    for (const artifact of convo.artifacts ?? []) {
                        next.set(artifact.id, {
                            id: artifact.id,
                            runId: "",
                            projectId: convo.projectId ?? projectId,
                            conversationId: convo.id,
                            type: artifact.type as ArtifactType,
                            status: artifact.status as ArtifactStatus,
                            title: artifact.title,
                            payload: artifact.payload,
                            version: artifact.version,
                            sourceEventId: null,
                            appliedAt: null,
                            reviewedAt: null,
                            reviewNote: null,
                            createdAt: artifact.createdAt,
                        });
                    }
                    return next;
                });
                updateState((prev) => ({
                    ...prev,
                    messages: copilotMessages,
                }));
            } else {
                setCurrentConversationId(null);
                setHasMore(false);
                setArtifacts(new Map());
                updateState((prev) => ({
                    ...prev,
                    messages: [],
                }));
            }
        } catch (err) {
            if (gen !== selectGenRef.current) return;
            console.error("Failed to select conversation:", err);
        } finally {
            // Only the winning generation clears the loading flag.
            if (gen === selectGenRef.current) {
                setIsConversationLoading(false);
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [updateState, projectId]);

    // Keep ref in sync so setStudyFilter (declared earlier) can call it
    selectConversationRef.current = selectConversation;

    const loadOlderMessages = useCallback(async () => {
        if (!currentConversationId || isLoadingOlder || !hasMore) return;
        const currentMessages = stateRef.current.messages;
        const conversationPage = (
            currentMessages.find((m) => !m.artifact)?.context?.page
            ?? "overview"
        ) as CopilotPage;
        // Find oldest non-artifact message for cursor
        const oldestMsg = currentMessages.find((m) => !m.artifact);
        if (!oldestMsg) return;
        setIsLoadingOlder(true);
        try {
            const result = await getConversationMessages({
                conversationId: currentConversationId,
                cursor: { createdAt: oldestMsg.createdAt, id: oldestMsg.id },
                expectedProjectId: projectId,
            });
            if (!result.success) return;
            setHasMore(result.data.hasMore);

            const olderCopilotMessages: CopilotMessage[] = result.data.messages
                .filter((m) => m.role !== "system")
                .map((m) => ({
                    id: m.id,
                    sender: m.role === "user" ? "user" : "ai" as const,
                    text: m.content,
                    createdAt: m.createdAt,
                    context: { page: conversationPage },
                    attachments: m.attachments?.map((a) => ({
                        fileAssetId: a.fileAssetId,
                        filename: a.filename,
                        size: a.size,
                        mimeType: a.mimeType,
                        isExisting: a.isExisting,
                    })),
                }));

            // Include any artifacts that are now within the expanded time range
            const oldestNewTime = olderCopilotMessages.length > 0
                ? new Date(olderCopilotMessages[0].createdAt).getTime()
                : Infinity;
            const existingMessageIds = new Set(currentMessages.map((m) => m.id));
            const allArtifacts = Array.from(artifacts.values());
            const newlyVisibleArtifactMessages: CopilotMessage[] = allArtifacts
                .filter((a) => {
                    const aTime = new Date(a.createdAt).getTime();
                    return aTime >= oldestNewTime && !existingMessageIds.has(`artifact-${a.id}`);
                })
                .map((a) => ({
                    id: `artifact-${a.id}`,
                    sender: "ai" as const,
                    text: `[${a.type}] ${a.title}`,
                    createdAt: a.createdAt,
                    context: { page: conversationPage },
                    artifact: {
                        id: a.id,
                        type: a.type,
                        status: a.status,
                        title: a.title,
                        payload: (a.payload ?? {}) as Record<string, unknown>,
                        version: a.version,
                    },
                }));

            // Sort newly revealed items (older messages + newly visible artifacts)
            const combined = [...olderCopilotMessages, ...newlyVisibleArtifactMessages].sort(
                (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
            );

            // Direct prepend — older batch guaranteed strictly before current oldest
            updateState((prev) => ({
                ...prev,
                messages: [...combined, ...prev.messages],
            }));
        } catch (err) {
            console.error("Failed to load older messages:", err);
        } finally {
            setIsLoadingOlder(false);
        }
    }, [currentConversationId, isLoadingOlder, hasMore, updateState, artifacts, projectId, stateRef]);

    const newConversation = useCallback(async (page: CopilotPage, studyId?: string) => {
        if (!projectId) {
            console.error("Cannot create conversation: no projectId");
            return;
        }
        // Starting a new conversation must stop any active stream first.
        streamGenRef.current++;
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsLoading(false);
        setCurrentRunId(null);
        setPendingChoices([]);
        setPendingUserInput(null);
        try {
            const convResult = await createConversation({
                projectId,
                studyId,
                page,
                context: studyId ? "study" : "project",
            });
            if (!convResult.success) {
                console.error("Failed to create conversation:", convResult.error);
                return;
            }
            const { id } = convResult.data;
            // Set the new conversation and clear messages
            setCurrentConversationId(id);
            setHasMore(false);
            setState((prev) => ({
                ...prev,
                messages: [],
            }));
            // Refresh conversation list
            await loadConversations();
        } catch (err) {
            console.error("Failed to create conversation:", err);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, loadConversations]);

    const renameConversation = useCallback(async (conversationId: string, title: string) => {
        try {
            const result = await updateConversationTitle(conversationId, title);
            if (!result.success) {
                console.error("Failed to rename conversation:", result.error);
                return;
            }
            setConversations((prev) =>
                prev.map((c) =>
                    c.id === conversationId ? { ...c, title } : c
                )
            );
        } catch (err) {
            console.error("Failed to rename conversation:", err);
        }
    }, []);

    const deleteConversationHandler = useCallback(async (conversationId: string) => {
        try {
            const result = await archiveConversation(conversationId);
            if (!result.success) {
                console.error("Failed to delete conversation:", result.error);
                return;
            }
            setConversations((prev) => prev.filter((c) => c.id !== conversationId));
            if (currentConversationId === conversationId) {
                setCurrentConversationId(null);
                updateState((prev) => ({
                    ...prev,
                    messages: [],
                }));
            }
        } catch (err) {
            console.error("Failed to delete conversation:", err);
        }
    }, [currentConversationId, updateState]);

    const branchConversationHandler = useCallback(async (
        conversationId: string,
        upToMessageId?: string,
        upToCreatedAt?: string
    ) => {
        if (!projectId) return;
        try {
            // Branching is a context switch; stop active stream before switching.
            streamGenRef.current++;
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
            }
            setIsLoading(false);
            setCurrentRunId(null);
            setPendingChoices([]);
            setPendingUserInput(null);

            const branchResult = await branchConversationAction({ conversationId, upToMessageId, upToCreatedAt });
            if (!branchResult.success) {
                console.error("Failed to branch conversation:", branchResult.error);
                return;
            }
            await loadConversations();
            await selectConversation(branchResult.data.id);
        } catch (err) {
            console.error("Failed to branch conversation:", err);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId, loadConversations, selectConversation]);

    const summarizeAndRefresh = useCallback(async () => {
        if (!currentConversationId || isSummarizing) return;
        setIsSummarizing(true);
        try {
            const result = await summarizeConversationAction(currentConversationId);
            if (!result.success) throw new Error(result.error);
            // Switch to the new conversation
            await selectConversation(result.data.newConversationId);
            await loadConversations();
        } catch (err) {
            console.error("Failed to summarize conversation:", err);
        } finally {
            setIsSummarizing(false);
        }
    }, [currentConversationId, isSummarizing, selectConversation, loadConversations]);

    return {
        // State
        conversations,
        currentConversationId,
        isLoadingConversations,
        showConversationList,
        isConversationLoading,
        hasMore,
        isLoadingOlder,
        isSummarizing,
        // Refs (exposed for other hooks)
        currentConversationIdRef,
        studyFilterRef,
        // Setters (exposed for other hooks that need direct conversation updates)
        setConversations,
        setCurrentConversationId,
        setHasMore,
        // Callbacks
        loadConversations,
        setStudyFilter,
        selectConversation,
        loadOlderMessages,
        newConversation,
        renameConversation,
        deleteConversation: deleteConversationHandler,
        branchConversation: branchConversationHandler,
        summarizeAndRefresh,
        toggleConversationList,
    };
}
