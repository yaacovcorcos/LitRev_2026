"use client";

import { useCallback, useState, useRef, useEffect, useMemo } from "react";
import * as Popover from "@radix-ui/react-popover";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import type { CopilotPage } from "@/types/ai";
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
        branchConversation,
        sendMessage,
        handleReviewArtifact,
        executePlan,
        shouldOfferSummary,
        summarizeAndRefresh,
        isSummarizing,
    } = useProjectCopilot();

    const [showDropdown, setShowDropdown] = useState(false);
    const [search, setSearch] = useState("");
    const [activeDescendantId, setActiveDescendantId] = useState<string | null>(null);
    const [isBranching, setIsBranching] = useState(false);
    const listRef = useRef<HTMLDivElement | null>(null);

    // Reset active descendant when search changes
    useEffect(() => {
        setActiveDescendantId(null);
    }, [search]);

    const currentConversation = conversations.find(c => c.id === currentConversationId);
    const currentTitle = currentConversation?.title || "New conversation";

    const filtered = search
        ? conversations.filter(c =>
            (c.title || "New conversation").toLowerCase().includes(search.toLowerCase())
        )
        : conversations;

    // Flat list of IDs for keyboard navigation
    const flatIds = filtered.map(c => c.id);

    const handleListboxKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            const currentIndex = activeDescendantId ? flatIds.indexOf(activeDescendantId) : -1;
            const nextIndex = currentIndex < flatIds.length - 1 ? currentIndex + 1 : 0;
            const nextId = flatIds[nextIndex];
            setActiveDescendantId(nextId);
            document.getElementById(`cmv-opt-${nextId}`)?.scrollIntoView({ block: "nearest" });
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const currentIndex = activeDescendantId ? flatIds.indexOf(activeDescendantId) : 0;
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : flatIds.length - 1;
            const prevId = flatIds[prevIndex];
            setActiveDescendantId(prevId);
            document.getElementById(`cmv-opt-${prevId}`)?.scrollIntoView({ block: "nearest" });
        } else if (e.key === "Enter" && activeDescendantId) {
            e.preventDefault();
            selectConversation(activeDescendantId);
            setShowDropdown(false);
            setSearch("");
            setActiveDescendantId(null);
        } else if (e.key === "Home") {
            e.preventDefault();
            const firstId = flatIds[0];
            if (firstId) {
                setActiveDescendantId(firstId);
                document.getElementById(`cmv-opt-${firstId}`)?.scrollIntoView({ block: "nearest" });
            }
        } else if (e.key === "End") {
            e.preventDefault();
            const lastId = flatIds[flatIds.length - 1];
            if (lastId) {
                setActiveDescendantId(lastId);
                document.getElementById(`cmv-opt-${lastId}`)?.scrollIntoView({ block: "nearest" });
            }
        } else if (e.key === "Escape") {
            e.preventDefault();
            setShowDropdown(false);
            setSearch("");
            setActiveDescendantId(null);
        }
    };

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
                    <div className={styles.selector}>
                        <Popover.Root
                            open={showDropdown}
                            onOpenChange={(open) => {
                                setShowDropdown(open);
                                if (open) {
                                    const initialId = currentConversationId ?? flatIds[0] ?? null;
                                    setActiveDescendantId(initialId);
                                } else {
                                    setSearch("");
                                    setActiveDescendantId(null);
                                }
                            }}
                        >
                            <Popover.Trigger asChild>
                                <button
                                    type="button"
                                    className={styles.selectorBtn}
                                    title={currentTitle}
                                    aria-haspopup="listbox"
                                    aria-expanded={showDropdown}
                                    aria-controls="cmv-listbox"
                                >
                                    <span className={styles.selectorTitle}>{currentTitle}</span>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="6 9 12 15 18 9" />
                                    </svg>
                                </button>
                            </Popover.Trigger>
                            <Popover.Portal>
                                <Popover.Content className={styles.dropdown} side="bottom" align="start" sideOffset={4}>
                                    <div className={styles.dropdownSearch}>
                                        <input
                                            type="text"
                                            placeholder="Search sessions..."
                                            value={search}
                                            onChange={(e) => setSearch(e.target.value)}
                                            className={styles.dropdownSearchInput}
                                            autoFocus
                                            role="combobox"
                                            aria-autocomplete="list"
                                            aria-controls="cmv-listbox"
                                            aria-expanded={showDropdown}
                                            aria-activedescendant={activeDescendantId ? `cmv-opt-${activeDescendantId}` : undefined}
                                            onKeyDown={handleListboxKeyDown}
                                        />
                                    </div>
                                    <div
                                        ref={listRef}
                                        className={styles.dropdownList}
                                        role="listbox"
                                        id="cmv-listbox"
                                    >
                                        {filtered.length === 0 ? (
                                            <div className={styles.dropdownEmpty}>No conversations found</div>
                                        ) : (
                                            filtered.map((conv) => (
                                                <div
                                                    key={conv.id}
                                                    id={`cmv-opt-${conv.id}`}
                                                    className={`${styles.dropdownItem} ${currentConversationId === conv.id ? styles.dropdownItemActive : ""} ${activeDescendantId === conv.id ? styles.dropdownItemHighlight : ""}`}
                                                    onClick={() => {
                                                        selectConversation(conv.id);
                                                        setShowDropdown(false);
                                                        setSearch("");
                                                        setActiveDescendantId(null);
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
                                </Popover.Content>
                            </Popover.Portal>
                        </Popover.Root>
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
                        <button
                            type="button"
                            className={styles.newBtn}
                            onClick={() => { void summarizeAndRefresh(); }}
                            disabled={!currentConversationId || !shouldOfferSummary || isSummarizing}
                            aria-label="Compress history"
                            title={shouldOfferSummary ? "Compress history" : "Compress history (available after longer chats)"}
                        >
                            <span className="material-icons-round" style={{ fontSize: 16 }}>
                                {isSummarizing ? "hourglass_top" : "compress"}
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
                        emptyState={{
                            icon: "chat",
                            title: "Start a conversation",
                            description: "Ask anything about your project, search for studies, or plan your next steps.",
                            suggestions: [],
                        }}
                        onSuggestionClick={handleSuggestionClick}
                        onReviewArtifact={handleReviewArtifact}
                        onExecutePlan={executePlan}
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
