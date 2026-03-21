"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import type { CopilotPage } from "@/types/ai";
import type { AgentMode } from "@/types/agent";
import type { TimelineItem } from "@/types/timeline";
import { useProjectState } from "@/hooks/useProjectState";
import { getSuggestions } from "@/lib/agent/suggestions";
import { createNoteAction } from "@/app/actions/notes";
import { selectActiveProgress, normalizeTimelineProgressItems } from "@/lib/ai/active-progress";
import { TimelineRenderer } from "@/components/copilot/TimelineRenderer";
import { CopilotInput } from "@/components/copilot/CopilotInput";
import { ComposerActiveProgressBar } from "@/components/copilot/ComposerActiveProgressBar";
import { ComposerPendingApprovalBar } from "@/components/copilot/ComposerPendingApprovalBar";
import { ComposerQueuedFollowUpBar } from "@/components/copilot/ComposerQueuedFollowUpBar";
import { usePendingApprovalBarState } from "@/components/copilot/usePendingApprovalBarState";
import { AutonomySettings } from "@/components/copilot/AutonomySettings";
import { ConversationPicker } from "@/components/ui/ConversationPicker";
import { generateChatUnificationRequestKey } from "@/lib/ai/chat-unification-telemetry";
import { messagesToTimeline } from "@/components/copilot/StreamReducer";
import { buildProjectConversationPath } from "@/lib/durable-route-state";
import styles from "./ConversationMainView.module.css";

export type ConversationMainViewProps = {
    projectId: string;
};

const AI_PAGE_INSPIRED_SUGGESTIONS = [
    {
        label: "Find related studies",
        prompt: "Find me recent papers about ",
        icon: "search",
        description: "Discover recent literature connected to your topic",
    },
    {
        label: "Summarize a paper",
        prompt: "I need help summarizing a paper. Here's the abstract: ",
        icon: "description",
        description: "Turn dense abstracts into clear takeaways",
    },
    {
        label: "Help draft a section",
        prompt: "Help me draft the Introduction section of my literature review.",
        icon: "edit_note",
        description: "Draft publication-ready section text quickly",
    },
] as const;

export function ConversationMainView({ projectId }: ConversationMainViewProps) {
    const router = useRouter();
    const {
        messages,
        isLoading,
        isConversationLoading,
        conversations,
        currentConversationId,
        queuedFollowUp,
        clearQueuedFollowUp,
        selectConversation,
        newConversation,
        branchConversation,
        deleteConversation,
        renameConversation,
        sendMessage,
        handleReviewArtifact,
        handleUndoArtifact,
        approveArtifactsBatch,
        executePlan,
        reconnectRun,
        answerUserInput,
        selectedModel,
        hasMore,
        isLoadingOlder,
        loadOlderMessages,
    } = useProjectCopilot();

    const [showDropdown, setShowDropdown] = useState(false);
    const [isBranching, setIsBranching] = useState(false);

    const currentConversation = conversations.find(c => c.id === currentConversationId);
    const currentTitle = currentConversation?.title || "New conversation";


    // Dynamic suggestion chips from project state (Phase 4.2)
    const projectState = useProjectState(projectId, { bootstrap: true });
    const chips = useMemo(() => (
        projectState.isReady ? getSuggestions(projectState.snapshot) : []
    ), [projectState.isReady, projectState.snapshot]);
    const emptyStateSuggestions = useMemo(() => {
        const merged = [
            ...chips.map((chip) => ({
                label: chip.label,
                prompt: chip.prompt,
                icon: chip.icon,
                description: chip.description,
            })),
            ...AI_PAGE_INSPIRED_SUGGESTIONS,
        ];
        const unique: Array<{ label: string; prompt: string; icon: string; description: string }> = [];
        const seen = new Set<string>();
        for (const suggestion of merged) {
            const key = `${suggestion.label}|${suggestion.prompt}`;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(suggestion);
            if (unique.length >= 6) break;
        }
        return unique;
    }, [chips]);

    const [prefillCommand, setPrefillCommand] = useState<{ text: string; id: string } | null>(null);

    const handleSuggestionClick = useCallback((prompt: string) => {
        setPrefillCommand({ text: prompt, id: crypto.randomUUID() });
    }, []);

    const handleEditQueuedFollowUp = useCallback(() => {
        if (!queuedFollowUp) return;
        clearQueuedFollowUp();
        setPrefillCommand({ text: queuedFollowUp.text, id: crypto.randomUUID() });
    }, [clearQueuedFollowUp, queuedFollowUp]);

    const handleActionPrompt = useCallback((prompt: string, mode?: AgentMode) => {
        sendMessage(prompt, "overview" as CopilotPage, undefined, undefined, mode);
    }, [sendMessage]);

    const handlePrefillConsumed = useCallback(() => {
        setPrefillCommand(null);
    }, []);

    const handleSaveToNotes = useCallback(async (content: string, messageId: string) => {
        await createNoteAction(projectId, content, "conversation", currentConversationId ?? undefined, messageId);
    }, [projectId, currentConversationId]);

    const navigateToConversation = useCallback((conversationId: string) => {
        router.push(buildProjectConversationPath(projectId, conversationId));
    }, [projectId, router]);

    const handleSelectConversation = useCallback(async (conversationId: string) => {
        const selected = await selectConversation(conversationId);
        if (!selected) {
            router.push(`/project/${projectId}`);
            return;
        }
        navigateToConversation(conversationId);
    }, [navigateToConversation, projectId, router, selectConversation]);

    const handleDeleteConversation = useCallback(async (conversationId: string) => {
        const deleted = await deleteConversation(conversationId);
        if (!deleted) return;
        if (conversationId === currentConversationId) {
            router.push(`/project/${projectId}`);
        }
    }, [currentConversationId, deleteConversation, projectId, router]);

    const handleBranchFromMessage = useCallback(async (messageId: string, createdAt: string) => {
        if (!currentConversationId || isBranching || isLoading) return;
        setIsBranching(true);
        try {
            const nextConversationId = await branchConversation(currentConversationId, messageId, createdAt);
            if (nextConversationId) {
                navigateToConversation(nextConversationId);
            }
        } finally {
            setIsBranching(false);
        }
    }, [branchConversation, currentConversationId, isBranching, isLoading, navigateToConversation]);

    const retryLastMessage = useCallback((replaceRunId?: string | null) => {
        if (isLoading) return;
        const lastUserMessage = [...messages]
            .reverse()
            .find((message) => message.sender === "user" && message.text.trim().length > 0);
        if (!lastUserMessage) return;
        sendMessage(
            lastUserMessage.text,
            lastUserMessage.context?.page ?? ("overview" as CopilotPage),
            lastUserMessage.context?.section,
            selectedModel,
            undefined,
            undefined,
            {
                requestKey: generateChatUnificationRequestKey(),
                expectedModel: selectedModel ?? null,
                source: "retry_action",
            },
            undefined,
            replaceRunId ? { replaceRunId } : undefined,
        );
    }, [isLoading, messages, sendMessage, selectedModel]);

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
            lastUserMessage.context?.page ?? ("overview" as CopilotPage),
            lastUserMessage.context?.section,
            selectedModel,
            undefined,
            undefined,
            {
                requestKey: generateChatUnificationRequestKey(),
                expectedModel: selectedModel ?? null,
                source: "retry_action",
            },
            undefined,
            {
                replaceRunId: runId,
                continueFromRunId: runId,
                suppressUserMessageAppend: true,
            },
        );
    }, [isLoading, messages, sendMessage, selectedModel]);

    const hasMessages = messages.length > 0;
    const timelineItems = useMemo(() => messagesToTimeline(messages), [messages]);
    const { activeProgress, suppressedProgressId } = useMemo(
        () => selectActiveProgress(normalizeTimelineProgressItems(timelineItems)),
        [timelineItems],
    );
    const pendingApprovalBar = usePendingApprovalBarState({
        timeline: timelineItems,
        conversationId: currentConversationId,
        isLoading,
        hasActiveProgress: Boolean(activeProgress),
        approveArtifactsBatch,
    });
    const hasAttachedProgress = Boolean(activeProgress);
    const hasAttachedQueue = Boolean(queuedFollowUp);
    const hasAttachedApproval = pendingApprovalBar.showBar;
    const composerAttachedStack = hasAttachedProgress || hasAttachedQueue || hasAttachedApproval ? "attached" : "none";
    const queuedStackPosition = hasAttachedQueue ? (hasAttachedProgress ? "middle" : "top") : undefined;
    const approvalStackPosition = hasAttachedApproval
        ? (hasAttachedProgress || hasAttachedQueue ? "middle" : "top")
        : undefined;

    return (
        <div className={styles.conversationView}>
            <div className={styles.column}>
                {/* Conversation header */}
                <div className={styles.header}>
                    <div className={styles.selector}>
                        <ConversationPicker
                            variant="page"
                            open={showDropdown}
                            onOpenChange={setShowDropdown}
                            currentConversationId={currentConversationId}
                            currentTitle={currentTitle}
                            conversations={conversations}
                            searchPlaceholder="Search sessions..."
                            renderMeta={(conversation) => `${conversation.messageCount} msgs`}
                            onSelect={handleSelectConversation}
                            onDelete={handleDeleteConversation}
                            onDuplicate={async (id) => {
                                const nextConversationId = await branchConversation(id);
                                if (nextConversationId) {
                                    navigateToConversation(nextConversationId);
                                }
                            }}
                            onRename={renameConversation}
                        />
                    </div>

                    <div className={styles.headerActions}>
                        <button
                            type="button"
                            className={styles.newBtn}
                            onClick={async () => {
                                setShowDropdown(false);
                                const nextConversationId = await newConversation("overview" as CopilotPage);
                                if (nextConversationId) {
                                    navigateToConversation(nextConversationId);
                                }
                            }}
                            aria-label="New conversation"
                            title="New conversation"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 20h9" />
                                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                        </button>
                        <button
                            type="button"
                            className={styles.newBtn}
                            onClick={async () => {
                                if (!currentConversationId || isBranching) return;
                                setIsBranching(true);
                                try {
                                    const nextConversationId = await branchConversation(currentConversationId);
                                    if (nextConversationId) {
                                        navigateToConversation(nextConversationId);
                                    }
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
                    </div>
                </div>

                {/* Content area — centers when empty */}
                <div className={`${styles.contentArea} ${!hasMessages ? styles.contentAreaEmpty : ''}`}>
                    <TimelineRenderer
                        variant="page"
                        messages={messages}
                        isLoading={isLoading}
                        isConversationLoading={isConversationLoading}
                        conversationId={currentConversationId ?? undefined}
                        emptyState={{
                            icon: "chat",
                            title: "Start a conversation",
                            description: "Ask anything about your project, search for studies, or plan your next steps.",
                            suggestions: emptyStateSuggestions,
                        }}
                        onSuggestionClick={handleSuggestionClick}
                        onActionPrompt={handleActionPrompt}
                        onReviewArtifact={handleReviewArtifact}
                        onUndoArtifact={handleUndoArtifact}
                        onExecutePlan={executePlan}
                        onAnswerUserInput={answerUserInput}
                        onSaveToNotes={handleSaveToNotes}
                        onRetryLastMessage={retryLastMessage}
                        onReconnectRun={reconnectActiveRun}
                        onContinueFromDurableStateRun={continueFromDurableStateRun}
                        onStopAndRetryRun={stopAndRetryRun}
                        onResumeRun={resumeFailedPlan}
                        onBranchFromMessage={handleBranchFromMessage}
                        hasMore={hasMore}
                        isLoadingOlder={isLoadingOlder}
                        onLoadOlder={loadOlderMessages}
                        suppressedProgressId={suppressedProgressId}
                    />

                    {/* Input */}
                    <div className={styles.inputWrapper}>
                        <div className={styles.composerStackLane} data-composer-stack-lane="true">
                            <ComposerActiveProgressBar activeProgress={activeProgress} stackPosition="top" />
                            <ComposerQueuedFollowUpBar
                                queuedFollowUp={queuedFollowUp}
                                stackPosition={queuedStackPosition}
                                onEdit={handleEditQueuedFollowUp}
                                onRemove={clearQueuedFollowUp}
                            />
                            {pendingApprovalBar.showBar ? (
                                <ComposerPendingApprovalBar
                                    pendingCount={pendingApprovalBar.pendingCount}
                                    state={pendingApprovalBar.state}
                                    progress={pendingApprovalBar.progress}
                                    resultText={pendingApprovalBar.resultText}
                                    onApproveAll={pendingApprovalBar.approveAll}
                                    onStop={pendingApprovalBar.stopApproval}
                                    stackPosition={approvalStackPosition}
                                />
                            ) : null}
                            <CopilotInput
                                page={"overview" as CopilotPage}
                                inputPlaceholder="Ask about your project..."
                                prefillCommand={prefillCommand}
                                onPrefillConsumed={handlePrefillConsumed}
                                attachedStack={composerAttachedStack}
                                interactionLocked={pendingApprovalBar.interactionLocked}
                            />
                        </div>
                    </div>
                </div>
            </div>
            <AutonomySettings />
        </div>
    );
}
