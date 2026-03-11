"use client";

import { useCallback, useMemo, useState } from "react";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import type { CopilotPage } from "@/types/ai";
import type { AgentMode } from "@/types/agent";
import { useProjectState } from "@/hooks/useProjectState";
import { getSuggestions } from "@/lib/agent/suggestions";
import { createNoteAction } from "@/app/actions/notes";
import { selectActiveProgress, normalizeTimelineProgressItems } from "@/lib/ai/active-progress";
import { TimelineRenderer } from "../copilot/TimelineRenderer";
import { CopilotInput } from "../copilot/CopilotInput";
import { ComposerActiveProgressBar } from "../copilot/ComposerActiveProgressBar";
import { AutonomySettings } from "../copilot/AutonomySettings";
import { ConversationPicker } from "../ui/ConversationPicker";
import { generateChatUnificationRequestKey } from "@/lib/ai/chat-unification-telemetry";
import { messagesToTimeline } from "../copilot/StreamReducer";
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

    const handleActionPrompt = useCallback((prompt: string, mode?: AgentMode) => {
        sendMessage(prompt, "overview" as CopilotPage, undefined, undefined, mode);
    }, [sendMessage]);

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
                requestKey: generateChatUnificationRequestKey(),
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
    const timelineItems = useMemo(() => messagesToTimeline(messages), [messages]);
    const { activeProgress, suppressedProgressId } = useMemo(
        () => selectActiveProgress(normalizeTimelineProgressItems(timelineItems)),
        [timelineItems],
    );

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
                            suggestions: emptyStateSuggestions,
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
                        suppressedProgressId={suppressedProgressId}
                    />

                    {/* Input */}
                    <div className={styles.inputWrapper}>
                        <ComposerActiveProgressBar activeProgress={activeProgress} />
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
