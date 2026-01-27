"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useProjectCopilot, CopilotPage } from "@/contexts/ProjectCopilotContext";
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
        setCollapsed,
        sendMessage,
    } = useProjectCopilot();

    const [input, setInput] = useState("");
    const listRef = useRef<HTMLDivElement | null>(null);
    const autoScrollRef = useRef(true);

    // Auto-scroll to bottom when new messages arrive
    useEffect(() => {
        if (!listRef.current) return;
        if (!autoScrollRef.current) return;
        listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [messages]);

    const handleScroll = useCallback(() => {
        if (!listRef.current) return;
        const { scrollTop, clientHeight, scrollHeight } = listRef.current;
        autoScrollRef.current = scrollTop + clientHeight >= scrollHeight - 80;
    }, []);

    const handleSend = useCallback(() => {
        const text = input.trim();
        if (!text) return;
        autoScrollRef.current = true;
        sendMessage(text, page, section);
        setInput("");
    }, [input, page, section, sendMessage]);

    const handleCopy = useCallback((text: string) => {
        navigator.clipboard.writeText(text).catch(console.error);
    }, []);

    const handleSuggestionClick = useCallback((prompt: string) => {
        setInput(prompt);
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

    return (
        <aside className={styles.copilot} aria-label="AI copilot" id={panelId}>
            {/* Header */}
            <div className={styles.panelHeader}>
                <div className={styles.panelTitle}>
                    <span className="material-icons-round">smart_toy</span>
                    Copilot
                </div>
                <div className={styles.panelHeaderActions}>
                    <button
                        type="button"
                        className={styles.iconBtn}
                        aria-label="Collapse copilot"
                        aria-controls={panelId}
                        aria-expanded={true}
                        onClick={() => setCollapsed(true)}
                    >
                        <span className="material-icons-round">chevron_right</span>
                    </button>
                </div>
            </div>

            {/* Context Subhead */}
            <div className={styles.panelSubhead}>
                <span className={styles.subLabel}>Context</span>
                <span className={styles.subValue}>{contextDisplay}</span>
            </div>

            {/* Message List */}
            <div className={styles.copilotBody} ref={listRef} onScroll={handleScroll}>
                {messages.length === 0 ? (
                    <div className={styles.emptyPanel}>
                        <div className={styles.emptyIcon}>
                            <span className="material-icons-round">{emptyState.icon}</span>
                        </div>
                        <h3>{emptyState.title}</h3>
                        <p>{emptyState.description}</p>
                        <div className={styles.suggestRow}>
                            {emptyState.suggestions.map((suggestion) => (
                                <button
                                    key={suggestion.label}
                                    type="button"
                                    className={styles.suggestChip}
                                    onClick={() => handleSuggestionClick(suggestion.prompt)}
                                >
                                    {suggestion.label}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className={styles.chatList}>
                        {messages.map((msg) => (
                            <div
                                key={msg.id}
                                className={`${styles.chatMsg} ${msg.sender === "ai" ? styles.chatMsgAi : styles.chatMsgUser}`}
                            >
                                <div className={styles.chatBubble}>
                                    <pre className={styles.chatText}>{msg.text}</pre>
                                    {msg.sender === "ai" ? (
                                        <div className={styles.chatActions}>
                                            {onInsert ? (
                                                <button
                                                    type="button"
                                                    className={styles.smallBtn}
                                                    onClick={() => onInsert(msg.text)}
                                                >
                                                    Insert
                                                </button>
                                            ) : null}
                                            <button
                                                type="button"
                                                className={styles.smallBtnGhost}
                                                onClick={() => handleCopy(msg.text)}
                                            >
                                                Copy
                                            </button>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Input Area */}
            <div className={styles.copilotInputArea}>
                <form
                    className={styles.copilotInputRow}
                    onSubmit={(e) => {
                        e.preventDefault();
                        handleSend();
                    }}
                >
                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        placeholder={inputPlaceholder}
                        aria-label="Copilot prompt"
                    />
                    <button type="submit" className={styles.iconBtn} aria-label="Send">
                        <span className="material-icons-round">send</span>
                    </button>
                </form>
            </div>
        </aside>
    );
}
