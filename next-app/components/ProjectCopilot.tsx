"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useProjectCopilot, CopilotPage } from "@/contexts/ProjectCopilotContext";
import styles from "./ProjectCopilot.module.css";
import markdownStyles from "@/styles/markdown.module.css";
import { USER_SELECTABLE_MODELS, type SelectableModelId } from "@/lib/ai/config";
import { useVoiceInput } from "@/hooks/useVoiceInput";

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
        sendMessage,
        // Conversation management
        conversations,
        currentConversationId,
        selectConversation,
        newConversation,
        deleteConversation,
    } = useProjectCopilot();

    const [input, setInput] = useState("");
    const [selectedModel, setSelectedModel] = useState<SelectableModelId>(() => {
        if (typeof window === "undefined") return "gpt-5.2";
        const stored = window.localStorage.getItem("litrev_copilot_model");
        const valid = USER_SELECTABLE_MODELS.some(m => m.id === stored);
        return valid ? (stored as SelectableModelId) : "gpt-5.2";
    });
    const [showModelMenu, setShowModelMenu] = useState(false);
    const [showConversationDropdown, setShowConversationDropdown] = useState(false);
    const [conversationSearch, setConversationSearch] = useState("");
    const listRef = useRef<HTMLDivElement | null>(null);
    const autoScrollRef = useRef(true);
    const modelMenuRef = useRef<HTMLDivElement | null>(null);
    const conversationDropdownRef = useRef<HTMLDivElement | null>(null);

    // Voice input
    const handleTranscription = useCallback((text: string) => {
        setInput((prev) => {
            const separator = prev.trim() ? " " : "";
            return prev + separator + text;
        });
    }, []);
    const { state: voiceState, error: voiceError, toggleRecording, clearError: clearVoiceError } = useVoiceInput(handleTranscription);

    // Persist model preference
    useEffect(() => {
        if (typeof window !== "undefined") {
            window.localStorage.setItem("litrev_copilot_model", selectedModel);
        }
    }, [selectedModel]);

    // Close dropdowns on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) {
                setShowModelMenu(false);
            }
            if (conversationDropdownRef.current && !conversationDropdownRef.current.contains(e.target as Node)) {
                setShowConversationDropdown(false);
                setConversationSearch("");
            }
        };
        if (showModelMenu || showConversationDropdown) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [showModelMenu, showConversationDropdown]);

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
        sendMessage(text, page, section, selectedModel);
        setInput("");
    }, [input, page, section, sendMessage, selectedModel]);

    const handleCopy = useCallback((text: string) => {
        navigator.clipboard.writeText(text).catch(console.error);
    }, []);

    const handleSuggestionClick = useCallback((prompt: string) => {
        setInput(prompt);
    }, []);

    const handleFileAttach = useCallback(() => {
        // TODO: Implement file attachment backend
        // For now, just show a placeholder interaction
        console.log("File attachment clicked - backend not implemented yet");
    }, []);

    const selectedModelInfo = USER_SELECTABLE_MODELS.find(m => m.id === selectedModel);

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

    // Format relative time (e.g., "7m", "1h", "2d")
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

    // Get current conversation title
    const currentConversation = conversations.find(c => c.id === currentConversationId);
    const currentTitle = currentConversation?.title || "New conversation";

    // Filter conversations by search
    const filteredConversations = conversationSearch
        ? conversations.filter(c =>
            (c.title || "New conversation").toLowerCase().includes(conversationSearch.toLowerCase())
          )
        : conversations;

    // Group conversations by date
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

    return (
        <aside className={styles.copilot} aria-label="AI copilot" id={panelId}>
            {/* Main Chat Area */}
            <div className={styles.chatArea}>
                {/* Header - Clean design with dropdown and icons */}
                <div className={styles.panelHeader}>
                    {/* Conversation Dropdown Selector */}
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

                        {/* Dropdown */}
                        {showConversationDropdown && (
                            <div className={styles.conversationDropdown}>
                                {/* Search */}
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

                                {/* Conversation List */}
                                <div className={styles.conversationDropdownList}>
                                    {filteredConversations.length === 0 ? (
                                        <div className={styles.noConversationsDropdown}>
                                            No conversations found
                                        </div>
                                    ) : (
                                        <>
                                            {groupedConversations.today.length > 0 && (
                                                <>
                                                    <div className={styles.conversationGroupLabel}>Today</div>
                                                    {groupedConversations.today.map((conv) => (
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
                                            )}
                                            {groupedConversations.yesterday.length > 0 && (
                                                <>
                                                    <div className={styles.conversationGroupLabel}>Yesterday</div>
                                                    {groupedConversations.yesterday.map((conv) => (
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
                                            )}
                                            {groupedConversations.older.length > 0 && (
                                                <>
                                                    <div className={styles.conversationGroupLabel}>Older</div>
                                                    {groupedConversations.older.map((conv) => (
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
                                            )}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right side icons - minimalist */}
                    <div className={styles.headerIcons}>
                        <button
                            type="button"
                            className={styles.headerIconBtn}
                            onClick={async () => {
                                // Close dropdown if open
                                setShowConversationDropdown(false);
                                setConversationSearch("");
                                // Create new conversation
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

                {/* Context Subhead - more subtle */}
                <div className={styles.panelSubhead}>
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
                                    {msg.sender === "ai" ? (
                                        <div className={markdownStyles.markdownContent}>
                                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                {msg.text}
                                            </ReactMarkdown>
                                        </div>
                                    ) : (
                                        <p className={styles.chatText}>{msg.text}</p>
                                    )}
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
                        {isLoading && messages.length > 0 && messages[messages.length - 1].sender === "user" && (
                            <div className={styles.loadingIndicator}>
                                <div className={styles.loadingDots}>
                                    <span className={styles.loadingDot} />
                                    <span className={styles.loadingDot} />
                                    <span className={styles.loadingDot} />
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Input Area - Two-floor design */}
            <form
                className={styles.inputBox}
                onSubmit={(e) => {
                    e.preventDefault();
                    handleSend();
                }}
            >
                {/* Upper floor: text input */}
                <textarea
                    value={input}
                    onChange={(e) => {
                        setInput(e.target.value);
                        // Auto-resize
                        e.target.style.height = "auto";
                        e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                        }
                    }}
                    placeholder={isLoading ? "Thinking..." : inputPlaceholder}
                    aria-label="Copilot prompt"
                    disabled={isLoading}
                    className={styles.inputTextarea}
                    rows={1}
                />

                {/* Lower floor: actions */}
                <div className={styles.inputBar}>
                    <div className={styles.inputBarLeft}>
                        {/* Model selector */}
                        <div className={styles.modelSelector} ref={modelMenuRef}>
                            <button
                                type="button"
                                className={styles.modelBtn}
                                onClick={() => setShowModelMenu(!showModelMenu)}
                                aria-haspopup="listbox"
                                aria-expanded={showModelMenu}
                            >
                                {selectedModelInfo?.name || "GPT-5.2"}
                                <span className="material-icons-round">expand_more</span>
                            </button>
                            {showModelMenu && (
                                <div className={styles.modelDropdown} role="listbox">
                                    {(() => {
                                        const groups = new Map<string, typeof USER_SELECTABLE_MODELS[number][]>();
                                        for (const model of USER_SELECTABLE_MODELS) {
                                            const list = groups.get(model.provider) || [];
                                            list.push(model);
                                            groups.set(model.provider, list);
                                        }
                                        const providerLabels: Record<string, string> = {
                                            openai: "OpenAI",
                                            anthropic: "Anthropic",
                                            xai: "xAI",
                                        };
                                        return Array.from(groups.entries()).map(([provider, models]) => (
                                            <div key={provider}>
                                                <div className={styles.modelGroupLabel}>
                                                    {providerLabels[provider] || provider}
                                                </div>
                                                {models.map((model) => (
                                                    <button
                                                        key={model.id}
                                                        type="button"
                                                        className={`${styles.modelItem} ${selectedModel === model.id ? styles.modelItemActive : ""}`}
                                                        onClick={() => {
                                                            setSelectedModel(model.id);
                                                            setShowModelMenu(false);
                                                        }}
                                                        role="option"
                                                        aria-selected={selectedModel === model.id}
                                                    >
                                                        <div className={styles.modelItemInner}>
                                                            <span className={`material-icons-round ${styles.modelItemIcon}`}>
                                                                {model.icon}
                                                            </span>
                                                            <span className={styles.modelItemName}>{model.name}</span>
                                                            <span className={styles.modelItemDesc}>{model.description}</span>
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        ));
                                    })()}
                                </div>
                            )}
                        </div>

                        {/* File attachment */}
                        <button
                            type="button"
                            className={styles.actionBtn}
                            onClick={handleFileAttach}
                            aria-label="Attach file"
                            title="Attach file"
                        >
                            <span className="material-icons-round">add</span>
                        </button>

                        {/* Voice input */}
                        <button
                            type="button"
                            className={`${styles.actionBtn} ${voiceState === "recording" ? styles.actionBtnRecording : ""}`}
                            onClick={toggleRecording}
                            disabled={voiceState === "transcribing" || isLoading}
                            aria-label={voiceState === "recording" ? "Stop recording" : voiceState === "transcribing" ? "Transcribing..." : "Voice input"}
                            title={voiceState === "recording" ? "Stop recording" : voiceState === "transcribing" ? "Transcribing..." : "Voice input"}
                        >
                            <span className="material-icons-round">
                                {voiceState === "recording" ? "stop_circle" : voiceState === "transcribing" ? "hourglass_top" : "mic"}
                            </span>
                        </button>
                    </div>

                    {/* Send button */}
                    <button
                        type="submit"
                        className={`${styles.sendBtn} ${input.trim() ? styles.sendBtnActive : ""}`}
                        aria-label="Send"
                        disabled={isLoading || !input.trim()}
                    >
                        <span className="material-icons-round">
                            {isLoading ? "more_horiz" : "arrow_upward"}
                        </span>
                    </button>
                </div>

                {voiceError && (
                    <div className={styles.voiceError}>
                        <span>{voiceError}</span>
                        <button type="button" onClick={clearVoiceError} aria-label="Dismiss">
                            <span className="material-icons-round">close</span>
                        </button>
                    </div>
                )}
            </form>
            </div>
        </aside>
    );
}
