"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {
    CopilotMessage,
    CopilotMessageAttachment,
    ProjectCopilotState,
    loadProjectCopilotState,
    saveProjectCopilotState,
    createDefaultProjectCopilotState,
} from "@/lib/projectCopilotStorage";
import { buildSystemPrompt, type CopilotContext as CopilotContextType } from "@/lib/ai/prompts/copilot-prompts";
import {
    listConversations,
    getConversation,
    createConversation,
    addMessage,
    archiveConversation,
    updateConversationTitle,
    type ConversationSummary,
    type ConversationWithMessages,
} from "@/app/actions/conversations";
import {
    uploadChatAttachmentAction,
    extractTextFromExistingFileAction,
} from "@/app/actions/files";

export type CopilotPage = "draft" | "protocol" | "ledger" | "study";

export type PendingAttachment = {
    fileAssetId: string;
    filename: string;
    size: number;
    mimeType: string;
    extractedText: string;
    isExisting: boolean;
};

type ConversationListItem = {
    id: string;
    title: string | null;
    messageCount: number;
    updatedAt: string;
};

type ProjectCopilotContextValue = {
    /** Current copilot state */
    state: ProjectCopilotState;
    /** All messages in the copilot */
    messages: CopilotMessage[];
    /** Whether the panel is collapsed */
    isCollapsed: boolean;
    /** Current panel width */
    panelWidth: number;
    /** Whether AI is loading */
    isLoading: boolean;
    /** Toggle the panel collapsed state */
    toggleCollapsed: () => void;
    /** Set the panel collapsed state */
    setCollapsed: (collapsed: boolean) => void;
    /** Update the panel width */
    setPanelWidth: (width: number) => void;
    /** Send a message to the copilot */
    sendMessage: (text: string, page: CopilotPage, section?: string, model?: string) => void;
    /** Clear all messages */
    clearMessages: () => void;

    // Conversation management
    /** List of available conversations */
    conversations: ConversationListItem[];
    /** Current active conversation ID */
    currentConversationId: string | null;
    /** Whether conversations are loading */
    isLoadingConversations: boolean;
    /** Whether conversation sidebar is shown */
    showConversationList: boolean;
    /** Toggle conversation sidebar */
    toggleConversationList: () => void;
    /** Select a conversation */
    selectConversation: (conversationId: string) => Promise<void>;
    /** Create a new conversation */
    newConversation: (page: CopilotPage) => Promise<void>;
    /** Rename a conversation */
    renameConversation: (conversationId: string, title: string) => Promise<void>;
    /** Delete a conversation */
    deleteConversation: (conversationId: string) => Promise<void>;
    /** Refresh conversation list */
    refreshConversations: () => Promise<void>;

    // Attachment support
    /** Currently pending attachment (uploaded but not yet sent) */
    pendingAttachment: PendingAttachment | null;
    /** Whether an attachment is being uploaded/processed */
    isAttaching: boolean;
    /** Upload a new PDF and prepare it as an attachment */
    attachFile: (file: File) => Promise<void>;
    /** Attach an existing study PDF by its FileAsset ID */
    attachExistingFile: (fileAssetId: string) => Promise<void>;
    /** Remove the pending attachment */
    clearAttachment: () => void;
    /** Project ID for the current copilot */
    projectId: string;
};


const ProjectCopilotContext = createContext<ProjectCopilotContextValue | undefined>(undefined);

type ProjectCopilotProviderProps = {
    projectId: string;
    children: ReactNode;
};

export function ProjectCopilotProvider({ projectId, children }: ProjectCopilotProviderProps) {
    const [state, setState] = useState<ProjectCopilotState>(createDefaultProjectCopilotState());
    const [isMounted, setIsMounted] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);

    // Conversation management state
    const [conversations, setConversations] = useState<ConversationListItem[]>([]);
    const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
    const [isLoadingConversations, setIsLoadingConversations] = useState(false);
    const [showConversationList, setShowConversationList] = useState(false);

    // Attachment state
    const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
    const [isAttaching, setIsAttaching] = useState(false);

    // Load panel state from localStorage on mount (not messages - those come from conversations)
    useEffect(() => {
        let isActive = true;
        if (projectId) {
            // Only load panel state (width, collapsed), not messages
            const local = loadProjectCopilotState(projectId);
            setState(prev => ({
                ...prev,
                panel: local.panel,
                // Messages will be loaded from the conversation system
                messages: [],
            }));
            if (isActive) setIsMounted(true);
        } else {
            setIsMounted(true);
        }
        return () => {
            isActive = false;
        };
    }, [projectId]);

    // Load conversations list
    const loadConversations = useCallback(async (): Promise<void> => {
        if (!projectId) return;
        setIsLoadingConversations(true);
        try {
            const convos = await listConversations({ projectId });
            const mapped = convos.map((c) => ({
                id: c.id,
                title: c.title,
                messageCount: c.messageCount,
                updatedAt: c.updatedAt,
            }));
            setConversations(mapped);
        } catch (err) {
            console.error("Failed to load conversations:", err);
        } finally {
            setIsLoadingConversations(false);
        }
    }, [projectId]);

    // Initial load: get conversations and auto-select the most recent one
    useEffect(() => {
        let isActive = true;
        let hasAutoSelected = false;

        const initializeConversations = async () => {
            if (!projectId || hasAutoSelected) return;

            setIsLoadingConversations(true);
            try {
                const convos = await listConversations({ projectId });
                const mapped = convos.map((c) => ({
                    id: c.id,
                    title: c.title,
                    messageCount: c.messageCount,
                    updatedAt: c.updatedAt,
                }));

                if (!isActive) return;
                setConversations(mapped);

                // Auto-select the most recent conversation if one exists
                if (mapped.length > 0) {
                    hasAutoSelected = true;
                    const mostRecent = mapped[0]; // Already sorted by updatedAt desc
                    const convo = await getConversation(mostRecent.id);
                    if (convo && isActive) {
                        setCurrentConversationId(convo.id);
                        // Load messages from the conversation
                        const copilotMessages: CopilotMessage[] = convo.messages
                            .filter((m) => m.role !== "system")
                            .map((m) => ({
                                id: m.id,
                                sender: m.role === "user" ? "user" : "ai",
                                text: m.content,
                                createdAt: m.createdAt,
                                attachments: m.attachments?.map((a) => ({
                                    fileAssetId: a.fileAssetId,
                                    filename: a.filename,
                                    size: a.size,
                                    mimeType: a.mimeType,
                                    isExisting: a.isExisting,
                                })),
                            }));
                        setState(prev => ({
                            ...prev,
                            messages: copilotMessages,
                        }));
                    }
                }
            } catch (err) {
                console.error("Failed to load conversations:", err);
            } finally {
                if (isActive) setIsLoadingConversations(false);
            }
        };

        initializeConversations();

        return () => {
            isActive = false;
        };
    // Only run once on mount, not when currentConversationId changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [projectId]);

    // Save panel state with debounce (messages are saved via conversation system)
    const scheduleSave = useCallback(
        (next: ProjectCopilotState) => {
            if (!projectId) return;
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
            saveTimerRef.current = setTimeout(() => {
                // Only save panel state to localStorage, not messages
                const panelOnlyState: ProjectCopilotState = {
                    ...next,
                    messages: [], // Don't persist messages to localStorage
                };
                saveProjectCopilotState(projectId, panelOnlyState);
            }, 400);
        },
        [projectId]
    );

    const updateState = useCallback(
        (updater: (prev: ProjectCopilotState) => ProjectCopilotState) => {
            setState((prev) => {
                const next = updater(prev);
                if (next === prev) return prev;
                scheduleSave(next);
                return next;
            });
        },
        [scheduleSave]
    );

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    const toggleCollapsed = useCallback(() => {
        updateState((prev) => ({
            ...prev,
            panel: { ...prev.panel, collapsed: !prev.panel.collapsed },
        }));
    }, [updateState]);

    const setCollapsed = useCallback(
        (collapsed: boolean) => {
            updateState((prev) => ({
                ...prev,
                panel: { ...prev.panel, collapsed },
            }));
        },
        [updateState]
    );

    const setPanelWidth = useCallback(
        (width: number) => {
            updateState((prev) => ({
                ...prev,
                panel: { ...prev.panel, width, collapsed: false },
            }));
        },
        [updateState]
    );

    const toggleConversationList = useCallback(() => {
        setShowConversationList((prev) => !prev);
    }, []);

    const selectConversation = useCallback(async (conversationId: string) => {
        try {
            const convo = await getConversation(conversationId);
            if (convo) {
                setCurrentConversationId(convo.id);
                // Convert conversation messages to CopilotMessages
                const copilotMessages: CopilotMessage[] = convo.messages
                    .filter((m) => m.role !== "system")
                    .map((m) => ({
                        id: m.id,
                        sender: m.role === "user" ? "user" : "ai",
                        text: m.content,
                        createdAt: m.createdAt,
                        context: { page: convo.page as CopilotPage },
                        attachments: m.attachments?.map((a) => ({
                            fileAssetId: a.fileAssetId,
                            filename: a.filename,
                            size: a.size,
                            mimeType: a.mimeType,
                            isExisting: a.isExisting,
                        })),
                    }));
                updateState((prev) => ({
                    ...prev,
                    messages: copilotMessages,
                }));
            }
        } catch (err) {
            console.error("Failed to select conversation:", err);
        }
    }, [updateState]);

    const newConversation = useCallback(async (page: CopilotPage) => {
        if (!projectId) {
            console.error("Cannot create conversation: no projectId");
            return;
        }
        try {
            const { id } = await createConversation({
                projectId,
                page,
                context: "project",
            });
            // Set the new conversation and clear messages
            setCurrentConversationId(id);
            setState((prev) => ({
                ...prev,
                messages: [],
            }));
            // Refresh conversation list
            await loadConversations();
        } catch (err) {
            console.error("Failed to create conversation:", err);
        }
    }, [projectId, loadConversations]);

    const renameConversation = useCallback(async (conversationId: string, title: string) => {
        try {
            await updateConversationTitle(conversationId, title);
            setConversations((prev) =>
                prev.map((c) =>
                    c.id === conversationId ? { ...c, title } : c
                )
            );
        } catch (err) {
            console.error("Failed to rename conversation:", err);
        }
    }, []);

    const deleteConversationHandler = useCallback(async (conversationId: string) => {
        try {
            await archiveConversation(conversationId);
            setConversations((prev) => prev.filter((c) => c.id !== conversationId));
            if (currentConversationId === conversationId) {
                setCurrentConversationId(null);
                updateState((prev) => ({
                    ...prev,
                    messages: [],
                }));
            }
        } catch (err) {
            console.error("Failed to delete conversation:", err);
        }
    }, [currentConversationId, updateState]);

    const attachFile = useCallback(async (file: File) => {
        if (!projectId) return;
        setIsAttaching(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const result = await uploadChatAttachmentAction(projectId, formData);
            setPendingAttachment({
                fileAssetId: result.fileAssetId,
                filename: result.filename,
                size: result.size,
                mimeType: result.mimeType,
                extractedText: result.extractedText,
                isExisting: false,
            });
        } catch (err) {
            console.error("Failed to upload attachment:", err);
        } finally {
            setIsAttaching(false);
        }
    }, [projectId]);

    const attachExistingFile = useCallback(async (fileAssetId: string) => {
        if (!projectId) return;
        setIsAttaching(true);
        try {
            const result = await extractTextFromExistingFileAction(projectId, fileAssetId);
            setPendingAttachment({
                fileAssetId: result.fileAssetId,
                filename: result.filename,
                size: result.size,
                mimeType: result.mimeType,
                extractedText: result.extractedText,
                isExisting: true,
            });
        } catch (err) {
            console.error("Failed to attach existing file:", err);
        } finally {
            setIsAttaching(false);
        }
    }, [projectId]);

    const clearAttachment = useCallback(() => {
        setPendingAttachment(null);
    }, []);

    const sendMessage = useCallback(
        async (text: string, page: CopilotPage, section?: string, model?: string) => {
            const trimmed = text.trim();
            const attachment = pendingAttachment;
            if ((!trimmed && !attachment) || isLoading) return;

            // Create conversation if needed
            let convId = currentConversationId;
            if (!convId) {
                try {
                    const { id } = await createConversation({
                        projectId,
                        page,
                        context: "project",
                    });
                    convId = id;
                    setCurrentConversationId(id);
                } catch (err) {
                    console.error("Failed to create conversation:", err);
                }
            }

            // Build attachment metadata and augmented message for AI
            let messageForAI = trimmed;
            let attachmentsMeta: CopilotMessageAttachment[] | undefined;

            if (attachment) {
                const sizeStr = attachment.size >= 1024 * 1024
                    ? `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`
                    : `${Math.round(attachment.size / 1024)} KB`;
                const userText = trimmed || "I've attached a PDF. Please review it and summarize the key points.";
                messageForAI = `<attached_document filename="${attachment.filename}" size="${sizeStr}">\n${attachment.extractedText}\n</attached_document>\n\n${userText}`;
                attachmentsMeta = [{
                    fileAssetId: attachment.fileAssetId,
                    filename: attachment.filename,
                    size: attachment.size,
                    mimeType: attachment.mimeType,
                    isExisting: attachment.isExisting,
                }];
                setPendingAttachment(null);
            }

            // Add user message (display text only, not the augmented AI text)
            const displayText = trimmed || (attachment ? "I've attached a PDF. Please review it and summarize the key points." : "");
            const userMessage: CopilotMessage = {
                id: `m-${Date.now()}`,
                sender: "user",
                text: displayText,
                createdAt: new Date().toISOString(),
                context: { page, section },
                attachments: attachmentsMeta,
            };

            updateState((prev) => ({
                ...prev,
                messages: [...prev.messages, userMessage],
            }));

            // Save user message to DB (with attachment metadata)
            if (convId) {
                addMessage({
                    conversationId: convId,
                    role: "user",
                    content: displayText,
                    attachments: attachmentsMeta,
                }).catch(console.error);
            }

            // Set loading state
            setIsLoading(true);

            // AI message ID - message will be created when first content arrives
            const aiMessageId = `m-${Date.now() + 1}`;
            let aiMessageCreated = false;

            let fullContent = "";

            try {
                // Build system prompt based on context
                const systemPrompt = buildSystemPrompt(page as CopilotContextType, section);

                // Cancel any in-flight stream
                if (abortControllerRef.current) {
                    abortControllerRef.current.abort();
                }
                const controller = new AbortController();
                abortControllerRef.current = controller;

                // Call the streaming API
                const response = await fetch("/api/ai/stream", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        userMessage: messageForAI,
                        context: "project",
                        options: {
                            projectId,
                            systemPrompt,
                            model,
                        },
                    }),
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(`AI request failed: ${response.statusText}`);
                }

                const reader = response.body?.getReader();
                if (!reader) {
                    throw new Error("No response body");
                }

                const decoder = new TextDecoder();

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value, { stream: true });
                    const lines = chunk.split("\n").filter(Boolean);

                    for (const line of lines) {
                        try {
                            const data = JSON.parse(line);
                            if (data.type === "content" && data.content) {
                                fullContent += data.content;

                                // Create AI message on first content arrival
                                if (!aiMessageCreated) {
                                    aiMessageCreated = true;
                                    const aiMessage: CopilotMessage = {
                                        id: aiMessageId,
                                        sender: "ai",
                                        text: fullContent,
                                        createdAt: new Date().toISOString(),
                                        context: { page, section },
                                    };
                                    updateState((prev) => ({
                                        ...prev,
                                        messages: [...prev.messages, aiMessage],
                                    }));
                                } else {
                                    // Update existing AI message with streaming content
                                    updateState((prev) => ({
                                        ...prev,
                                        messages: prev.messages.map((msg) =>
                                            msg.id === aiMessageId
                                                ? { ...msg, text: fullContent }
                                                : msg
                                        ),
                                    }));
                                }
                            } else if (data.type === "tool_call" && data.toolCall) {
                                // Show tool status while AI is calling tools
                                const toolName = data.toolCall.name;
                                const statusText = toolName === "search_pubmed"
                                    ? "Searching PubMed..."
                                    : toolName === "add_to_ledger"
                                    ? "Adding studies to ledger..."
                                    : `Running ${toolName}...`;
                                if (!aiMessageCreated) {
                                    aiMessageCreated = true;
                                    const aiMessage: CopilotMessage = {
                                        id: aiMessageId,
                                        sender: "ai",
                                        text: `*${statusText}*`,
                                        createdAt: new Date().toISOString(),
                                        context: { page, section },
                                    };
                                    updateState((prev) => ({
                                        ...prev,
                                        messages: [...prev.messages, aiMessage],
                                    }));
                                } else {
                                    updateState((prev) => ({
                                        ...prev,
                                        messages: prev.messages.map((msg) =>
                                            msg.id === aiMessageId
                                                ? { ...msg, text: fullContent || `*${statusText}*` }
                                                : msg
                                        ),
                                    }));
                                }
                            } else if (data.type === "tool_result") {
                                // Tool result received, content stream will resume
                                if (aiMessageCreated && !fullContent) {
                                    updateState((prev) => ({
                                        ...prev,
                                        messages: prev.messages.map((msg) =>
                                            msg.id === aiMessageId
                                                ? { ...msg, text: "*Processing results...*" }
                                                : msg
                                        ),
                                    }));
                                }
                            } else if (data.type === "error") {
                                throw new Error(data.error);
                            }
                        } catch {
                            // Skip parsing errors for incomplete chunks
                        }
                    }
                }

                // Save AI response to DB
                if (convId && fullContent) {
                    addMessage({
                        conversationId: convId,
                        role: "assistant",
                        content: fullContent,
                    }).catch(console.error);
                }

                // Refresh conversation list to update titles/counts
                loadConversations();
            } catch (error) {
                // Silently ignore aborted requests (user navigated away or sent a new message)
                if (error instanceof DOMException && error.name === "AbortError") return;

                console.error("AI chat error:", error);
                const errorText = `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`;

                // Create error message if no AI message was created yet
                if (!aiMessageCreated) {
                    const aiMessage: CopilotMessage = {
                        id: aiMessageId,
                        sender: "ai",
                        text: errorText,
                        createdAt: new Date().toISOString(),
                        context: { page, section },
                    };
                    updateState((prev) => ({
                        ...prev,
                        messages: [...prev.messages, aiMessage],
                    }));
                } else {
                    // Update existing message with error
                    updateState((prev) => ({
                        ...prev,
                        messages: prev.messages.map((msg) =>
                            msg.id === aiMessageId
                                ? { ...msg, text: fullContent + "\n\n" + errorText }
                                : msg
                        ),
                    }));
                }
            } finally {
                setIsLoading(false);
            }
        },
        [updateState, projectId, isLoading, currentConversationId, loadConversations, pendingAttachment]
    );

    const clearMessages = useCallback(() => {
        updateState((prev) => ({
            ...prev,
            messages: [],
        }));
        setCurrentConversationId(null);
    }, [updateState]);

    const value = useMemo(
        () => ({
            state,
            messages: state.messages,
            isCollapsed: state.panel.collapsed,
            panelWidth: state.panel.width,
            isLoading,
            toggleCollapsed,
            setCollapsed,
            setPanelWidth,
            sendMessage,
            clearMessages,
            // Conversation management
            conversations,
            currentConversationId,
            isLoadingConversations,
            showConversationList,
            toggleConversationList,
            selectConversation,
            newConversation,
            renameConversation,
            deleteConversation: deleteConversationHandler,
            refreshConversations: loadConversations,
            // Attachment support
            pendingAttachment,
            isAttaching,
            attachFile,
            attachExistingFile,
            clearAttachment,
            projectId,
        }),
        [
            state,
            isLoading,
            toggleCollapsed,
            setCollapsed,
            setPanelWidth,
            sendMessage,
            clearMessages,
            conversations,
            currentConversationId,
            isLoadingConversations,
            showConversationList,
            toggleConversationList,
            selectConversation,
            newConversation,
            renameConversation,
            deleteConversationHandler,
            loadConversations,
            pendingAttachment,
            isAttaching,
            attachFile,
            attachExistingFile,
            clearAttachment,
        ]
    );


    if (!isMounted) {
        // Return a consistent skeleton or null to avoid hydration mismatch
        return null;
    }

    return (
        <ProjectCopilotContext.Provider value={value}>
            {children}
        </ProjectCopilotContext.Provider>
    );
}

export function useProjectCopilot() {
    const ctx = useContext(ProjectCopilotContext);
    if (!ctx) {
        throw new Error("useProjectCopilot must be used within ProjectCopilotProvider");
    }
    return ctx;
}
