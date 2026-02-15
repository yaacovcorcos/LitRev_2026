"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import type { CopilotPage } from "@/types/ai";
import { createNoteAction } from "@/app/actions/notes";
import { TimelineRenderer } from "./copilot/TimelineRenderer";
import { CopilotInput } from "./copilot/CopilotInput";
import { AutonomySettings } from "./copilot/AutonomySettings";
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
        selectConversation,
        newConversation,
        handleReviewArtifact,
        executePlan,
        // Autonomy settings (Phase 7)
        setShowAutonomySettings,
    } = useProjectCopilot();

    // Defer Radix-heavy UI until after hydration to avoid ID mismatch warnings
    const [hasMounted, setHasMounted] = useState(false);
    useEffect(() => { setHasMounted(true); }, []);

    const [showConversationDropdown, setShowConversationDropdown] = useState(false);
    const [conversationSearch, setConversationSearch] = useState("");
    const [activeDescendantId, setActiveDescendantId] = useState<string | null>(null);
    const listRef = useRef<HTMLDivElement | null>(null);

    // Scope is now driven centrally from layout.tsx — no mount/cleanup effect here

    // Reset active descendant when search changes
    useEffect(() => {
        setActiveDescendantId(null);
    }, [conversationSearch]);

    const handleSuggestionClick = useCallback((_prompt: string) => {
        // Suggestions populate the input — currently handled by CopilotInput
        // Phase 4.2 will upgrade this to send the message directly
    }, []);

    const handleSaveToNotes = useCallback(async (content: string, messageId: string) => {
        if (!params?.id) return;
        await createNoteAction(params.id, content, "conversation", currentConversationId ?? undefined, messageId);
    }, [params?.id, currentConversationId]);

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

    const filteredConversations = conversationSearch
        ? conversations.filter(c =>
            (c.title || "New conversation").toLowerCase().includes(conversationSearch.toLowerCase())
          )
        : conversations;

    const groupConversations = () => {
        const today: typeof conversations = [];
        const yesterday: typeof conversations = [];
        const older: typeof conversations = [];
        const now = new Date();

        filteredConversations.forEach(conv => {
            const date = new Date(conv.updatedAt);
            const diff = now.getTime() - date.getTime();
            const days = Math.floor(diff / (1000 * 60 * 60 * 24));
            if (days === 0) today.push(conv);
            else if (days === 1) yesterday.push(conv);
            else older.push(conv);
        });

        return { today, yesterday, older };
    };

    const groupedConversations = groupConversations();

    // Flat list of all visible conversation IDs for keyboard navigation
    const flatConversationIds = [
        ...groupedConversations.today,
        ...groupedConversations.yesterday,
        ...groupedConversations.older,
    ].map(c => c.id);

    const handleListboxKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            const currentIndex = activeDescendantId ? flatConversationIds.indexOf(activeDescendantId) : -1;
            const nextIndex = currentIndex < flatConversationIds.length - 1 ? currentIndex + 1 : 0;
            const nextId = flatConversationIds[nextIndex];
            setActiveDescendantId(nextId);
            document.getElementById(`convo-opt-${nextId}`)?.scrollIntoView({ block: "nearest" });
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            const currentIndex = activeDescendantId ? flatConversationIds.indexOf(activeDescendantId) : 0;
            const prevIndex = currentIndex > 0 ? currentIndex - 1 : flatConversationIds.length - 1;
            const prevId = flatConversationIds[prevIndex];
            setActiveDescendantId(prevId);
            document.getElementById(`convo-opt-${prevId}`)?.scrollIntoView({ block: "nearest" });
        } else if (e.key === "Enter" && activeDescendantId) {
            e.preventDefault();
            selectConversation(activeDescendantId);
            setShowConversationDropdown(false);
            setConversationSearch("");
            setActiveDescendantId(null);
        }
    };

    const renderConversationGroup = (label: string, convs: typeof conversations) => {
        if (convs.length === 0) return null;
        return (
            <>
                <div className={styles.conversationGroupLabel}>{label}</div>
                {convs.map((conv) => (
                    <div
                        key={conv.id}
                        id={`convo-opt-${conv.id}`}
                        className={`${styles.conversationDropdownItem} ${currentConversationId === conv.id ? styles.conversationDropdownItemActive : ""} ${activeDescendantId === conv.id ? styles.conversationDropdownItemHighlight : ""}`}
                        onClick={() => {
                            selectConversation(conv.id);
                            setShowConversationDropdown(false);
                            setConversationSearch("");
                            setActiveDescendantId(null);
                        }}
                        role="option"
                        aria-selected={currentConversationId === conv.id}
                    >
                        <span className={styles.conversationDropdownTitle}>
                            {conv.title || "New conversation"}
                        </span>
                        <span className={styles.conversationDropdownTime}>
                            {formatRelativeTime(conv.updatedAt)}
                        </span>
                    </div>
                ))}
            </>
        );
    };

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
                        <Popover.Root
                            open={showConversationDropdown}
                            onOpenChange={(open) => {
                                setShowConversationDropdown(open);
                                if (!open) {
                                    setConversationSearch("");
                                    setActiveDescendantId(null);
                                }
                            }}
                        >
                            <Popover.Trigger asChild>
                                <button
                                    type="button"
                                    className={styles.conversationSelectorBtn}
                                >
                                    <span className={styles.conversationSelectorTitle}>{currentTitle}</span>
                                    <svg className={styles.chevronIcon} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="6 9 12 15 18 9"/>
                                    </svg>
                                </button>
                            </Popover.Trigger>
                            <Popover.Portal>
                                <Popover.Content className={styles.conversationDropdown} side="bottom" align="start" sideOffset={4}>
                                    <div className={styles.conversationSearchWrapper}>
                                        <input
                                            type="text"
                                            placeholder="Search sessions..."
                                            value={conversationSearch}
                                            onChange={(e) => setConversationSearch(e.target.value)}
                                            className={styles.conversationSearchInput}
                                            autoFocus
                                            role="combobox"
                                            aria-controls="convo-listbox"
                                            aria-expanded={true}
                                            aria-activedescendant={activeDescendantId ? `convo-opt-${activeDescendantId}` : undefined}
                                            onKeyDown={handleListboxKeyDown}
                                        />
                                    </div>
                                    <div
                                        ref={listRef}
                                        className={styles.conversationDropdownList}
                                        role="listbox"
                                        id="convo-listbox"
                                    >
                                        {filteredConversations.length === 0 ? (
                                            <div className={styles.noConversationsDropdown}>
                                                No conversations found
                                            </div>
                                        ) : (
                                            <>
                                                {renderConversationGroup("Today", groupedConversations.today)}
                                                {renderConversationGroup("Yesterday", groupedConversations.yesterday)}
                                                {renderConversationGroup("Older", groupedConversations.older)}
                                            </>
                                        )}
                                    </div>
                                </Popover.Content>
                            </Popover.Portal>
                        </Popover.Root>
                    </div>

                    {/* Header icons */}
                    <div className={styles.headerIcons}>
                        <button
                            type="button"
                            className={styles.headerIconBtn}
                            onClick={async () => {
                                setShowConversationDropdown(false);
                                setConversationSearch("");
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
                    onInsert={onInsert}
                    emptyState={emptyState}
                    onSuggestionClick={handleSuggestionClick}
                    onReviewArtifact={handleReviewArtifact}
                    onExecutePlan={executePlan}
                    onSaveToNotes={handleSaveToNotes}
                />

                {/* Input area */}
                <CopilotInput
                    page={page}
                    section={section}
                    studyId={studyId}
                    inputPlaceholder={inputPlaceholder}
                />
            </div>
            <AutonomySettings />
        </aside>
    );
}
