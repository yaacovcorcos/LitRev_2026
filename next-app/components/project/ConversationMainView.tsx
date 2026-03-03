"use client";

import { useCallback, useMemo, useState } from "react";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import type { CopilotPage } from "@/types/ai";
import type { AgentMode } from "@/types/agent";
import { useProjectState } from "@/hooks/useProjectState";
import { getSuggestions } from "@/lib/agent/suggestions";
import { createNoteAction } from "@/app/actions/notes";
import { TimelineRenderer } from "../copilot/TimelineRenderer";
import { CopilotInput } from "../copilot/CopilotInput";
import { AutonomySettings } from "../copilot/AutonomySettings";
import { SuggestionChips } from "./SuggestionChips";
import { ConversationPicker } from "../ui/ConversationPicker";
import styles from "./ConversationMainView.module.css";

export type ConversationMainViewProps = {
    projectId: string;
};

export function ConversationMainView({ projectId }: ConversationMainViewProps) {
    const {
        messages,
        isLoading,
        isConversationLoading,
        conversations,
        currentConversationId,
        selectConversation,
        newConversation,
        branchConversation,
        deleteConversation,
        renameConversation,
        sendMessage,
        handleReviewArtifact,
        approveArtifactsBatch,
        executePlan,
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
    const snapshot = useProjectState(projectId);
    const chips = useMemo(() => getSuggestions(snapshot), [snapshot]);

    const [prefillCommand, setPrefillCommand] = useState<{ text: string; id: string } | null>(null);

    const handleSuggestionClick = useCallback((prompt: string) => {
        setPrefillCommand({ text: prompt, id: crypto.randomUUID() });
    }, []);

    const handleActionPrompt = useCallback((prompt: string, mode?: AgentMode) => {
        sendMessage(prompt, "overview" as CopilotPage, undefined, undefined, mode);
    }, [sendMessage]);

    const handleChipSend = useCallback((prompt: string) => {
        setPrefillCommand({ text: prompt, id: crypto.randomUUID() });
    }, []);

    const handlePrefillConsumed = useCallback(() => {
        setPrefillCommand(null);
    }, []);

    const handleSaveToNotes = useCallback(async (content: string, messageId: string) => {
        await createNoteAction(projectId, content, "conversation", currentConversationId ?? undefined, messageId);
    }, [projectId, currentConversationId]);

    const handleBranchFromMessage = useCallback(async (messageId: string, createdAt: string) => {
        if (!currentConversationId || isBranching || isLoading) return;
        setIsBranching(true);
        try {
            await branchConversation(currentConversationId, messageId, createdAt);
        } finally {
            setIsBranching(false);
        }
    }, [currentConversationId, isBranching, isLoading, branchConversation]);

    const retryLastMessage = useCallback(() => {
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
                expectedModel: selectedModel ?? null,
                source: "retry_action",
            },
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

    const hasMessages = messages.length > 0;

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
                            onSelect={selectConversation}
                            onDelete={deleteConversation}
                            onDuplicate={(id) => branchConversation(id)}
                            onRename={renameConversation}
                        />
                    </div>

                    <div className={styles.headerActions}>
                        <button
                            type="button"
                            className={styles.newBtn}
                            onClick={async () => {
                                setShowDropdown(false);
                                await newConversation("overview" as CopilotPage);
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
                            suggestions: [],
                        }}
                        onSuggestionClick={handleSuggestionClick}
                        onActionPrompt={handleActionPrompt}
                        onReviewArtifact={handleReviewArtifact}
                        onApproveArtifactsBatch={approveArtifactsBatch}
                        onExecutePlan={executePlan}
                        onAnswerUserInput={answerUserInput}
                        onSaveToNotes={handleSaveToNotes}
                        onRetryLastMessage={retryLastMessage}
                        onResumeRun={resumeFailedPlan}
                        onBranchFromMessage={handleBranchFromMessage}
                        hasMore={hasMore}
                        isLoadingOlder={isLoadingOlder}
                        onLoadOlder={loadOlderMessages}
                    />

                    {/* Suggestion chips (shown when no messages) */}
                    {!hasMessages && (
                        <SuggestionChips
                            projectId={projectId}
                            onSend={handleChipSend}
                            chips={chips}
                        />
                    )}

                    {/* Input */}
                    <div className={styles.inputWrapper}>
                        <CopilotInput
                            page={"overview" as CopilotPage}
                            inputPlaceholder="Ask about your project..."
                            prefillCommand={prefillCommand}
                            onPrefillConsumed={handlePrefillConsumed}
                        />
                    </div>
                </div>
            </div>
            <AutonomySettings />
        </div>
    );
}
