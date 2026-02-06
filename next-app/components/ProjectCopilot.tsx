"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useProjectCopilot, type CopilotPage } from "@/contexts/ProjectCopilotContext";
import { TimelineRenderer } from "./copilot/TimelineRenderer";
import { CopilotInput } from "./copilot/CopilotInput";
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
    contextDisplay,
    emptyState,
    inputPlaceholder,
    onInsert,
    panelId = "project-copilot-panel",
}: ProjectCopilotProps) {
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
    } = useProjectCopilot();

    const [showConversationDropdown, setShowConversationDropdown] = useState(false);
    const [conversationSearch, setConversationSearch] = useState("");
    const conversationDropdownRef = useRef<HTMLDivElement | null>(null);

    // Close dropdown on click outside
    useEffect(() => {
        if (!showConversationDropdown) return;
        const handleClickOutside = (e: MouseEvent) => {
            if (conversationDropdownRef.current && !conversationDropdownRef.current.contains(e.target as Node)) {
                setShowConversationDropdown(false);
                setConversationSearch("");
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showConversationDropdown]);

    const handleSuggestionClick = useCallback((_prompt: string) => {
        // Suggestions populate the input — currently handled by CopilotInput
        // Phase 4.2 will upgrade this to send the message directly
    }, []);

    if (isCollapsed) {
        return (
            <button
                type="button"
                className={styles.expandRailRight}
                aria-label="Expand copilot"
                aria-controls={panelId}
                aria-expanded={false}
                onClick={() => setCollapsed(false)}
            >
                <span className={styles.expandRailText}>Copilot</span>
                <span className="material-icons-round">chevron_left</span>
            </button>
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

    const renderConversationGroup = (label: string, convs: typeof conversations) => {
        if (convs.length === 0) return null;
        return (
            <>
                <div className={styles.conversationGroupLabel}>{label}</div>
                {convs.map((conv) => (
                    <div
                        key={conv.id}
                        className={`${styles.conversationDropdownItem} ${currentConversationId === conv.id ? styles.conversationDropdownItemActive : ""}`}
                        onClick={() => {
                            selectConversation(conv.id);
                            setShowConversationDropdown(false);
                            setConversationSearch("");
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

    return (
        <aside className={styles.copilot} aria-label="AI copilot" id={panelId}>
            <div className={styles.chatArea}>
                {/* Header */}
                <div className={styles.panelHeader}>
                    <div className={styles.conversationSelector} ref={conversationDropdownRef}>
                        <button
                            type="button"
                            className={styles.conversationSelectorBtn}
                            onClick={() => setShowConversationDropdown(!showConversationDropdown)}
                            aria-haspopup="listbox"
                            aria-expanded={showConversationDropdown}
                        >
                            <span className={styles.conversationSelectorTitle}>{currentTitle}</span>
                            <svg className={styles.chevronIcon} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="6 9 12 15 18 9"/>
                            </svg>
                        </button>

                        {showConversationDropdown && (
                            <div className={styles.conversationDropdown}>
                                <div className={styles.conversationSearchWrapper}>
                                    <input
                                        type="text"
                                        placeholder="Search sessions..."
                                        value={conversationSearch}
                                        onChange={(e) => setConversationSearch(e.target.value)}
                                        className={styles.conversationSearchInput}
                                        autoFocus
                                    />
                                </div>
                                <div className={styles.conversationDropdownList}>
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
                            </div>
                        )}
                    </div>

                    {/* Header icons */}
                    <div className={styles.headerIcons}>
                        <button
                            type="button"
                            className={styles.headerIconBtn}
                            onClick={async () => {
                                setShowConversationDropdown(false);
                                setConversationSearch("");
                                await newConversation(page);
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
                            aria-label="Settings"
                            title="Settings"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="3"/>
                                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                            </svg>
                        </button>
                        <button
                            type="button"
                            className={styles.headerIconBtn}
                            aria-label="Collapse copilot"
                            aria-controls={panelId}
                            aria-expanded={true}
                            onClick={() => setCollapsed(true)}
                            title="Collapse"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 18 15 12 9 6"/>
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
                />

                {/* Input area */}
                <CopilotInput
                    page={page}
                    section={section}
                    inputPlaceholder={inputPlaceholder}
                />
            </div>
        </aside>
    );
}
