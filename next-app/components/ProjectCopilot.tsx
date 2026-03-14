"use client";

import { useCallback, useMemo, useRef, useState, type WheelEvent as ReactWheelEvent } from "react";
import { useParams } from "next/navigation";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import type { CopilotPage } from "@/types/ai";
import type { AgentMode } from "@/types/agent";
import type { TimelineItem } from "@/types/timeline";
import { createNoteAction } from "@/app/actions/notes";
import { selectActiveProgress, normalizeTimelineProgressItems } from "@/lib/ai/active-progress";
import { TimelineRenderer } from "./copilot/TimelineRenderer";
import { CopilotInput } from "./copilot/CopilotInput";
import { ComposerActiveProgressBar } from "./copilot/ComposerActiveProgressBar";
import { ComposerQueuedFollowUpBar } from "./copilot/ComposerQueuedFollowUpBar";
import { AutonomySettings } from "./copilot/AutonomySettings";
import { ReasoningModeDropdown } from "./copilot/ReasoningModeDropdown";
import { ConversationPicker } from "./ui/ConversationPicker";
import { decideCopilotWheelContainment } from "./copilot/scrollContainment";
import { generateChatUnificationRequestKey } from "@/lib/ai/chat-unification-telemetry";
import { messagesToTimeline } from "./copilot/StreamReducer";
import styles from "./ProjectCopilot.module.css";

export type SuggestionConfig = {
    label: string;
    prompt: string;
};

export type ProjectCopilotProps = {
    /** Current page context */
    page: CopilotPage;
    /** Optional section context (e.g., for draft sections) */
    section?: string;
    /** Optional study ID for study-scoped context */
    studyId?: string;
    /** Context display string (e.g., "Introduction · 3 evidence") */
    contextDisplay: string;
    /** Empty state configuration */
    emptyState: {
        icon: string;
        title: string;
        description: string;
        suggestions: SuggestionConfig[];
    };
    /** Placeholder for the input field */
    inputPlaceholder: string;
    /** Optional callback when AI response includes insertable content */
    onInsert?: (text: string) => void;
    /** Panel ID for accessibility */
    panelId?: string;
};

export function ProjectCopilot({
    page,
    section,
    studyId,
    contextDisplay,
    emptyState,
    inputPlaceholder,
    onInsert,
    panelId = "project-copilot-panel",
}: ProjectCopilotProps) {
    const panelRef = useRef<HTMLElement | null>(null);
    const timelineRef = useRef<HTMLDivElement | null>(null);
    const params = useParams<{ id: string }>();
    const projectId = params?.id;
    const {
        messages,
        isCollapsed,
        isLoading,
        reasoningMode,
        setReasoningMode,
        reasoningSupport,
        setCollapsed,
        // Conversation management
        conversations,
        currentConversationId,
        isConversationLoading,
        selectConversation,
        newConversation,
        branchConversation,
        deleteConversation,
        renameConversation,
        sendMessage,
        handleReviewArtifact,
        approveArtifactsBatch,
        executePlan,
        reconnectRun,
        selectedModel,
        // Autonomy settings (Phase 7)
        setShowAutonomySettings,
        // Structured ask_user input
        answerUserInput,
        // Message pagination
        hasMore,
        isLoadingOlder,
        loadOlderMessages,
        prefillCommand: sharedPrefillCommand,
        consumePrefillCommand,
        queuedFollowUp,
        clearQueuedFollowUp,
    } = useProjectCopilot();

    // Hide reasoning controls when model doesn't support reasoning
    const showReasoningControls = reasoningSupport !== "none";

    const [showConversationDropdown, setShowConversationDropdown] = useState(false);
    const [isBranching, setIsBranching] = useState(false);
    const [prefillCommand, setPrefillCommand] = useState<{ text: string; id: string } | null>(null);

    const handleSuggestionClick = useCallback((prompt: string) => {
        setPrefillCommand({ text: prompt, id: crypto.randomUUID() });
    }, []);

    const activePrefillCommand = sharedPrefillCommand ?? prefillCommand;

    const handleEditQueuedFollowUp = useCallback(() => {
        if (!queuedFollowUp) return;
        clearQueuedFollowUp();
        setPrefillCommand({ text: queuedFollowUp.text, id: crypto.randomUUID() });
    }, [clearQueuedFollowUp, queuedFollowUp]);

    const handlePrefillConsumed = useCallback(() => {
        if (sharedPrefillCommand) {
            consumePrefillCommand();
            return;
        }
        setPrefillCommand(null);
    }, [consumePrefillCommand, sharedPrefillCommand]);

    const handleTimelineContainerElement = useCallback((node: HTMLDivElement | null) => {
        timelineRef.current = node;
    }, []);

    const handleWheelCapture = useCallback((event: ReactWheelEvent<HTMLElement>) => {
        const decision = decideCopilotWheelContainment({
            target: event.target,
            panelElement: panelRef.current,
            timelineElement: timelineRef.current,
            deltaY: event.deltaY,
            ctrlKey: event.ctrlKey,
        });
        if (!decision.shouldPreventDefault) return;
        event.preventDefault();
        if (decision.shouldRedirectToTimeline && timelineRef.current) {
            timelineRef.current.scrollTop += event.deltaY;
        }
    }, []);

    const handleActionPrompt = useCallback((prompt: string, mode?: AgentMode) => {
        sendMessage(prompt, page, section, undefined, mode, studyId);
    }, [sendMessage, page, section, studyId]);

    const handleSaveToNotes = useCallback(async (content: string, messageId: string) => {
        if (!params?.id) return;
        await createNoteAction(params.id, content, "conversation", currentConversationId ?? undefined, messageId);
    }, [params?.id, currentConversationId]);

    const handleBranchFromMessage = useCallback(async (messageId: string, createdAt: string) => {
        if (!currentConversationId || isBranching || isLoading) return;
        setIsBranching(true);
        try {
            await branchConversation(currentConversationId, messageId, createdAt);
        } finally {
            setIsBranching(false);
        }
    }, [currentConversationId, isBranching, isLoading, branchConversation]);

    const retryLastMessage = useCallback((replaceRunId?: string | null) => {
        if (isLoading) return;
        const lastUserMessage = [...messages]
            .reverse()
            .find((message) => message.sender === "user" && message.text.trim().length > 0);
        if (!lastUserMessage) return;
        sendMessage(
            lastUserMessage.text,
            lastUserMessage.context?.page ?? page,
            lastUserMessage.context?.section,
            selectedModel,
            undefined,
            studyId,
            {
                requestKey: generateChatUnificationRequestKey(),
                expectedModel: selectedModel ?? null,
                source: "retry_action",
            },
            undefined,
            replaceRunId ? { replaceRunId } : undefined,
        );
    }, [isLoading, messages, page, sendMessage, selectedModel, studyId]);

    const resumeFailedPlan = useCallback(() => {
        if (isLoading) return;
        const planMessage = [...messages]
            .reverse()
            .find((message) => message.artifact?.type === "plan" && message.artifact?.payload);
        if (!planMessage?.artifact) return;

        const payload = planMessage.artifact.payload as {
            steps?: Array<{ status?: "pending" | "running" | "completed" | "failed" | "skipped" }>;
        };
        if (!Array.isArray(payload.steps) || payload.steps.length === 0) return;

        const selectedIndexes = payload.steps
            .map((step, index) =>
                step.status === "completed" || step.status === "skipped" ? null : index
            )
            .filter((value): value is number => value !== null);
        if (selectedIndexes.length === 0) return;
        executePlan(planMessage.artifact.id, selectedIndexes);
    }, [executePlan, isLoading, messages]);

    const reconnectActiveRun = useCallback((item: Extract<TimelineItem, { type: "error" }>) => {
        if (isLoading) return;
        void reconnectRun(item.errorMeta?.runId ?? item.errorMeta?.activeRunId ?? null);
    }, [isLoading, reconnectRun]);

    const stopAndRetryRun = useCallback((item: Extract<TimelineItem, { type: "error" }>) => {
        if (isLoading) return;
        retryLastMessage(item.errorMeta?.runId ?? item.errorMeta?.activeRunId ?? null);
    }, [isLoading, retryLastMessage]);

    const continueFromDurableStateRun = useCallback((item: Extract<TimelineItem, { type: "error" }>) => {
        if (isLoading) return;
        const runId = item.errorMeta?.runId ?? item.errorMeta?.activeRunId ?? null;
        if (!runId) return;
        const lastUserMessage = [...messages]
            .reverse()
            .find((message) => message.sender === "user" && message.text.trim().length > 0);
        if (!lastUserMessage) return;
        sendMessage(
            lastUserMessage.text,
            lastUserMessage.context?.page ?? page,
            lastUserMessage.context?.section,
            selectedModel,
            undefined,
            studyId,
            undefined,
            undefined,
            {
                replaceRunId: runId,
                continueFromRunId: runId,
                suppressUserMessageAppend: true,
            },
        );
    }, [isLoading, messages, page, sendMessage, selectedModel, studyId]);

    const getConversationGroupLabel = useCallback((conversation: (typeof conversations)[number]) => {
        const date = new Date(conversation.updatedAt);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days === 0) return "Today";
        if (days === 1) return "Yesterday";
        return "Older";
    }, []);
    const timelineItems = useMemo(() => messagesToTimeline(messages), [messages]);
    const { activeProgress, suppressedProgressId } = useMemo(
        () => selectActiveProgress(normalizeTimelineProgressItems(timelineItems)),
        [timelineItems],
    );

    if (isCollapsed) {
        return (
            <div className={styles.collapsedRail} aria-label="Copilot (collapsed)">
                <button
                    type="button"
                    className={styles.panelToggle}
                    aria-label="Expand copilot"
                    aria-controls={panelId}
                    aria-expanded={false}
                    onClick={() => setCollapsed(false)}
                >
                    <span className="material-icons-round">menu_open</span>
                </button>
                <span className={styles.collapsedLabel}>Copilot</span>
            </div>
        );
    }

    // Format relative time
    const formatRelativeTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / (1000 * 60));
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (minutes < 60) return `${minutes}m`;
        if (hours < 24) return `${hours}h`;
        return `${days}d`;
    };

    // Conversation management
    const currentConversation = conversations.find(c => c.id === currentConversationId);
    const currentTitle = currentConversation?.title || "New conversation";

    return (
        <aside ref={panelRef} className={styles.copilot} aria-label="AI copilot" id={panelId} onWheelCapture={handleWheelCapture}>
            <div className={styles.chatArea}>
                {/* Header */}
                <div className={styles.panelHeader}>
                    <button
                        type="button"
                        className={styles.panelToggle}
                        aria-label="Collapse copilot"
                        aria-controls={panelId}
                        aria-expanded={true}
                        onClick={() => setCollapsed(true)}
                        title="Collapse"
                    >
                        <span className="material-icons-round">menu_open</span>
                    </button>

                    <div className={styles.conversationSelector}>
                        <ConversationPicker
                            variant="panel"
                            open={showConversationDropdown}
                            onOpenChange={setShowConversationDropdown}
                            currentConversationId={currentConversationId}
                            currentTitle={currentTitle}
                            conversations={conversations}
                            searchPlaceholder="Search sessions..."
                            groupBy={getConversationGroupLabel}
                            groupOrder={["Today", "Yesterday", "Older"]}
                            renderMeta={(conversation) => formatRelativeTime(conversation.updatedAt)}
                            onSelect={selectConversation}
                            onDelete={deleteConversation}
                            onDuplicate={(id) => branchConversation(id)}
                            onRename={renameConversation}
                        />
                    </div>

                    {/* Header icons */}
                    <div className={styles.headerIcons}>
                        <button
                            type="button"
                            className={styles.headerIconBtn}
                            onClick={async () => {
                                setShowConversationDropdown(false);
                                await newConversation(page, studyId);
                            }}
                            aria-label="New conversation"
                            title="New conversation"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9"/>
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                            </svg>
                        </button>
                        {showReasoningControls && (
                            <ReasoningModeDropdown
                                reasoningMode={reasoningMode}
                                onReasoningModeChange={setReasoningMode}
                                reasoningSupport={reasoningSupport}
                            >
                                <button
                                    type="button"
                                    className={`${styles.headerIconBtn} ${styles.reasoningModeBtn}`}
                                    data-state={reasoningMode}
                                    aria-label={`Reasoning visibility: ${reasoningMode}`}
                                    title={`Reasoning visibility: ${reasoningMode}`}
                                >
                                    <span className="material-icons-round" style={{ fontSize: 16 }}>
                                        psychology
                                    </span>
                                </button>
                            </ReasoningModeDropdown>
                        )}
                        <button
                            type="button"
                            className={styles.headerIconBtn}
                            onClick={async () => {
                                if (!currentConversationId || isBranching) return;
                                setIsBranching(true);
                                try {
                                    await branchConversation(currentConversationId);
                                } finally {
                                    setIsBranching(false);
                                }
                            }}
                            disabled={!currentConversationId || isBranching}
                            aria-label="Branch conversation"
                            title="Branch conversation"
                        >
                            <span className="material-icons-round" style={{ fontSize: 16 }}>
                                {isBranching ? "hourglass_top" : "call_split"}
                            </span>
                        </button>
                        <button
                            type="button"
                            className={styles.headerIconBtn}
                            aria-label="Autonomy settings"
                            title="Autonomy settings"
                            onClick={() => setShowAutonomySettings(true)}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3"/>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Context subhead */}
                <div className={styles.panelSubhead}>
                    <span className={styles.subValue}>{contextDisplay}</span>
                </div>

                {/* Timeline / Message list */}
                <TimelineRenderer
                    messages={messages}
                    isLoading={isLoading}
                    isConversationLoading={isConversationLoading}
                    conversationId={currentConversationId ?? undefined}
                    onInsert={onInsert}
                    emptyState={emptyState}
                    onSuggestionClick={handleSuggestionClick}
                    onActionPrompt={handleActionPrompt}
                    onReviewArtifact={handleReviewArtifact}
                    onApproveArtifactsBatch={approveArtifactsBatch}
                    onExecutePlan={executePlan}
                    onSaveToNotes={handleSaveToNotes}
                    onRetryLastMessage={retryLastMessage}
                    onReconnectRun={reconnectActiveRun}
                    onContinueFromDurableStateRun={continueFromDurableStateRun}
                    onStopAndRetryRun={stopAndRetryRun}
                    onResumeRun={resumeFailedPlan}
                    onBranchFromMessage={handleBranchFromMessage}
                    onAnswerUserInput={answerUserInput}
                    reasoningMode={reasoningMode}
                    hasMore={hasMore}
                    isLoadingOlder={isLoadingOlder}
                    onLoadOlder={loadOlderMessages}
                    onContainerElementChange={handleTimelineContainerElement}
                    suppressedProgressId={suppressedProgressId}
                />

                {/* Input area */}
                <div className={styles.composerHost}>
                    <ComposerActiveProgressBar activeProgress={activeProgress} />
                    <ComposerQueuedFollowUpBar
                        queuedFollowUp={queuedFollowUp}
                        onEdit={handleEditQueuedFollowUp}
                        onRemove={clearQueuedFollowUp}
                    />
                    <CopilotInput
                        page={page}
                        section={section}
                        studyId={studyId}
                        inputPlaceholder={inputPlaceholder}
                        prefillCommand={activePrefillCommand}
                        onPrefillConsumed={handlePrefillConsumed}
                    />
                </div>
            </div>
            <AutonomySettings />
        </aside>
    );
}
