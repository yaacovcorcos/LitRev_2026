"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {
    CopilotMessage,
    CopilotMessageAttachment,
    ProjectCopilotState,
    loadProjectCopilotState,
    saveProjectCopilotState,
    createDefaultProjectCopilotState,
} from "@/lib/projectCopilotStorage";
import { processAIStream } from "@/lib/ai/stream-processor";
import { dispatchProjectDataChanged, getChangedDomainsForAcceptedArtifact } from "@/lib/project-data-events";
import {
    listConversations,
    getConversation,
    getConversationMessages,
    createConversation,
    archiveConversation,
    branchConversation as branchConversationAction,
    updateConversationTitle,
} from "@/app/actions/conversations";
import {
    uploadChatAttachmentAction,
    extractTextFromExistingFileAction,
} from "@/app/actions/files";
import { reviewArtifactAction, getAutonomyConfigAction, updateAutonomyAction } from "@/app/actions/agent";
import { summarizeConversationAction } from "@/app/actions/summarize-conversation";
import type { ArtifactData, ArtifactStatus, ArtifactType } from "@/types/artifacts";
import type { AgentMode, AutonomyPreset, AutonomyLevel } from "@/types/agent";
import type { ChoiceOption, CopilotPage, ReasoningMode } from "@/types/ai";
import { handleProjectCopilotStreamChunk } from "@/contexts/project-copilot-stream-events";
import type { ArtifactActionContract } from "@/lib/artifacts/action-contract";
import {
    getReasoningModePreference,
    setReasoningModePreference,
    shouldRequestReasoning,
} from "@/lib/ai/reasoning-visibility";

export type PendingAttachment = {
    fileAssetId: string;
    filename: string;
    size: number;
    mimeType: string;
    extractedText: string;
    isExisting: boolean;
};

type ConversationListItem = {
    id: string;
    title: string | null;
    messageCount: number;
    updatedAt: string;
};

type ProjectCopilotContextValue = {
    /** Current copilot state */
    state: ProjectCopilotState;
    /** All messages in the copilot */
    messages: CopilotMessage[];
    /** Whether the panel is collapsed */
    isCollapsed: boolean;
    /** Current panel width */
    panelWidth: number;
    /** Whether AI is loading */
    isLoading: boolean;
    /** Reasoning visibility mode (off/summary/full) */
    reasoningMode: ReasoningMode;
    /** Toggle the panel collapsed state */
    toggleCollapsed: () => void;
    /** Set the panel collapsed state */
    setCollapsed: (collapsed: boolean) => void;
    /** Update the panel width */
    setPanelWidth: (width: number) => void;
    /** Send a message to the copilot */
    sendMessage: (text: string, page: CopilotPage, section?: string, model?: string, agentMode?: AgentMode, studyId?: string) => void;
    /** Update global reasoning visibility mode */
    setReasoningMode: (mode: ReasoningMode) => void;
    /** Cancel the current stream */
    cancelStream: () => void;
    /** Clear all messages */
    clearMessages: () => void;

    // Conversation management
    /** List of available conversations */
    conversations: ConversationListItem[];
    /** Current active conversation ID */
    currentConversationId: string | null;
    /** Whether conversations are loading */
    isLoadingConversations: boolean;
    /** Whether conversation sidebar is shown */
    showConversationList: boolean;
    /** Toggle conversation sidebar */
    toggleConversationList: () => void;
    /** Select a conversation */
    selectConversation: (conversationId: string) => Promise<void>;
    /** Create a new conversation */
    newConversation: (page: CopilotPage, studyId?: string) => Promise<void>;
    /** Rename a conversation */
    renameConversation: (conversationId: string, title: string) => Promise<void>;
    /** Delete a conversation */
    deleteConversation: (conversationId: string) => Promise<void>;
    /** Branch a conversation into a new forked conversation */
    branchConversation: (conversationId: string, upToMessageId?: string, upToCreatedAt?: string) => Promise<void>;
    /** Refresh conversation list */
    refreshConversations: () => Promise<void>;
    /** Set study filter for conversation scoping (undefined = show all) */
    setStudyFilter: (studyId: string | undefined) => void;

    // Attachment support
    /** Currently pending attachment (uploaded but not yet sent) */
    pendingAttachment: PendingAttachment | null;
    /** Whether an attachment is being uploaded/processed */
    isAttaching: boolean;
    /** Upload a new PDF and prepare it as an attachment */
    attachFile: (file: File) => Promise<void>;
    /** Attach an existing study PDF by its FileAsset ID */
    attachExistingFile: (fileAssetId: string) => Promise<void>;
    /** Remove the pending attachment */
    clearAttachment: () => void;
    /** Project ID for the current copilot */
    projectId: string;

    // Agent run state (planC Phase 2)
    /** Current active run ID (null when no agent is running) */
    currentRunId: string | null;
    /** Artifacts map for quick lookup by ID */
    artifacts: Map<string, ArtifactData>;
    /** Review an artifact (accept/reject) */
    handleReviewArtifact: (artifactId: string, status: "accepted" | "rejected", note?: string, editedPayload?: Record<string, unknown>) => Promise<void>;
    /** Execute a plan artifact (run selected steps) */
    executePlan: (artifactId: string, selectedIndexes: number[]) => void;

    // Summarize & fresh
    /** Whether the conversation is long enough to offer summarization */
    shouldOfferSummary: boolean;
    /** Summarize current conversation and start fresh */
    summarizeAndRefresh: () => Promise<void>;
    /** Whether summarization is in progress */
    isSummarizing: boolean;
    /** Whether a conversation is being fetched from the server (shows skeleton in TimelineRenderer) */
    isConversationLoading: boolean;

    // Autonomy configuration (Phase 7)
    /** Current autonomy preset */
    autonomyPreset: AutonomyPreset;
    /** Current per-tool overrides */
    autonomyToolOverrides: Record<string, AutonomyLevel>;
    /** Whether autonomy settings modal is open */
    showAutonomySettings: boolean;
    /** Open/close autonomy settings modal */
    setShowAutonomySettings: (show: boolean) => void;
    /** Update the active preset (clears overrides) */
    updateAutonomyPreset: (preset: AutonomyPreset) => Promise<void>;
    /** Update per-tool overrides (switches to "custom" preset) */
    updateAutonomyOverrides: (overrides: Record<string, AutonomyLevel>) => Promise<void>;
    /** Reset to a named preset (clears overrides) */
    resetToPreset: (preset: AutonomyPreset) => Promise<void>;

    // AI-generated clickable choices
    /** Current pending choices from AI (shown as pills above input) */
    pendingChoices: ChoiceOption[];
    /** Clear pending choices */
    clearChoices: () => void;

    // Message pagination
    /** Whether there are older messages available to load */
    hasMore: boolean;
    /** Whether older messages are currently being fetched */
    isLoadingOlder: boolean;
    /** Load the next page of older messages */
    loadOlderMessages: () => Promise<void>;
};


const ProjectCopilotContext = createContext<ProjectCopilotContextValue | undefined>(undefined);

type ProjectCopilotProviderProps = {
    projectId: string;
    children: ReactNode;
};

export function ProjectCopilotProvider({ projectId, children }: ProjectCopilotProviderProps) {
    const [state, setState] = useState<ProjectCopilotState>(createDefaultProjectCopilotState());
    const stateRef = useRef<ProjectCopilotState>(createDefaultProjectCopilotState());
    const [isLoading, setIsLoading] = useState(false);
    const [reasoningMode, setReasoningModeState] = useState<ReasoningMode>(() => getReasoningModePreference());
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const streamGenRef = useRef(0);
    const isLoadingRef = useRef(false);

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

    // Attachment state
    const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
    const [isAttaching, setIsAttaching] = useState(false);

    // Agent run state (Phase 2)
    const [currentRunId, setCurrentRunId] = useState<string | null>(null);
    const [artifacts, setArtifacts] = useState<Map<string, ArtifactData>>(new Map());

    // Summarize state
    const [isSummarizing, setIsSummarizing] = useState(false);
    const shouldOfferSummary = state.messages.length > 20;

    // AI-generated clickable choices
    const [pendingChoices, setPendingChoices] = useState<ChoiceOption[]>([]);

    // Autonomy configuration state (Phase 7)
    const [autonomyPreset, setAutonomyPreset] = useState<AutonomyPreset>("assisted");
    const [autonomyToolOverrides, setAutonomyToolOverrides] = useState<Record<string, AutonomyLevel>>({});
    const [showAutonomySettings, setShowAutonomySettings] = useState(false);

    // Load panel state from localStorage on mount (not messages - those come from conversations)
    useEffect(() => {
        if (projectId) {
            // Only load panel state (width, collapsed), not messages
            const local = loadProjectCopilotState(projectId);
            setState(prev => ({
                ...prev,
                panel: local.panel,
                // Messages will be loaded from the conversation system
                messages: [],
            }));
        }
    }, [projectId]);

    const setReasoningMode = useCallback((mode: ReasoningMode) => {
        setReasoningModeState(mode);
        setReasoningModePreference(mode);
    }, []);

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
        setConversations([]);
        setCurrentConversationId(null);
        currentConversationIdRef.current = null;
        studyFilterRef.current = undefined;
        scopeConversationMapRef.current.clear();
        setState((prev) => ({ ...prev, messages: [] }));
    }, [projectId]);

    // Load autonomy config on mount (Phase 7)
    useEffect(() => {
        getAutonomyConfigAction(projectId)
            .then((result) => {
                if (result.success && result.config) {
                    setAutonomyPreset(result.config.preset as AutonomyPreset);
                    setAutonomyToolOverrides(
                        (result.config.toolOverrides ?? {}) as Record<string, AutonomyLevel>,
                    );
                }
            })
            .catch(console.error);
    }, [projectId]);

    // Mirror isLoading to ref so sendMessage can read it without stale closures
    useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);
    useEffect(() => { stateRef.current = state; }, [state]);

    // Mirror currentConversationId to ref for scope-switch reads
    useEffect(() => { currentConversationIdRef.current = currentConversationId; }, [currentConversationId]);

    const updateAutonomyPreset = useCallback(async (preset: AutonomyPreset) => {
        setAutonomyPreset(preset);
        setAutonomyToolOverrides({});
        await updateAutonomyAction(preset, undefined, projectId).catch(console.error);
    }, [projectId]);

    const updateAutonomyOverrides = useCallback(async (overrides: Record<string, AutonomyLevel>) => {
        setAutonomyToolOverrides(overrides);
        setAutonomyPreset("custom");
        await updateAutonomyAction("custom", overrides, projectId).catch(console.error);
    }, [projectId]);

    const resetToPreset = useCallback(async (preset: AutonomyPreset) => {
        setAutonomyPreset(preset);
        setAutonomyToolOverrides({});
        await updateAutonomyAction(preset, undefined, projectId).catch(console.error);
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

    // Save panel state with debounce (messages are saved via conversation system)
    const scheduleSave = useCallback(
        (next: ProjectCopilotState) => {
            if (!projectId) return;
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
            saveTimerRef.current = setTimeout(() => {
                // Only save panel state to localStorage, not messages
                const panelOnlyState: ProjectCopilotState = {
                    ...next,
                    messages: [], // Don't persist messages to localStorage
                };
                saveProjectCopilotState(projectId, panelOnlyState);
            }, 400);
        },
        [projectId]
    );

    const updateState = useCallback(
        (updater: (prev: ProjectCopilotState) => ProjectCopilotState) => {
            setState((prev) => {
                const next = updater(prev);
                if (next === prev) return prev;
                scheduleSave(next);
                return next;
            });
        },
        [scheduleSave]
    );

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    const toggleCollapsed = useCallback(() => {
        updateState((prev) => ({
            ...prev,
            panel: { ...prev.panel, collapsed: !prev.panel.collapsed },
        }));
    }, [updateState]);

    const setCollapsed = useCallback(
        (collapsed: boolean) => {
            updateState((prev) => ({
                ...prev,
                panel: { ...prev.panel, collapsed },
            }));
        },
        [updateState]
    );

    const setPanelWidth = useCallback(
        (width: number) => {
            updateState((prev) => ({
                ...prev,
                panel: { ...prev.panel, width, collapsed: false },
            }));
        },
        [updateState]
    );

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
    }, [currentConversationId, isLoadingOlder, hasMore, updateState, artifacts, projectId]);

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
    }, [projectId, loadConversations, selectConversation]);

    const attachFile = useCallback(async (file: File) => {
        if (!projectId) return;
        setIsAttaching(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const result = await uploadChatAttachmentAction(projectId, formData);
            if (!result.success) {
                console.error("Failed to upload attachment:", result.error);
                return;
            }
            setPendingAttachment({
                fileAssetId: result.data.fileAssetId,
                filename: result.data.filename,
                size: result.data.size,
                mimeType: result.data.mimeType,
                extractedText: result.data.extractedText,
                isExisting: false,
            });
        } catch (err) {
            console.error("Failed to upload attachment:", err);
        } finally {
            setIsAttaching(false);
        }
    }, [projectId]);

    const attachExistingFile = useCallback(async (fileAssetId: string) => {
        if (!projectId) return;
        setIsAttaching(true);
        try {
            const result = await extractTextFromExistingFileAction(projectId, fileAssetId);
            if (!result.success) {
                console.error("Failed to attach existing file:", result.error);
                return;
            }
            setPendingAttachment({
                fileAssetId: result.data.fileAssetId,
                filename: result.data.filename,
                size: result.data.size,
                mimeType: result.data.mimeType,
                extractedText: result.data.extractedText,
                isExisting: true,
            });
        } catch (err) {
            console.error("Failed to attach existing file:", err);
        } finally {
            setIsAttaching(false);
        }
    }, [projectId]);

    const clearAttachment = useCallback(() => {
        setPendingAttachment(null);
    }, []);

    const cancelStream = useCallback(() => {
        streamGenRef.current++;
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsLoading(false);
        setPendingChoices([]);
    }, []);

    /**
     * Core stream lifecycle: fetch → parse → dispatch chunks.
     * Shared by sendMessage and executePlan. Manages abortController, streamGen, isLoading.
     */
    const runStream = useCallback(async (params: {
        body: Record<string, unknown>;
        page: CopilotPage;
        section?: string;
        convId: string | null;
        onPlanStepUpdate?: (planId: string, stepIndex: number, stepStatus: string) => void;
    }): Promise<{ success: boolean; aborted: boolean; runStatus: string | null; stopReason: string | null; errorMessage: string | null }> => {
        const { body, page, section, convId, onPlanStepUpdate } = params;
        let effectiveConvId = convId;

        // Stream lifecycle guards
        setIsLoading(true);
        streamGenRef.current++;
        const myGen = streamGenRef.current;

        const aiMessageId = `m-${Date.now() + 1}`;
        let aiMessageCreated = false;
        let fullContent = "";
        let reasoningContent = "";
        let reasoningState: "streaming" | "done" = "done";
        let reasoningTruncated = false;
        let activeReasoningId: string | null = null;
        let localRunId = "";
        let runStatus: string | null = null;
        let stopReason: string | null = null;
        let streamErrorMessage: string | null = null;

        // Cancel any in-flight stream
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const response = await fetch("/api/ai/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`AI request failed: ${response.statusText}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("No response body");
            }

            const updateMessages = (updater: (messages: CopilotMessage[]) => CopilotMessage[]) => {
                updateState((prev) => ({
                    ...prev,
                    messages: updater(prev.messages),
                }));
            };

            const upsertConversationTitle = (targetId: string, title: string) => {
                setConversations((prev) => {
                    const existing = prev.find((c) => c.id === targetId);
                    if (!existing) {
                        return [{
                            id: targetId,
                            title,
                            messageCount: 0,
                            updatedAt: new Date().toISOString(),
                        }, ...prev];
                    }
                    return prev.map((c) => (c.id === targetId ? { ...c, title } : c));
                });
            };

            const upsertArtifact = (artifactData: ArtifactData) => {
                setArtifacts((prev) => {
                    const next = new Map(prev);
                    next.set(artifactData.id, artifactData);
                    return next;
                });
            };

            const summary = await processAIStream({
                reader,
                signal: controller.signal,
                shouldContinue: () => streamGenRef.current === myGen,
                throwOnErrorChunk: true,
                onChunk: (data) => {
                    const nextState = handleProjectCopilotStreamChunk(
                        data,
                        {
                            aiMessageCreated,
                            fullContent,
                            reasoningContent,
                            reasoningState,
                            reasoningTruncated,
                            activeReasoningId,
                            localRunId,
                            effectiveConvId,
                        },
                        {
                            aiMessageId,
                            page,
                            section,
                            projectId,
                            myGen,
                            getCurrentGen: () => streamGenRef.current,
                            setCurrentRunId,
                            syncConversationId: (conversationId) => {
                                if (currentConversationIdRef.current !== conversationId) {
                                    setCurrentConversationId(conversationId);
                                }
                            },
                            upsertConversationTitle,
                            upsertArtifact,
                            updateMessages,
                            emitLedgerChanged: () => {
                                window.dispatchEvent(
                                    new CustomEvent("litrev:ledger-changed", { detail: { projectId } })
                                );
                            },
                            setPendingChoices,
                            onPlanStepUpdate,
                        }
                    );
                    aiMessageCreated = nextState.aiMessageCreated;
                    fullContent = nextState.fullContent;
                    reasoningContent = nextState.reasoningContent;
                    reasoningState = nextState.reasoningState;
                    reasoningTruncated = nextState.reasoningTruncated;
                    activeReasoningId = nextState.activeReasoningId;
                    localRunId = nextState.localRunId;
                    effectiveConvId = nextState.effectiveConvId;
                },
            });
            runStatus = summary.runStatus;
            stopReason = summary.stopReason;
            streamErrorMessage = summary.errorMessage;

            // Stale generation — skip refresh
            if (streamGenRef.current !== myGen) {
                return { success: false, aborted: true, runStatus, stopReason, errorMessage: streamErrorMessage };
            }

            // Refresh conversation list to update titles/counts
            loadConversations();
            return { success: true, aborted: false, runStatus, stopReason, errorMessage: streamErrorMessage };
        } catch (error) {
            // Silently ignore aborted requests
            if (error instanceof DOMException && error.name === "AbortError") {
                return { success: false, aborted: true, runStatus, stopReason, errorMessage: streamErrorMessage };
            }

            console.error("AI chat error:", error);
            setPendingChoices([]);
            const errorText = `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`;

            if (!aiMessageCreated) {
                const aiMessage: CopilotMessage = {
                    id: aiMessageId,
                    sender: "ai",
                    text: errorText,
                    createdAt: new Date().toISOString(),
                    context: { page, section },
                };
                updateState((prev) => ({
                    ...prev,
                    messages: [...prev.messages, aiMessage],
                }));
            } else {
                updateState((prev) => ({
                    ...prev,
                    messages: prev.messages.map((msg) =>
                        msg.id === aiMessageId
                            ? { ...msg, text: fullContent + "\n\n" + errorText }
                            : msg
                    ),
                }));
            }
            return {
                success: false,
                aborted: false,
                runStatus,
                stopReason,
                errorMessage: error instanceof Error ? error.message : streamErrorMessage,
            };
        } finally {
            if (streamGenRef.current === myGen) {
                setIsLoading(false);
            }
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null;
            }
        }
    }, [updateState, projectId, loadConversations]);

    const sendMessage = useCallback(
        async (text: string, page: CopilotPage, section?: string, model?: string, agentMode?: AgentMode, studyId?: string) => {
            const trimmed = text.trim();
            const attachment = pendingAttachment;
            if (!trimmed && !attachment) return;
            if (isLoadingRef.current) cancelStream();
            setPendingChoices([]);

            // Determine conversation context based on page
            const conversationContext = studyId ? "study" : "project";

            // Create conversation if needed
            let convId = currentConversationId;
            if (!convId) {
                try {
                    const convResult = await createConversation({
                        projectId,
                        studyId,
                        page,
                        context: conversationContext,
                    });
                    if (convResult.success) {
                        convId = convResult.data.id;
                        setCurrentConversationId(convResult.data.id);
                    } else {
                        console.error("Failed to create conversation:", convResult.error);
                    }
                } catch (err) {
                    console.error("Failed to create conversation:", err);
                }
            }

            // Build attachment metadata and augmented message for AI
            let messageForAI = trimmed;
            let attachmentsMeta: CopilotMessageAttachment[] | undefined;

            if (attachment) {
                const sizeStr = attachment.size >= 1024 * 1024
                    ? `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`
                    : `${Math.round(attachment.size / 1024)} KB`;
                const userText = trimmed || "I've attached a PDF. Please review it and summarize the key points.";
                messageForAI = `<attached_document filename="${attachment.filename}" size="${sizeStr}">\n${attachment.extractedText}\n</attached_document>\n\n${userText}`;
                attachmentsMeta = [{
                    fileAssetId: attachment.fileAssetId,
                    filename: attachment.filename,
                    size: attachment.size,
                    mimeType: attachment.mimeType,
                    isExisting: attachment.isExisting,
                }];
                setPendingAttachment(null);
            }

            // Add user message (display text only, not the augmented AI text)
            const displayText = trimmed || (attachment ? "I've attached a PDF. Please review it and summarize the key points." : "");
            const userMessage: CopilotMessage = {
                id: `m-${Date.now()}`,
                sender: "user",
                text: displayText,
                createdAt: new Date().toISOString(),
                context: { page, section },
                attachments: attachmentsMeta,
            };

            updateState((prev) => ({
                ...prev,
                messages: [...prev.messages, userMessage],
            }));

            // Run the stream
            await runStream({
                body: {
                    userMessage: messageForAI,
                    context: conversationContext,
                    options: {
                        conversationId: convId ?? undefined,
                        projectId,
                        studyId,
                        model,
                        reasoningMode,
                        includeReasoning: shouldRequestReasoning(reasoningMode),
                        reasoningBudgetTokens: shouldRequestReasoning(reasoningMode) ? 4096 : undefined,
                        agentMode: agentMode || "general",
                        page,
                        section,
                        persistedUserMessageContent: displayText,
                        userMessageAttachments: attachmentsMeta,
                    },
                },
                page,
                section,
                convId,
            });
        },
        [updateState, projectId, cancelStream, currentConversationId, pendingAttachment, reasoningMode, runStream]
    );

    const executePlanAction = useCallback(async (artifactId: string, selectedIndexes: number[]) => {
        if (isLoadingRef.current) cancelStream();
        setPendingChoices([]);

        // Optimistic UI: set plan artifact status to "running"
        setArtifacts((prev) => {
            const next = new Map(prev);
            const existing = next.get(artifactId);
            if (existing) {
                next.set(artifactId, { ...existing, status: "running" as ArtifactStatus });
            }
            return next;
        });
        updateState((prev) => ({
            ...prev,
            messages: prev.messages.map((msg) =>
                msg.artifact?.id === artifactId
                    ? { ...msg, artifact: { ...msg.artifact, status: "running" as ArtifactStatus } }
                    : msg
            ),
        }));

        const conversationContext = studyFilterRef.current ? "study" : "project";
        const convId = currentConversationId;
        const planMessage = stateRef.current.messages.find((msg) => msg.artifact?.id === artifactId);
        const executionPage = planMessage?.context?.page ?? "overview";

        const result = await runStream({
            body: {
                planId: artifactId,
                selectedSteps: selectedIndexes,
                userMessage: "",
                context: conversationContext,
                options: {
                    conversationId: convId ?? undefined,
                    projectId,
                    reasoningMode,
                    includeReasoning: shouldRequestReasoning(reasoningMode),
                    reasoningBudgetTokens: shouldRequestReasoning(reasoningMode) ? 4096 : undefined,
                    agentMode: "general",
                },
            },
            page: executionPage,
            convId,
            onPlanStepUpdate: (planId, stepIndex, stepStatus) => {
                // Update artifact payload step statuses
                setArtifacts((prev) => {
                    const next = new Map(prev);
                    const existing = next.get(planId);
                    if (existing && existing.payload && typeof existing.payload === "object") {
                        const payload = existing.payload as { steps?: Array<{ label: string; toolName?: string; description?: string; status: string }>; estimatedActions?: number };
                        if (!Array.isArray(payload.steps)) return next;
                        const updatedSteps = payload.steps.map((s, i) =>
                            i === stepIndex ? { ...s, status: stepStatus } : s
                        );
                        next.set(planId, { ...existing, payload: { ...payload, steps: updatedSteps } });
                    }
                    return next;
                });
                // Also update in message-level artifact
                updateState((prev) => ({
                    ...prev,
                    messages: prev.messages.map((msg) => {
                        if (msg.artifact?.id !== planId) return msg;
                        const payload = msg.artifact.payload as { steps?: Array<{ label: string; toolName?: string; description?: string; status: string }>; estimatedActions?: number };
                        if (!Array.isArray(payload.steps)) return msg;
                        const updatedSteps = payload.steps.map((s, i) =>
                            i === stepIndex ? { ...s, status: stepStatus } : s
                        );
                        return { ...msg, artifact: { ...msg.artifact, payload: { ...payload, steps: updatedSteps } } };
                    }),
                }));
            },
        });

        // Finalize local plan status based on stream result
        // Server already finalized — this updates the client-side optimistic state
        const didComplete = result.runStatus === "completed";
        const finalStatus: ArtifactStatus = didComplete ? "accepted" : "proposed";
        setArtifacts((prev) => {
            const next = new Map(prev);
            const existing = next.get(artifactId);
            if (existing) {
                next.set(artifactId, { ...existing, status: finalStatus });
            }
            return next;
        });
        updateState((prev) => ({
            ...prev,
            messages: prev.messages.map((msg) =>
                msg.artifact?.id === artifactId
                    ? { ...msg, artifact: { ...msg.artifact, status: finalStatus } }
                    : msg
            ),
        }));
        if (!didComplete && !result.aborted && result.success) {
            const reason = result.errorMessage
                ?? (result.stopReason ? `Execution stopped: ${result.stopReason}` : "Execution did not complete.");
            const feedback: CopilotMessage = {
                id: `plan-feedback-${Date.now()}`,
                sender: "ai",
                text: `Plan execution failed: ${reason}`,
                createdAt: new Date().toISOString(),
                context: { page: executionPage },
            };
            updateState((prev) => ({
                ...prev,
                messages: [...prev.messages, feedback],
            }));
        }
    }, [cancelStream, currentConversationId, projectId, reasoningMode, runStream, updateState]);

    const reviewArtifactActionLocal = useCallback(async (
        artifactId: string,
        status: "accepted" | "rejected",
        note?: string,
        editedPayload?: Record<string, unknown>,
    ) => {
        // Optimistic update — artifacts map
        setArtifacts((prev) => {
            const next = new Map(prev);
            const existing = next.get(artifactId);
            if (existing) {
                next.set(artifactId, { ...existing, status, reviewedAt: new Date().toISOString(), reviewNote: note ?? null });
            }
            return next;
        });

        // Optimistic update — message-level artifact status (drives TimelineRenderer)
        updateState((prev) => ({
            ...prev,
            messages: prev.messages.map((msg) =>
                msg.artifact?.id === artifactId
                    ? { ...msg, artifact: { ...msg.artifact, status } }
                    : msg
            ),
        }));

        // Call server action (passes editedPayload for edit-then-accept flow)
        const result = await reviewArtifactAction(artifactId, status, note, editedPayload);
        if (!result.success) {
            console.error("Failed to review artifact:", result.error);
            // Revert optimistic update on failure
            setArtifacts((prev) => {
                const next = new Map(prev);
                const existing = next.get(artifactId);
                if (existing) {
                    next.set(artifactId, { ...existing, status: "proposed", reviewedAt: null, reviewNote: null });
                }
                return next;
            });
            updateState((prev) => ({
                ...prev,
                messages: prev.messages.map((msg) =>
                    msg.artifact?.id === artifactId
                        ? { ...msg, artifact: { ...msg.artifact, status: "proposed" } }
                        : msg
                ),
            }));
            return;
        }

        if (status === "accepted" && result.artifact) {
            const domains = getChangedDomainsForAcceptedArtifact(result.artifact.type, result.artifact.payload);
            if (domains.length > 0) {
                dispatchProjectDataChanged({
                    projectId,
                    domains,
                    source: "artifact_review",
                });
            }
        }
    }, [projectId, updateState]);

    const dispatchArtifactAction = useCallback(async (action: ArtifactActionContract): Promise<void> => {
        if (action.type === "artifact.execute_plan") {
            await executePlanAction(action.artifactId, action.selectedIndexes);
            return;
        }
        if (action.type === "artifact.review") {
            await reviewArtifactActionLocal(
                action.artifactId,
                action.status,
                action.note,
                action.editedPayload,
            );
        }
    }, [executePlanAction, reviewArtifactActionLocal]);

    const executePlan = useCallback(async (artifactId: string, selectedIndexes: number[]): Promise<void> => {
        await dispatchArtifactAction({
            type: "artifact.execute_plan",
            artifactId,
            selectedIndexes,
        });
    }, [dispatchArtifactAction]);

    const handleReviewArtifact = useCallback(async (
        artifactId: string,
        status: "accepted" | "rejected",
        note?: string,
        editedPayload?: Record<string, unknown>,
    ): Promise<void> => {
        await dispatchArtifactAction({
            type: "artifact.review",
            artifactId,
            status,
            note,
            editedPayload,
        });
    }, [dispatchArtifactAction]);

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

    const clearMessages = useCallback(() => {
        updateState((prev) => ({
            ...prev,
            messages: [],
        }));
        setCurrentConversationId(null);
        setPendingChoices([]);
    }, [updateState]);

    const clearChoices = useCallback(() => setPendingChoices([]), []);

    const value = useMemo(
        () => ({
            state,
            messages: state.messages,
            isCollapsed: state.panel.collapsed,
            panelWidth: state.panel.width,
            isLoading,
            reasoningMode,
            toggleCollapsed,
            setCollapsed,
            setPanelWidth,
            sendMessage,
            setReasoningMode,
            cancelStream,
            clearMessages,
            // Conversation management
            conversations,
            currentConversationId,
            isLoadingConversations,
            showConversationList,
            toggleConversationList,
            selectConversation,
            newConversation,
            renameConversation,
            deleteConversation: deleteConversationHandler,
            branchConversation: branchConversationHandler,
            refreshConversations: loadConversations,
            setStudyFilter,
            // Attachment support
            pendingAttachment,
            isAttaching,
            attachFile,
            attachExistingFile,
            clearAttachment,
            projectId,
            // Agent run state (Phase 2)
            currentRunId,
            artifacts,
            handleReviewArtifact,
            executePlan,
            // Summarize & fresh
            shouldOfferSummary,
            summarizeAndRefresh,
            isSummarizing,
            isConversationLoading,
            // Autonomy configuration (Phase 7)
            autonomyPreset,
            autonomyToolOverrides,
            showAutonomySettings,
            setShowAutonomySettings,
            updateAutonomyPreset,
            updateAutonomyOverrides,
            resetToPreset,
            // AI-generated clickable choices
            pendingChoices,
            clearChoices,
            // Message pagination
            hasMore,
            isLoadingOlder,
            loadOlderMessages,
        }),
        [
            state,
            isLoading,
            reasoningMode,
            toggleCollapsed,
            setCollapsed,
            setPanelWidth,
            sendMessage,
            setReasoningMode,
            cancelStream,
            clearMessages,
            conversations,
            currentConversationId,
            isLoadingConversations,
            showConversationList,
            toggleConversationList,
            selectConversation,
            newConversation,
            renameConversation,
            deleteConversationHandler,
            branchConversationHandler,
            loadConversations,
            setStudyFilter,
            pendingAttachment,
            isAttaching,
            attachFile,
            attachExistingFile,
            clearAttachment,
            currentRunId,
            artifacts,
            handleReviewArtifact,
            executePlan,
            shouldOfferSummary,
            summarizeAndRefresh,
            isSummarizing,
            isConversationLoading,
            autonomyPreset,
            autonomyToolOverrides,
            showAutonomySettings,
            updateAutonomyPreset,
            updateAutonomyOverrides,
            resetToPreset,
            pendingChoices,
            clearChoices,
            hasMore,
            isLoadingOlder,
            loadOlderMessages,
        ]
    );

    return (
        <ProjectCopilotContext.Provider value={value}>
            {children}
        </ProjectCopilotContext.Provider>
    );
}

export function useProjectCopilot() {
    const ctx = useContext(ProjectCopilotContext);
    if (!ctx) {
        throw new Error("useProjectCopilot must be used within ProjectCopilotProvider");
    }
    return ctx;
}

/** Safe accessor — returns undefined outside ProjectCopilotProvider (no throw) */
export function useProjectCopilotSafe() {
    return useContext(ProjectCopilotContext);
}
