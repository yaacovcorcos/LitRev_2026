"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useStableChatScroll } from "@/hooks/useStableChatScroll";
import * as Dialog from "@radix-ui/react-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePopupChat } from "@/contexts/PopupChatContext";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import { createNoteAction } from "@/app/actions/notes";
import { createConversation, addMessage } from "@/app/actions/conversations";
import { parseNDJSONStream } from "@/lib/ai/stream-parser";
import { formatStreamErrorForUI } from "@/lib/ai/stream-error-ui";
import { markdownComponents } from "@/components/markdown/CodeBlock";
import type { PopupChatContext, PopupMessage } from "@/types/popup-chat";
import type { CopilotPage } from "@/types/ai";
import { COARSE_POINTER_MEDIA_QUERY } from "@/lib/mobile/breakpoints";
import { isMobilePopupV2Enabled } from "@/lib/mobile/feature-flags";
import { isMobileTelemetryContext, recordMobileMetric } from "@/lib/mobile/telemetry";
import styles from "./PopupChat.module.css";

const TURN_HINT_THRESHOLD = 3;

/** Human-readable label for the popup header badge. */
function getContextLabel(ctx: PopupChatContext): string {
    switch (ctx.type) {
        case "study":
            return ctx.title.length > 40 ? ctx.title.slice(0, 40) + "..." : ctx.title;
        case "criterion":
            return `${ctx.criterionType === "inclusion" ? "Inclusion" : "Exclusion"} criterion`;
        case "draft_selection":
            return `Draft: ${ctx.section}`;
        case "protocol_section":
            return `Protocol: ${ctx.section}`;
    }
}

/** Map popup context type to a CopilotPage for conversation creation. */
function contextToPage(ctx: PopupChatContext): CopilotPage {
    switch (ctx.type) {
        case "study": return "study";
        case "criterion": return "protocol";
        case "draft_selection": return "draft";
        case "protocol_section": return "protocol";
    }
}

/** Dynamic placeholder based on context type. */
function getPlaceholder(ctx: PopupChatContext): string {
    switch (ctx.type) {
        case "study":
            return `Ask a question about this study...`;
        case "criterion":
            return `Ask a question about this ${ctx.criterionType} criterion...`;
        case "draft_selection":
            return `Ask a question about ${ctx.section}...`;
        case "protocol_section":
            return `Ask a question about ${ctx.section}...`;
    }
}

/** Icon for context type. */
function contextIcon(ctx: PopupChatContext): string {
    switch (ctx.type) {
        case "study": return "article";
        case "criterion": return "checklist";
        case "draft_selection": return "edit_note";
        case "protocol_section": return "description";
    }
}

type PopupChatProps = {
    projectId: string;
};

export function PopupChat({ projectId }: PopupChatProps) {
    const mobilePopupV2Enabled = isMobilePopupV2Enabled();
    const { isOpen, context, closePopupChat } = usePopupChat();
    const { selectConversation, setCollapsed, refreshConversations } = useProjectCopilot();

    const [messages, setMessages] = useState<PopupMessage[]>([]);
    const [input, setInput] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [showTurnHint, setShowTurnHint] = useState(false);
    const [turnHintDismissed, setTurnHintDismissed] = useState(false);
    const [isDragEnabled, setIsDragEnabled] = useState(true);

    const abortRef = useRef<AbortController | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    // Drag state (refs to avoid re-renders during drag)
    const isDragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const posRef = useRef<{ x: number; y: number } | null>(null);

    // Count user messages
    const userTurnCount = messages.filter((m) => m.role === "user").length;

    // Reset state when context changes or popup closes
    useEffect(() => {
        setMessages([]);
        setInput("");
        setIsStreaming(false);
        setShowTurnHint(false);
        setTurnHintDismissed(false);
        abortRef.current?.abort();
        abortRef.current = null;
        // Reset position to default bottom-right
        posRef.current = null;
        if (cardRef.current) {
            cardRef.current.style.left = "";
            cardRef.current.style.bottom = "";
            cardRef.current.style.right = "100px";
            cardRef.current.style.top = "80px";
        }
    }, [context]);

    // Show turn hint after threshold
    useEffect(() => {
        if (userTurnCount >= TURN_HINT_THRESHOLD && !turnHintDismissed) {
            setShowTurnHint(true);
        }
    }, [userTurnCount, turnHintDismissed]);

    // Shared scroll hook for auto-scroll
    const {
        containerRef: messagesContainerRef,
        bottomRef: messagesBottomRef,
        onScroll: onMessagesScroll,
        notifyContentChanged,
    } = useStableChatScroll();

    useLayoutEffect(() => { notifyContentChanged(); }, [messages, notifyContentChanged]);

    // Focus textarea when popup opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => textareaRef.current?.focus(), 100);
        }
    }, [isOpen]);

    useEffect(() => {
        if (typeof window === "undefined") return;
        const pointerQuery = window.matchMedia(COARSE_POINTER_MEDIA_QUERY);
        const updateDragMode = () => {
            setIsDragEnabled(!pointerQuery.matches);
        };

        updateDragMode();

        if (typeof pointerQuery.addEventListener === "function") {
            pointerQuery.addEventListener("change", updateDragMode);
        } else if (typeof pointerQuery.addListener === "function") {
            pointerQuery.addListener(updateDragMode);
        }

        return () => {
            if (typeof pointerQuery.removeEventListener === "function") {
                pointerQuery.removeEventListener("change", updateDragMode);
            } else if (typeof pointerQuery.removeListener === "function") {
                pointerQuery.removeListener(updateDragMode);
            }
        };
    }, []);

    const handleSend = useCallback(async () => {
        const trimmed = input.trim();
        if (!trimmed || isStreaming || !context) return;
        const startedAt = Date.now();
        let sendSucceeded = false;

        if (isMobileTelemetryContext()) {
            recordMobileMetric({
                type: "mobile_action_tap",
                surface: "popup",
                payload: {
                    route: typeof window !== "undefined" ? window.location.pathname : "/project",
                    actionId: "popup_send",
                    targetMinPx: 32,
                    inputMode: "touch",
                },
            });
        }

        const userMsg: PopupMessage = {
            id: `pm-${Date.now()}`,
            role: "user",
            content: trimmed,
            createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setIsStreaming(true);

        // Build popup transcript payload for the server popup runtime (server owns system prompt).
        const apiMessages = [
            ...messages.map((m) => ({
                id: m.id,
                role: m.role as "user" | "assistant",
                content: m.content,
                createdAt: m.createdAt,
            })),
            { id: userMsg.id, role: "user" as const, content: trimmed, createdAt: userMsg.createdAt },
        ];

        const aiMsgId = `pm-${Date.now() + 1}`;
        let fullContent = "";

        const controller = new AbortController();
        abortRef.current = controller;

        try {
            const response = await fetch("/api/ai/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: apiMessages,
                    popupContext: context,
                    options: {
                        popupMode: true,
                        projectId: context.projectId,
                        page: contextToPage(context),
                        section: context.type === "protocol_section" || context.type === "draft_selection"
                            ? context.section
                            : undefined,
                        agentMode: "general",
                    },
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`Request failed: ${response.statusText}`);
            }

            const reader = response.body?.getReader();
            if (!reader) throw new Error("No response body");

            let aiCreated = false;

            for await (const event of parseNDJSONStream(reader, controller.signal)) {
                if (event.type === "content" && event.content) {
                    fullContent += event.content;

                    if (!aiCreated) {
                        aiCreated = true;
                        setMessages((prev) => [
                            ...prev,
                            { id: aiMsgId, role: "assistant", content: fullContent, createdAt: new Date().toISOString() },
                        ]);
                    } else {
                        const captured = fullContent;
                        setMessages((prev) =>
                            prev.map((m) => (m.id === aiMsgId ? { ...m, content: captured } : m)),
                        );
                    }
                } else if (event.type === "error") {
                    throw new Error(event.error);
                }
            }
            sendSucceeded = true;
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;

            const errorText = `Sorry, I encountered an error: ${formatStreamErrorForUI(error)}`;
            setMessages((prev) => [
                ...prev,
                { id: aiMsgId, role: "assistant", content: fullContent ? fullContent + "\n\n" + errorText : errorText, createdAt: new Date().toISOString() },
            ]);
        } finally {
            setIsStreaming(false);
            if (abortRef.current === controller) {
                abortRef.current = null;
            }
            if (isMobileTelemetryContext()) {
                recordMobileMetric({
                    type: "mobile_flow_completed",
                    surface: "popup",
                    payload: {
                        route: typeof window !== "undefined" ? window.location.pathname : "/project",
                        flowId: "ai_message_send",
                        durationMs: Date.now() - startedAt,
                        success: sendSucceeded,
                    },
                });
            }
        }
    }, [input, isStreaming, context, messages]);

    const handleStop = useCallback(() => {
        abortRef.current?.abort();
        abortRef.current = null;
        setIsStreaming(false);
    }, []);

    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        },
        [handleSend],
    );

    // ---- Drag handling ----
    const handleDragStart = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDragEnabled) return;
        // Only drag from the header area, not from buttons inside it
        if ((e.target as HTMLElement).closest("button")) return;

        const card = cardRef.current;
        if (!card) return;

        isDragging.current = true;
        const rect = card.getBoundingClientRect();

        // If first drag, convert from bottom/right to top/left positioning
        if (!posRef.current) {
            posRef.current = { x: rect.left, y: rect.top };
            card.style.right = "auto";
            card.style.bottom = "auto";
            card.style.left = `${rect.left}px`;
            card.style.top = `${rect.top}px`;
        }

        dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        card.setPointerCapture(e.pointerId);
        card.style.transition = "none";
    }, [isDragEnabled]);

    const handleDragMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
        if (!isDragEnabled) return;
        if (!isDragging.current || !cardRef.current) return;

        const card = cardRef.current;
        const maxX = window.innerWidth - card.offsetWidth;
        const maxY = window.innerHeight - card.offsetHeight;

        const x = Math.max(0, Math.min(e.clientX - dragOffset.current.x, maxX));
        const y = Math.max(0, Math.min(e.clientY - dragOffset.current.y, maxY));

        posRef.current = { x, y };
        card.style.left = `${x}px`;
        card.style.top = `${y}px`;
    }, [isDragEnabled]);

    const handleDragEnd = useCallback(() => {
        if (!isDragEnabled) return;
        isDragging.current = false;
        if (cardRef.current) {
            cardRef.current.style.transition = "";
        }
    }, [isDragEnabled]);

    const handleContinueInCopilot = useCallback(async () => {
        if (!context || messages.length === 0) return;
        const startedAt = Date.now();

        if (isMobileTelemetryContext()) {
            recordMobileMetric({
                type: "mobile_action_tap",
                surface: "popup",
                payload: {
                    route: typeof window !== "undefined" ? window.location.pathname : "/project",
                    actionId: "popup_continue_to_copilot",
                    targetMinPx: 24,
                    inputMode: "touch",
                },
            });
        }

        try {
            const page = contextToPage(context);
            const studyId = context.type === "study" ? context.studyId : undefined;

            const convResult = await createConversation({
                projectId,
                studyId,
                page,
                context: studyId ? "study" : "project",
            });
            if (!convResult.success) {
                if (isMobileTelemetryContext()) {
                    recordMobileMetric({
                        type: "mobile_flow_completed",
                        surface: "popup",
                        payload: {
                            route: typeof window !== "undefined" ? window.location.pathname : "/project",
                            flowId: "popup_continue_to_copilot",
                            durationMs: Date.now() - startedAt,
                            success: false,
                        },
                    });
                }
                return;
            }
            const convId = convResult.data.id;

            // Insert messages sequentially
            for (const msg of messages) {
                await addMessage({
                    conversationId: convId,
                    role: msg.role,
                    content: msg.content,
                });
            }

            await selectConversation(convId);
            setCollapsed(false);
            await refreshConversations();
            closePopupChat();
            if (isMobileTelemetryContext()) {
                recordMobileMetric({
                    type: "mobile_flow_completed",
                    surface: "popup",
                    payload: {
                        route: typeof window !== "undefined" ? window.location.pathname : "/project",
                        flowId: "popup_continue_to_copilot",
                        durationMs: Date.now() - startedAt,
                        success: true,
                    },
                });
            }
        } catch (err) {
            console.error("Failed to continue in copilot:", err);
            if (isMobileTelemetryContext()) {
                recordMobileMetric({
                    type: "mobile_flow_completed",
                    surface: "popup",
                    payload: {
                        route: typeof window !== "undefined" ? window.location.pathname : "/project",
                        flowId: "popup_continue_to_copilot",
                        durationMs: Date.now() - startedAt,
                        success: false,
                    },
                });
            }
        }
    }, [context, messages, projectId, selectConversation, setCollapsed, refreshConversations, closePopupChat]);

    const handleSaveToNotes = useCallback(async () => {
        if (messages.length === 0) return;

        const markdown = messages
            .map((m) => (m.role === "user" ? `**You:** ${m.content}` : `**AI:** ${m.content}`))
            .join("\n\n---\n\n");

        await createNoteAction(projectId, markdown, "conversation");
    }, [messages, projectId]);

    if (!context) return null;

    const label = getContextLabel(context);
    const icon = contextIcon(context);
    const canSend = input.trim().length > 0 && !isStreaming;
    const popupClassName = `${styles.popupChat} ${mobilePopupV2Enabled ? styles.popupChatMobileV2 : ""}`;

    return (
        <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) closePopupChat(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className={styles.overlay} />
                <Dialog.Content
                    ref={cardRef}
                    className={popupClassName}
                    data-mobile-popup-v2={mobilePopupV2Enabled ? "1" : "0"}
                    aria-label="Ask AI mini-chat"
                    onEscapeKeyDown={() => closePopupChat()}
                    onInteractOutside={(e) => {
                        // Don't close if clicking inside the popup itself
                        e.preventDefault();
                    }}
                    onPointerMove={isDragEnabled ? handleDragMove : undefined}
                    onPointerUp={isDragEnabled ? handleDragEnd : undefined}
                >
                    <Dialog.Title className="sr-only">Ask AI mini-chat</Dialog.Title>
                    {/* Header — drag handle */}
                    <div
                        className={`${styles.header} ${!isDragEnabled ? styles.headerDragDisabled : ""}`}
                        onPointerDown={isDragEnabled ? handleDragStart : undefined}
                    >
                        <div className={styles.contextBadge}>
                            <div className={styles.contextIcon}>
                                <span className="material-icons-round">{icon}</span>
                            </div>
                            <span className={styles.contextLabel}>{label}</span>
                        </div>
                        <Dialog.Close asChild>
                            <button type="button" className={styles.closeBtn} aria-label="Close">
                                <span className="material-icons-round" style={{ fontSize: 18 }}>close</span>
                            </button>
                        </Dialog.Close>
                    </div>

                    {/* Messages */}
                    <div className={styles.messages} ref={messagesContainerRef} onScroll={onMessagesScroll}>
                        {messages.length === 0 ? (
                            <div className={styles.emptyMessages}>{getPlaceholder(context)}</div>
                        ) : (
                            messages.map((msg, i) => (
                                <div
                                    key={msg.id}
                                    className={`${styles.msgRow} ${msg.role === "user" ? styles.msgRowUser : styles.msgRowAi}`}
                                >
                                    <div className={styles.msgBubble}>
                                        {msg.role === "assistant" ? (
                                            <div className={styles.msgText}>
                                                <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                                    {msg.content}
                                                </ReactMarkdown>
                                                {isStreaming && i === messages.length - 1 && (
                                                    <span className={styles.streamingCursor} aria-hidden="true">◎</span>
                                                )}
                                            </div>
                                        ) : (
                                            <div className={styles.msgText}>{msg.content}</div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                        <div ref={messagesBottomRef} style={{ height: 1 }} aria-hidden="true" />
                    </div>

                    {/* Turn hint banner */}
                    {showTurnHint && !turnHintDismissed && (
                        <div className={styles.turnHint}>
                            <span>Quick chat works best for brief questions.</span>
                            <button
                                type="button"
                                className={styles.turnHintLink}
                                onClick={handleContinueInCopilot}
                            >
                                Continue in Copilot
                            </button>
                            <button
                                type="button"
                                className={styles.turnHintDismiss}
                                onClick={() => setTurnHintDismissed(true)}
                                aria-label="Dismiss hint"
                            >
                                <span className="material-icons-round" style={{ fontSize: 14 }}>close</span>
                            </button>
                        </div>
                    )}

                    {/* Input */}
                    <div className={styles.inputArea}>
                        <div className={styles.inputRow}>
                            <textarea
                                ref={textareaRef}
                                className={styles.inputField}
                                placeholder={getPlaceholder(context)}
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                onKeyDown={handleKeyDown}
                                rows={1}
                                disabled={isStreaming}
                            />
                            {isStreaming ? (
                                <button
                                    type="button"
                                    className={`${styles.sendBtn} ${styles.sendBtnStop}`}
                                    onClick={handleStop}
                                    aria-label="Stop"
                                >
                                    <span className="material-icons-round">stop</span>
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    className={`${styles.sendBtn} ${canSend ? styles.sendBtnActive : ""}`}
                                    onClick={handleSend}
                                    disabled={!canSend}
                                    aria-label="Send"
                                >
                                    <span className="material-icons-round">arrow_upward</span>
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Footer */}
                    {messages.length > 0 && (
                        <div className={styles.footer}>
                            <button type="button" className={styles.footerLink} onClick={handleSaveToNotes}>
                                Save to Notes
                            </button>
                            <button type="button" className={styles.footerLink} onClick={handleContinueInCopilot}>
                                Continue in Copilot
                            </button>
                        </div>
                    )}
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
