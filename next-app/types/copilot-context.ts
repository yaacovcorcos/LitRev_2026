/**
 * Types for the ProjectCopilotContext.
 * Extracted from contexts/ProjectCopilotContext.tsx for maintainability.
 */

import type { CopilotMessage, ProjectCopilotState } from "@/lib/projectCopilotStorage";
import type { ArtifactData } from "@/types/artifacts";
import type { AgentMode, AutonomyPreset, AutonomyLevel } from "@/types/agent";
import type { ChoiceOption, CopilotPage, ReasoningMode, StreamPhase, UserInputRequest } from "@/types/ai";
import type { SelectableModelId, ReasoningSupportTier } from "@/lib/ai/config";
import type { RetryModelExpectation } from "@/types/chat-unification";
import type { ContextCaptureHistoryEntry, ContextCaptureTarget } from "@/types/context-capture";

export type PendingAttachment = {
    fileAssetId: string;
    filename: string;
    size: number;
    mimeType: string;
    extractedText: string;
    isExisting: boolean;
};

export type ConversationListItem = {
    id: string;
    title: string | null;
    messageCount: number;
    updatedAt: string;
};

export type ApproveArtifactsBatchResult = {
    approvedCount: number;
    failedArtifactIds: string[];
    stopped: boolean;
};

export type PrefillCommand = {
    text: string;
    id: string;
};

export type ProjectCopilotContextValue = {
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
    /** Current streaming phase for fine-grained UI control */
    streamPhase: StreamPhase;
    /** Whether the user can interact with artifact actions (false during streaming) */
    canAct: boolean;
    /** Reasoning visibility mode (off/summary/full) */
    reasoningMode: ReasoningMode;
    /** Currently selected model ID */
    selectedModel: SelectableModelId;
    /** Reasoning support tier of the current model */
    reasoningSupport: ReasoningSupportTier;
    /** Update the selected model (persists to localStorage, may force reasoningMode off) */
    setSelectedModel: (modelId: SelectableModelId) => void;
    /** Toggle the panel collapsed state */
    toggleCollapsed: () => void;
    /** Set the panel collapsed state */
    setCollapsed: (collapsed: boolean) => void;
    /** Update the panel width */
    setPanelWidth: (width: number) => void;
    /** Send a message to the copilot */
    sendMessage: (
        text: string,
        page: CopilotPage,
        section?: string,
        model?: string,
        agentMode?: AgentMode,
        studyId?: string,
        retryModelExpectation?: RetryModelExpectation,
        contextTargets?: ContextCaptureTarget[],
        runtimeOverrides?: { replaceRunId?: string | null },
    ) => void;
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
    /** Attached context targets waiting to be sent with the next message */
    attachedContextTargets: ContextCaptureTarget[];
    /** Recent reusable context history for the current project */
    recentContextHistory: ContextCaptureHistoryEntry[];
    /** Replace the current attached context targets */
    setAttachedContextTargets: (targets: ContextCaptureTarget[]) => void;
    /** Add one or more attached context targets without duplicates */
    addAttachedContextTargets: (targets: ContextCaptureTarget[]) => void;
    /** Remove one attached context target by its stable target key */
    removeAttachedContextTarget: (targetKey: string) => void;
    /** Clear all attached context targets */
    clearAttachedContextTargets: () => void;
    /** Record targets into recent context history */
    recordContextHistory: (targets: ContextCaptureTarget[]) => void;
    /** Cross-surface prefill command queued for the composer */
    prefillCommand: PrefillCommand | null;
    /** Queue a prefill command for the composer */
    queuePrefillCommand: (text: string) => void;
    /** Mark the queued prefill command as consumed */
    consumePrefillCommand: () => void;

    // Agent run state (planC Phase 2)
    /** Current active run ID (null when no agent is running) */
    currentRunId: string | null;
    /** Artifacts map for quick lookup by ID */
    artifacts: Map<string, ArtifactData>;
    /** Review an artifact (accept/reject) */
    handleReviewArtifact: (artifactId: string, status: "accepted" | "rejected", note?: string, editedPayload?: Record<string, unknown>) => Promise<void>;
    /** Batch-approve proposed artifacts with progress/cancel hooks for timeline UI */
    approveArtifactsBatch: (
        artifactIds: string[],
        options?: {
            shouldStop?: () => boolean;
            onProgress?: (completed: number, total: number) => void;
            conversationId?: string;
        },
    ) => Promise<ApproveArtifactsBatchResult>;
    /** Execute a plan artifact (run selected steps) */
    executePlan: (artifactId: string, selectedIndexes: number[]) => void;
    /** Reconnect to a still-active run using the recovery API. */
    reconnectRun: (runId?: string | null) => Promise<void>;

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

    // Structured ask_user input
    /** Active ask_user question pending user response */
    pendingUserInput: UserInputRequest | null;
    /** Answer the pending ask_user question (clears it and sends answer as message) */
    answerUserInput: (callId: string, answer: string, page?: CopilotPage, section?: string) => void;

    // Message pagination
    /** Whether there are older messages available to load */
    hasMore: boolean;
    /** Whether older messages are currently being fetched */
    isLoadingOlder: boolean;
    /** Load the next page of older messages */
    loadOlderMessages: () => Promise<void>;
};
