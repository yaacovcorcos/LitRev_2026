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
    ProjectConversationState,
    loadProjectConversationState,
    saveProjectConversationState,
    createDefaultProjectConversationState,
} from "@/lib/project-conversation-storage";
import {
    uploadChatAttachmentAction,
    extractTextFromExistingFileAction,
} from "@/app/actions/files";
import { useProjectConversationManager } from "@/hooks/useProjectConversationManager";
import { useProjectConversationStreamActions } from "@/hooks/useProjectConversationStreamActions";
import { useProjectAutonomyConfig } from "@/hooks/useProjectAutonomyConfig";
import { useQueuedFollowUpController } from "@/hooks/useQueuedFollowUpController";
import type { ArtifactData } from "@/types/artifacts";
import type { AgentMode } from "@/types/agent";
import type {
    ChoiceOption,
    CopilotPage,
    ReasoningMode,
    RuntimeSendOverrides,
    StreamPhase,
    UserInputRequest,
    UserInputResolutionKind,
} from "@/types/ai";
import { useRouter } from "next/navigation";
import {
    getReasoningModePreference,
    setReasoningModePreference,
} from "@/lib/ai/reasoning-visibility";
import {
    DEFAULT_SELECTABLE_MODEL_ID,
    USER_SELECTABLE_MODELS,
    getReasoningSupportTier,
    type SelectableModelId,
    type ReasoningSupportTier,
} from "@/lib/ai/config";
import { recordChatUnificationMetric } from "@/lib/ai/chat-unification-telemetry";
import {
} from "@/lib/ai/queued-followup";
import {
    clearContextCaptureHistory,
    loadContextCaptureHistory,
    pushContextCaptureHistory,
} from "@/lib/context-capture/history";
import { isContextCaptureV1Enabled, isContextHistoryV1Enabled } from "@/lib/context-capture/feature-flags";
import { getContextTargetKey } from "@/lib/context-capture/targets";
import type {
    PendingAttachment,
    PrefillCommand,
    ProjectConversationContextValue,
} from "@/types/project-conversation-context";
import type { ContextCaptureHistoryEntry, ContextCaptureTarget } from "@/types/context-capture";
import type { RetryModelExpectation } from "@/types/chat-unification";
import type { QueuedFollowUp } from "@/types/queued-followup";

// Keep the legacy key so saved model preference survives the naming migration.
const LEGACY_COPILOT_MODEL_STORAGE_KEY = "litrev_copilot_model";
const DEFAULT_MODEL: SelectableModelId = DEFAULT_SELECTABLE_MODEL_ID;

export type { PendingAttachment } from "@/types/project-conversation-context";


const ProjectConversationContext = createContext<ProjectConversationContextValue | undefined>(undefined);

type ProjectConversationProviderProps = {
    projectId: string;
    routeConversationId?: string | null;
    children: ReactNode;
};

function loadInitialContextHistory(projectId: string): ContextCaptureHistoryEntry[] {
    if (!isContextHistoryV1Enabled()) {
        clearContextCaptureHistory(projectId);
        return [];
    }
    return loadContextCaptureHistory(projectId);
}

function panelStateMatches(
    left: ProjectConversationState["panel"],
    right: ProjectConversationState["panel"],
) {
    return left.collapsed === right.collapsed && left.width === right.width;
}

export function ProjectConversationProvider({
    projectId,
    routeConversationId = null,
    children,
}: ProjectConversationProviderProps) {
    return (
        <ProjectConversationRuntime
            key={projectId}
            projectId={projectId}
            routeConversationId={routeConversationId}
        >
            {children}
        </ProjectConversationRuntime>
    );
}

function ProjectConversationRuntime({
    projectId,
    routeConversationId = null,
    children,
}: ProjectConversationProviderProps) {
    const router = useRouter();
    const [state, setState] = useState<ProjectConversationState>(() => createDefaultProjectConversationState());
    const stateRef = useRef<ProjectConversationState>(state);
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
    const [attachedContextTargets, setAttachedContextTargetsState] = useState<ContextCaptureTarget[]>([]);
    const [recentContextHistory, setRecentContextHistory] = useState<ContextCaptureHistoryEntry[]>(() => (
        loadInitialContextHistory(projectId)
    ));
    const [prefillCommand, setPrefillCommand] = useState<PrefillCommand | null>(null);
    const [queuedFollowUp, setQueuedFollowUp] = useState<QueuedFollowUp | null>(null);

    // Agent run state (Phase 2)
    const [currentRunId, setCurrentRunId] = useState<string | null>(null);
    const [artifacts, setArtifacts] = useState<Map<string, ArtifactData>>(new Map());

    const shouldOfferSummary = state.messages.length > 20;

    // AI-generated clickable choices
    const [pendingChoices, setPendingChoices] = useState<ChoiceOption[]>([]);

    // Structured ask_user question pending user response
    const [pendingUserInput, setPendingUserInput] = useState<UserInputRequest | null>(null);

    isLoadingRef.current = isLoading;
    stateRef.current = state;
    const {
        autonomyPreset,
        autonomyToolOverrides,
        showAutonomySettings,
        setShowAutonomySettings,
        updateAutonomyPreset,
        updateAutonomyOverrides,
        resetToPreset,
    } = useProjectAutonomyConfig(projectId);

    const setReasoningMode = useCallback((mode: ReasoningMode) => {
        setReasoningModeState(mode);
        setReasoningModePreference(mode);
    }, []);

    // Load model preference from localStorage on mount
    useEffect(() => {
        if (typeof window === "undefined") return;
        const stored = window.localStorage.getItem(LEGACY_COPILOT_MODEL_STORAGE_KEY);
        const isValid = USER_SELECTABLE_MODELS.some((m) => m.id === stored);
        if (isValid) {
            setSelectedModelState((current) => (
                current === stored ? current : stored as SelectableModelId
            ));
        }
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
            window.localStorage.setItem(LEGACY_COPILOT_MODEL_STORAGE_KEY, modelId);
        }
        // State guard: force reasoning off when model doesn't support it
        const newTier = getReasoningSupportTier(modelId);
        if (newTier === "none") {
            setReasoningModeState("off");
            setReasoningModePreference("off");
        }
    }, []);

    // Save panel state with debounce (messages are saved via conversation system)
    const scheduleSave = useCallback(
        (next: ProjectConversationState) => {
            if (!projectId) return;
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
            saveTimerRef.current = setTimeout(() => {
                // Only save panel state to localStorage, not messages
                const panelOnlyState: ProjectConversationState = {
                    ...next,
                    messages: [], // Don't persist messages to localStorage
                };
                saveProjectConversationState(projectId, panelOnlyState);
            }, 400);
        },
        [projectId]
    );

    const updateState = useCallback(
        (updater: (prev: ProjectConversationState) => ProjectConversationState) => {
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
        const local = loadProjectConversationState(projectId);
        setState((prev) => {
            if (panelStateMatches(prev.panel, local.panel)) {
                return prev;
            }
            return {
                ...prev,
                panel: local.panel,
            };
        });
    }, [projectId]);

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
                abortControllerRef.current = null;
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
    const convo = useProjectConversationManager({
        projectId,
        routeConversationId,
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
    const stream = useProjectConversationStreamActions({
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
        pendingUserInput,
        currentRunId,
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
                extraction: result.data.extraction,
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
                extraction: result.data.extraction,
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

    const setAttachedContextTargets = useCallback((targets: ContextCaptureTarget[]) => {
        if (!isContextCaptureV1Enabled()) {
            setAttachedContextTargetsState([]);
            return;
        }
        const deduped = Array.from(new Map(targets.map((target) => [getContextTargetKey(target), target])).values());
        setAttachedContextTargetsState(deduped);
    }, []);

    const addAttachedContextTargets = useCallback((targets: ContextCaptureTarget[]) => {
        if (!isContextCaptureV1Enabled() || targets.length === 0) return;
        setAttachedContextTargetsState((current) => {
            const merged = new Map(current.map((target) => [getContextTargetKey(target), target]));
            for (const target of targets) {
                merged.set(getContextTargetKey(target), target);
            }
            return Array.from(merged.values());
        });
    }, []);

    const removeAttachedContextTarget = useCallback((targetKey: string) => {
        setAttachedContextTargetsState((current) =>
            current.filter((target) => getContextTargetKey(target) !== targetKey),
        );
    }, []);

    const clearAttachedContextTargets = useCallback(() => {
        setAttachedContextTargetsState([]);
    }, []);

    const recordContextHistory = useCallback((targets: ContextCaptureTarget[]) => {
        if (!projectId || !isContextHistoryV1Enabled() || targets.length === 0) return;
        const next = pushContextCaptureHistory(projectId, targets);
        setRecentContextHistory(next);
    }, [projectId]);

    const queuePrefillCommand = useCallback((text: string) => {
        const trimmed = text.trim();
        if (!trimmed) return;
        const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `prefill-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        setPrefillCommand({ text: trimmed, id });
    }, []);

    const consumePrefillCommand = useCallback(() => {
        setPrefillCommand(null);
    }, []);

    const queueQueuedFollowUp = useCallback((nextQueuedFollowUp: QueuedFollowUp) => {
        setQueuedFollowUp(nextQueuedFollowUp);
    }, []);

    const clearQueuedFollowUp = useCallback(() => {
        setQueuedFollowUp(null);
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

    const reconcileArtifactStatus = useCallback((
        artifactId: string,
        status: ArtifactData["status"],
        reviewNote?: string | null,
    ) => {
        const reviewedAt = new Date().toISOString();
        setArtifacts((prev) => {
            const next = new Map(prev);
            const existing = next.get(artifactId);
            if (existing) {
                next.set(artifactId, {
                    ...existing,
                    status,
                    reviewedAt,
                    reviewNote: reviewNote ?? null,
                });
            }
            return next;
        });
        updateState((prev) => ({
            ...prev,
            messages: prev.messages.map((message) =>
                message.artifact?.id === artifactId
                    ? {
                        ...message,
                        artifact: {
                            ...message.artifact,
                            status,
                        },
                    }
                    : message
            ),
        }));
    }, [updateState]);

    const answerUserInput = useCallback((
        callId: string,
        answer: string,
        page?: CopilotPage,
        section?: string,
        resolution: UserInputResolutionKind = "answered",
    ) => {
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
            projectId,
            payload: {
                mismatch: contextMismatch,
                expectedPage,
                expectedSection,
                resolvedPage,
                resolvedSection: resolvedSection ?? null,
            },
        });
        const sourceRunId = existing?.userInputRequest?.sourceRunId;
        if (!sourceRunId) {
            return;
        }
        stream.sendMessage(
            "",
            resolvedPage,
            resolvedSection,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            {
                replaceRunId: sourceRunId,
                continueFromRunId: sourceRunId,
                suppressUserMessageAppend: true,
                userInputResolution: {
                    sourceRunId,
                    callId,
                    questionId: existing.userInputRequest?.questionId,
                    resolution,
                    answerText: answer,
                    answeredAt: new Date().toISOString(),
                    decisionBoundaryKey: existing.userInputRequest?.decisionBoundaryKey,
                },
            },
        );
    }, [convo, projectId, stream, setPendingUserInput, stateRef]);

    const sendMessageWithContext = useCallback(
        (
            text: string,
            page: CopilotPage,
            section?: string,
            model?: string,
            agentMode?: AgentMode,
            studyId?: string,
            retryModelExpectation?: RetryModelExpectation,
            contextTargets?: ContextCaptureTarget[],
            runtimeOverrides?: RuntimeSendOverrides,
        ) => {
            if (contextTargets?.length) {
                recordContextHistory(contextTargets);
            }
            return stream.sendMessage(
                text,
                page,
                section,
                model,
                agentMode,
                studyId,
                retryModelExpectation,
                contextTargets,
                runtimeOverrides,
            );
        },
        [recordContextHistory, stream],
    );

    useQueuedFollowUpController({
        projectScopeId: projectId,
        currentConversationId: convo.currentConversationId,
        queuedFollowUp,
        setQueuedFollowUp,
        isLoading,
        hasPendingChoices: pendingChoices.length > 0,
        hasPendingUserInput: pendingUserInput !== null,
        sendLocked: false,
        dispatchQueuedFollowUp: (nextQueuedFollowUp) => sendMessageWithContext(
            nextQueuedFollowUp.text,
            nextQueuedFollowUp.page,
            nextQueuedFollowUp.section,
            nextQueuedFollowUp.model,
            nextQueuedFollowUp.agentMode,
            nextQueuedFollowUp.studyId,
        ),
    });

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
            sendMessage: sendMessageWithContext,
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
            attachedContextTargets,
            recentContextHistory,
            setAttachedContextTargets,
            addAttachedContextTargets,
            removeAttachedContextTarget,
            clearAttachedContextTargets,
            recordContextHistory,
            prefillCommand,
            queuePrefillCommand,
            consumePrefillCommand,
            queuedFollowUp,
            queueQueuedFollowUp,
            clearQueuedFollowUp,
            // Agent run state (Phase 2)
            currentRunId,
            artifacts,
            handleReviewArtifact: stream.handleReviewArtifact,
            handleUndoArtifact: stream.handleUndoArtifact,
            approveArtifactsBatch: stream.approveArtifactsBatch,
            executePlan: stream.executePlan,
            reconnectRun: stream.reconnectRun,
            reconcileArtifactStatus,
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
            sendMessageWithContext,
            stream,
            reconcileArtifactStatus,
            setReasoningMode,
            clearMessages,
            convo,
            pendingAttachment,
            isAttaching,
            attachFile,
            attachExistingFile,
            clearAttachment,
            attachedContextTargets,
            recentContextHistory,
            setAttachedContextTargets,
            addAttachedContextTargets,
            removeAttachedContextTarget,
            clearAttachedContextTargets,
            recordContextHistory,
            projectId,
            prefillCommand,
            queuePrefillCommand,
            consumePrefillCommand,
            queuedFollowUp,
            queueQueuedFollowUp,
            clearQueuedFollowUp,
            currentRunId,
            artifacts,
            shouldOfferSummary,
            autonomyPreset,
            autonomyToolOverrides,
            showAutonomySettings,
            setShowAutonomySettings,
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
        <ProjectConversationContext.Provider value={value}>
            {children}
        </ProjectConversationContext.Provider>
    );
}

export function useProjectConversation() {
    const ctx = useContext(ProjectConversationContext);
    if (!ctx) {
        throw new Error("useProjectConversation must be used within ProjectConversationProvider");
    }
    return ctx;
}

/** Safe accessor — returns undefined outside ProjectConversationProvider (no throw) */
export function useProjectConversationSafe() {
    return useContext(ProjectConversationContext);
}
