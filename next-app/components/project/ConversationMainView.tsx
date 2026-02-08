"use client";

import { useCallback, useState, useRef, useEffect, useMemo } from "react";
import { useProjectCopilot, type CopilotPage } from "@/contexts/ProjectCopilotContext";
import { useProjectState } from "@/hooks/useProjectState";
import { getSuggestions } from "@/lib/agent/suggestions";
import { createNoteAction } from "@/app/actions/notes";
import { TimelineRenderer } from "../copilot/TimelineRenderer";
import { CopilotInput } from "../copilot/CopilotInput";
import { AutonomySettings } from "../copilot/AutonomySettings";
import { SuggestionChips } from "./SuggestionChips";
import styles from "./ConversationMainView.module.css";

export type ConversationMainViewProps = {
    projectId: string;
};

export function ConversationMainView({ projectId }: ConversationMainViewProps) {
    const {
        messages,
        isLoading,
        conversations,
        currentConversationId,
        selectConversation,
        newConversation,
        sendMessage,
        handleReviewArtifact,
    } = useProjectCopilot();

    const [showDropdown, setShowDropdown] = useState(false);
    const [search, setSearch] = useState("");
    const dropdownRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!showDropdown) return;
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                setShowDropdown(false);
                setSearch("");
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [showDropdown]);

    const currentConversation = conversations.find(c => c.id === currentConversationId);
    const currentTitle = currentConversation?.title || "New conversation";

    const filtered = search
        ? conversations.filter(c =>
            (c.title || "New conversation").toLowerCase().includes(search.toLowerCase())
        )
        : conversations;

    // Dynamic suggestion chips from project state (Phase 4.2)
    const snapshot = useProjectState(projectId);
    const chips = useMemo(() => getSuggestions(snapshot), [snapshot]);

    const [prefill, setPrefill] = useState("");

    const handleSuggestionClick = useCallback((prompt: string) => {
        setPrefill(prompt);
    }, []);

    const handleChipSend = useCallback((prompt: string) => {
        setPrefill(prompt);
    }, []);

    const handlePrefillConsumed = useCallback(() => {
        setPrefill("");
    }, []);

    const handleSaveToNotes = useCallback(async (content: string, messageId: string) => {
        await createNoteAction(projectId, content, "conversation", currentConversationId ?? undefined, messageId);
    }, [projectId, currentConversationId]);

    const hasMessages = messages.length > 0;

    return (
        <div className={styles.conversationView}>
            <div className={styles.column}>
                {/* Conversation header */}
                <div className={styles.header}>
                    <div className={styles.selector} ref={dropdownRef}>
                        <button
                            type="button"
                            className={styles.selectorBtn}
                            onClick={() => setShowDropdown(!showDropdown)}
                            aria-haspopup="listbox"
                            aria-expanded={showDropdown}
                        >
                            <span className={styles.selectorTitle}>{currentTitle}</span>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </button>

                        {showDropdown && (
                            <div className={styles.dropdown}>
                                <div className={styles.dropdownSearch}>
                                    <input
                                        type="text"
                                        placeholder="Search sessions..."
                                        value={search}
                                        onChange={(e) => setSearch(e.target.value)}
                                        className={styles.dropdownSearchInput}
                                        autoFocus
                                    />
                                </div>
                                <div className={styles.dropdownList}>
                                    {filtered.length === 0 ? (
                                        <div className={styles.dropdownEmpty}>No conversations found</div>
                                    ) : (
                                        filtered.map((conv) => (
                                            <div
                                                key={conv.id}
                                                className={`${styles.dropdownItem} ${currentConversationId === conv.id ? styles.dropdownItemActive : ""}`}
                                                onClick={() => {
                                                    selectConversation(conv.id);
                                                    setShowDropdown(false);
                                                    setSearch("");
                                                }}
                                                role="option"
                                                aria-selected={currentConversationId === conv.id}
                                            >
                                                <span className={styles.dropdownItemTitle}>
                                                    {conv.title || "New conversation"}
                                                </span>
                                                <span className={styles.dropdownItemCount}>
                                                    {conv.messageCount} msgs
                                                </span>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

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
                </div>

                {/* Content area — centers when empty */}
                <div className={`${styles.contentArea} ${!hasMessages ? styles.contentAreaEmpty : ''}`}>
                    <TimelineRenderer
                        variant="page"
                        messages={messages}
                        isLoading={isLoading}
                        emptyState={{
                            icon: "chat",
                            title: "Start a conversation",
                            description: "Ask anything about your project, search for studies, or plan your next steps.",
                            suggestions: [],
                        }}
                        onSuggestionClick={handleSuggestionClick}
                        onReviewArtifact={handleReviewArtifact}
                        onSaveToNotes={handleSaveToNotes}
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
                    <CopilotInput
                        page={"overview" as CopilotPage}
                        inputPlaceholder="Ask about your project..."
                        prefill={prefill}
                        onPrefillConsumed={handlePrefillConsumed}
                    />
                </div>
            </div>
            <AutonomySettings />
        </div>
    );
}
