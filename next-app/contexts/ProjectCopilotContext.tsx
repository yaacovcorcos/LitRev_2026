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
    ProjectCopilotState,
    loadProjectCopilotState,
    saveProjectCopilotState,
    createDefaultProjectCopilotState,
} from "@/lib/projectCopilotStorage";
import {
    uploadChatAttachmentAction,
    extractTextFromExistingFileAction,
} from "@/app/actions/files";
import { getAutonomyConfigAction, updateAutonomyAction } from "@/app/actions/agent";
import { useCopilotConversations } from "@/hooks/useCopilotConversations";
import { useCopilotStreamActions } from "@/hooks/useCopilotStreamActions";
import type { ArtifactData } from "@/types/artifacts";
import type { AutonomyPreset, AutonomyLevel } from "@/types/agent";
import type { ChoiceOption, CopilotPage, ReasoningMode, StreamPhase, UserInputRequest } from "@/types/ai";
import { useRouter } from "next/navigation";
import {
    getReasoningModePreference,
    setReasoningModePreference,
} from "@/lib/ai/reasoning-visibility";
import {
    USER_SELECTABLE_MODELS,
    getReasoningSupportTier,
    type SelectableModelId,
    type ReasoningSupportTier,
} from "@/lib/ai/config";
import { recordChatUnificationMetric } from "@/lib/ai/chat-unification-telemetry";
import type {
    PendingAttachment,
    ProjectCopilotContextValue,
} from "@/types/copilot-context";

const MODEL_STORAGE_KEY = "litrev_copilot_model";
const DEFAULT_MODEL: SelectableModelId = "gpt-5.2";

export type { PendingAttachment } from "@/types/copilot-context";


const ProjectCopilotContext = createContext<ProjectCopilotContextValue | undefined>(undefined);

type ProjectCopilotProviderProps = {
    projectId: string;
    children: ReactNode;
};

export function ProjectCopilotProvider({ projectId, children }: ProjectCopilotProviderProps) {
    const router = useRouter();
    const [state, setState] = useState<ProjectCopilotState>(createDefaultProjectCopilotState());
    const stateRef = useRef<ProjectCopilotState>(createDefaultProjectCopilotState());
    const [isLoading, setIsLoading] = useState(false);
    const [streamPhase, setStreamPhase] = useState<StreamPhase>("idle");
    const [reasoningMode, setReasoningModeState] = useState<ReasoningMode>(() => getReasoningModePreference());
    const [selectedModel, setSelectedModelState] = useState<SelectableModelId>(DEFAULT_MODEL);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const streamGenRef = useRef(0);
    const isLoadingRef = useRef(false);

    // Attachment state
    const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
    const [isAttaching, setIsAttaching] = useState(false);

    // Agent run state (Phase 2)
    const [currentRunId, setCurrentRunId] = useState<string | null>(null);
    const [artifacts, setArtifacts] = useState<Map<string, ArtifactData>>(new Map());

    const shouldOfferSummary = state.messages.length > 20;

    // AI-generated clickable choices
    const [pendingChoices, setPendingChoices] = useState<ChoiceOption[]>([]);

    // Structured ask_user question pending user response
    const [pendingUserInput, setPendingUserInput] = useState<UserInputRequest | null>(null);

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

    // Load model preference from localStorage on mount
    useEffect(() => {
        if (typeof window === "undefined") return;
        const stored = window.localStorage.getItem(MODEL_STORAGE_KEY);
        const isValid = USER_SELECTABLE_MODELS.some((m) => m.id === stored);
        if (isValid && stored !== selectedModel) {
            setSelectedModelState(stored as SelectableModelId);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Compute reasoning support tier from current model
    const reasoningSupport: ReasoningSupportTier = useMemo(
        () => getReasoningSupportTier(selectedModel),
        [selectedModel]
    );

    /**
     * Set selected model with side effects:
     * - Persist to localStorage
     * - Force reasoning mode to "off" if new model has no reasoning support
     */
    const setSelectedModel = useCallback((modelId: SelectableModelId) => {
        setSelectedModelState(modelId);
        if (typeof window !== "undefined") {
            window.localStorage.setItem(MODEL_STORAGE_KEY, modelId);
        }
        // State guard: force reasoning off when model doesn't support it
        const newTier = getReasoningSupportTier(modelId);
        if (newTier === "none") {
            setReasoningModeState("off");
            setReasoningModePreference("off");
        }
    }, []);

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

    // Conversation management (extracted hook)
    const convo = useCopilotConversations({
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
    });

    // Stream + artifact actions (extracted hook)
    const stream = useCopilotStreamActions({
        projectId,
        updateState,
        stateRef,
        streamGenRef,
        abortControllerRef,
        isLoadingRef,
        setIsLoading,
        setStreamPhase,
        setCurrentRunId,
        setPendingChoices,
        setPendingUserInput,
        setArtifacts,
        pendingAttachment,
        setPendingAttachment,
        reasoningMode,
        convo,
        onNavigate: router.push,
    });

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

    const clearMessages = useCallback(() => {
        updateState((prev) => ({
            ...prev,
            messages: [],
        }));
        convo.setCurrentConversationId(null);
        setPendingChoices([]);
    }, [updateState, convo]);

    const clearChoices = useCallback(() => setPendingChoices([]), []);

    const answerUserInput = useCallback((callId: string, answer: string, page?: CopilotPage, section?: string) => {
        setPendingUserInput(null);
        const existing = stateRef.current.messages.find(
            (message) => message.userInputRequest?.callId === callId
        );
        const resolvedPage = page ?? existing?.context?.page ?? "overview";
        const resolvedSection = section ?? existing?.context?.section;
        const expectedPage = existing?.context?.page ?? null;
        const expectedSection = existing?.context?.section ?? null;
        const contextMismatch = Boolean(
            existing
            && (
                expectedPage !== resolvedPage
                || expectedSection !== (resolvedSection ?? null)
            )
        );

        recordChatUnificationMetric({
            type: "ask_user_context_mismatch",
            surface: "project",
            conversationId: convo.currentConversationIdRef.current,
            payload: {
                mismatch: contextMismatch,
                expectedPage,
                expectedSection,
                resolvedPage,
                resolvedSection: resolvedSection ?? null,
            },
        });

        updateState((prev) => ({
            ...prev,
            messages: prev.messages.map((message) => {
                if (!message.userInputRequest || message.userInputRequest.callId !== callId) return message;
                return {
                    ...message,
                    userInputRequest: {
                        ...message.userInputRequest,
                        answered: true,
                        answer,
                    },
                };
            }),
        }));
        // Send the answer as the next user message so the AI can continue
        stream.sendMessage(answer, resolvedPage, resolvedSection);
    }, [convo, stream, updateState, stateRef]);

    const value = useMemo(
        () => ({
            state,
            messages: state.messages,
            isCollapsed: state.panel.collapsed,
            panelWidth: state.panel.width,
            isLoading,
            streamPhase,
            canAct: !isLoading,
            reasoningMode,
            selectedModel,
            reasoningSupport,
            setSelectedModel,
            toggleCollapsed,
            setCollapsed,
            setPanelWidth,
            sendMessage: stream.sendMessage,
            setReasoningMode,
            cancelStream: stream.cancelStream,
            clearMessages,
            // Conversation management (from hook)
            conversations: convo.conversations,
            currentConversationId: convo.currentConversationId,
            isLoadingConversations: convo.isLoadingConversations,
            showConversationList: convo.showConversationList,
            toggleConversationList: convo.toggleConversationList,
            selectConversation: convo.selectConversation,
            newConversation: convo.newConversation,
            renameConversation: convo.renameConversation,
            deleteConversation: convo.deleteConversation,
            branchConversation: convo.branchConversation,
            refreshConversations: convo.loadConversations,
            setStudyFilter: convo.setStudyFilter,
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
            handleReviewArtifact: stream.handleReviewArtifact,
            approveArtifactsBatch: stream.approveArtifactsBatch,
            executePlan: stream.executePlan,
            // Summarize & fresh
            shouldOfferSummary,
            summarizeAndRefresh: convo.summarizeAndRefresh,
            isSummarizing: convo.isSummarizing,
            isConversationLoading: convo.isConversationLoading,
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
            // Structured ask_user input
            pendingUserInput,
            answerUserInput,
            // Message pagination
            hasMore: convo.hasMore,
            isLoadingOlder: convo.isLoadingOlder,
            loadOlderMessages: convo.loadOlderMessages,
        }),
        [
            state,
            isLoading,
            streamPhase,
            reasoningMode,
            selectedModel,
            reasoningSupport,
            setSelectedModel,
            toggleCollapsed,
            setCollapsed,
            setPanelWidth,
            stream,
            setReasoningMode,
            clearMessages,
            convo,
            pendingAttachment,
            isAttaching,
            attachFile,
            attachExistingFile,
            clearAttachment,
            currentRunId,
            artifacts,
            shouldOfferSummary,
            autonomyPreset,
            autonomyToolOverrides,
            showAutonomySettings,
            updateAutonomyPreset,
            updateAutonomyOverrides,
            resetToPreset,
            pendingChoices,
            clearChoices,
            pendingUserInput,
            answerUserInput,
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

/** Streaming gate hook — returns whether the user can interact with artifact actions. */
export function useStreamingGate() {
    const { isLoading, streamPhase, canAct } = useProjectCopilot();
    return { isStreaming: isLoading, streamPhase, canAct };
}
