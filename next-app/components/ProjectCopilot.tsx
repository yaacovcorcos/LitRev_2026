"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import type { CopilotPage } from "@/types/ai";
import type { AgentMode } from "@/types/agent";
import { createNoteAction } from "@/app/actions/notes";
import { TimelineRenderer } from "./copilot/TimelineRenderer";
import { CopilotInput } from "./copilot/CopilotInput";
import { AutonomySettings } from "./copilot/AutonomySettings";
import { ConversationPicker } from "./ui/ConversationPicker";
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
    const params = useParams<{ id: string }>();
    const {
        messages,
        isCollapsed,
        isLoading,
        setCollapsed,
        // Conversation management
        conversations,
        currentConversationId,
        isConversationLoading,
        selectConversation,
        newConversation,
        branchConversation,
        sendMessage,
        handleReviewArtifact,
        executePlan,
        shouldOfferSummary,
        summarizeAndRefresh,
        isSummarizing,
        // Autonomy settings (Phase 7)
        setShowAutonomySettings,
    } = useProjectCopilot();

    // Defer Radix-heavy UI until after hydration to avoid ID mismatch warnings
    const [hasMounted, setHasMounted] = useState(false);
    useEffect(() => { setHasMounted(true); }, []);

    const [showConversationDropdown, setShowConversationDropdown] = useState(false);
    const [isBranching, setIsBranching] = useState(false);
    const [prefill, setPrefill] = useState("");

    const handleSuggestionClick = useCallback((prompt: string) => {
        setPrefill(prompt);
    }, []);

    const handlePrefillConsumed = useCallback(() => {
        setPrefill("");
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
    const getConversationGroupLabel = useCallback((conversation: (typeof conversations)[number]) => {
        const date = new Date(conversation.updatedAt);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days === 0) return "Today";
        if (days === 1) return "Yesterday";
        return "Older";
    }, []);

    if (!hasMounted) {
        return <aside className={styles.copilot} aria-label="AI copilot" id={panelId} />;
    }

    return (
        <aside className={styles.copilot} aria-label="AI copilot" id={panelId}>
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
                            onClick={() => { void summarizeAndRefresh(); }}
                            disabled={!currentConversationId || !shouldOfferSummary || isSummarizing}
                            aria-label="Compress history"
                            title={shouldOfferSummary ? "Compress history" : "Compress history (available after longer chats)"}
                        >
                            <span className="material-icons-round" style={{ fontSize: 16 }}>
                                {isSummarizing ? "hourglass_top" : "compress"}
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
                    onExecutePlan={executePlan}
                    onSaveToNotes={handleSaveToNotes}
                    onBranchFromMessage={handleBranchFromMessage}
                />

                {/* Input area */}
                <CopilotInput
                    page={page}
                    section={section}
                    studyId={studyId}
                    inputPlaceholder={inputPlaceholder}
                    prefill={prefill}
                    onPrefillConsumed={handlePrefillConsumed}
                />
            </div>
            <AutonomySettings />
        </aside>
    );
}
