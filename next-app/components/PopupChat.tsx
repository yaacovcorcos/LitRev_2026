"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useStableChatScroll } from "@/hooks/useStableChatScroll";
import * as Dialog from "@radix-ui/react-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePopupChat } from "@/contexts/PopupChatContext";
import { useProjectConversation } from "@/contexts/ProjectConversationContext";
import { createNoteAction } from "@/app/actions/notes";
import { createConversation, addMessage } from "@/app/actions/conversations";
import { processAIStream } from "@/lib/ai/stream-processor";
import { buildUnexpectedTerminalErrorState, buildClientErrorState } from "@/lib/ai/stream-error-ui";
import {
    isFailureTerminalReason,
    isSuccessfulTerminalReason,
    terminalReasonFromThrownError,
    type StreamTerminalReason,
} from "@/lib/ai/stream-lifecycle";
import { AIErrorWithEnvelope } from "@/lib/ai/error-envelope";
import {
    appendPopupTerminalError,
    appendPopupUserMessage,
    createInitialPopupStreamRuntimeState,
    getPopupTranscriptEntries,
    reducePopupStreamChunk,
    type PopupTimelineItem,
    type PopupStreamRuntimeState,
} from "@/lib/ai/popup-stream-runtime";
import { normalizeAssistantContent } from "@/lib/ai/normalize-assistant-content";
import { recordReliabilityMetric } from "@/lib/ai/reliability-telemetry";
import { MarkdownComponents } from "@/components/markdown/MarkdownComponents";
import type { PopupChatContext } from "@/types/popup-chat";
import type { CopilotPage } from "@/types/ai";
import { COARSE_POINTER_MEDIA_QUERY } from "@/lib/mobile/breakpoints";
import { isMobilePopupV2Enabled } from "@/lib/mobile/feature-flags";
import { isMobileTelemetryContext, recordMobileMetric } from "@/lib/mobile/telemetry";
import styles from "./PopupChat.module.css";

const TURN_HINT_THRESHOLD = 3;
const makeId = (prefix: string) =>
    (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
        ? `${prefix}-${crypto.randomUUID()}`
        : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

function getContextPreview(ctx: PopupChatContext): string | null {
    switch (ctx.type) {
        case "study":
            return ctx.authors ?? ctx.abstract ?? null;
        case "criterion":
            return ctx.text;
        case "draft_selection":
            return ctx.selectedText;
        case "protocol_section":
            return ctx.currentContent;
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

function getPopupRuntimeKey(ctx: PopupChatContext): string {
    switch (ctx.type) {
        case "study":
            return `study:${ctx.projectId}:${ctx.studyId}`;
        case "criterion":
            return `criterion:${ctx.projectId}:${ctx.criterionType}:${ctx.text}`;
        case "draft_selection":
            return `draft_selection:${ctx.projectId}:${ctx.section}:${ctx.selectedText}`;
        case "protocol_section":
            return `protocol_section:${ctx.projectId}:${ctx.section}:${ctx.currentContent}`;
    }
}

function isAssistantItem(item: PopupTimelineItem | undefined): item is Extract<PopupTimelineItem, { type: "assistant_message" }> {
    return item?.type === "assistant_message";
}

function isErrorItem(item: PopupTimelineItem | undefined): item is Extract<PopupTimelineItem, { type: "error" }> {
    return item?.type === "error";
}

type PopupChatProps = {
    projectId: string;
};

export function PopupChat({ projectId }: PopupChatProps) {
    const mobilePopupV2Enabled = isMobilePopupV2Enabled();
    const { isOpen, context, closePopupChat } = usePopupChat();
    const { selectConversation, setCollapsed, refreshConversations } = useProjectConversation();

    if (!context) return null;

    return (
        <PopupChatRuntime
            key={getPopupRuntimeKey(context)}
            projectId={projectId}
            isOpen={isOpen}
            context={context}
            closePopupChat={closePopupChat}
            selectConversation={selectConversation}
            setCollapsed={setCollapsed}
            refreshConversations={refreshConversations}
            mobilePopupV2Enabled={mobilePopupV2Enabled}
        />
    );
}

type PopupChatRuntimeProps = PopupChatProps & {
    isOpen: boolean;
    context: PopupChatContext;
    closePopupChat: () => void;
    selectConversation: (conversationId: string) => Promise<boolean>;
    setCollapsed: (collapsed: boolean) => void;
    refreshConversations: () => Promise<void>;
    mobilePopupV2Enabled: boolean;
};

function PopupChatRuntime({
    projectId,
    isOpen,
    context,
    closePopupChat,
    selectConversation,
    setCollapsed,
    refreshConversations,
    mobilePopupV2Enabled,
}: PopupChatRuntimeProps) {
    const isDragEnabled = !useMediaQuery(COARSE_POINTER_MEDIA_QUERY);

    const [streamState, setStreamState] = useState<PopupStreamRuntimeState>(() => createInitialPopupStreamRuntimeState());
    const [input, setInput] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [showTurnHint, setShowTurnHint] = useState(false);
    const [turnHintDismissed, setTurnHintDismissed] = useState(false);
    const streamStateRef = useRef<PopupStreamRuntimeState>(createInitialPopupStreamRuntimeState());

    const abortRef = useRef<AbortController | null>(null);
    const userStopRequestedRef = useRef(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const cardRef = useRef<HTMLDivElement>(null);

    // Drag state (refs to avoid re-renders during drag)
    const isDragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const posRef = useRef<{ x: number; y: number } | null>(null);

    // Count user messages
    const userTurnCount = streamState.items.filter((item) => item.type === "user_message").length;

    const updateStreamState = useCallback((updater: (prev: PopupStreamRuntimeState) => PopupStreamRuntimeState) => {
        setStreamState((prev) => {
            const next = updater(prev);
            streamStateRef.current = next;
            return next;
        });
    }, []);

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

    useLayoutEffect(() => { notifyContentChanged(); }, [streamState.items, notifyContentChanged]);

    // Focus textarea when popup opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => textareaRef.current?.focus(), 100);
        }
    }, [isOpen]);

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

        const userMsgId = makeId("pm");
        const userMsgCreatedAt = new Date().toISOString();
        updateStreamState((prev) => appendPopupUserMessage(prev, {
            id: userMsgId,
            content: trimmed,
            createdAt: userMsgCreatedAt,
        }));
        setInput("");
        setIsStreaming(true);

        // Build popup transcript payload for the server popup runtime (server owns system prompt).
        const transcriptEntries = getPopupTranscriptEntries(streamStateRef.current.items);
        const apiMessages = [
            ...transcriptEntries.map((entry, index) => ({
                id: `popup-history-${index}`,
                role: entry.role,
                content: entry.content,
                createdAt: new Date().toISOString(),
            })),
            { id: userMsgId, role: "user" as const, content: trimmed, createdAt: userMsgCreatedAt },
        ];

        const aiMsgId = makeId("pm");
        let terminalReason: StreamTerminalReason | null = null;
        userStopRequestedRef.current = false;
        const requestKey = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `popup-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        let terminalEventEmitted = false;

        recordReliabilityMetric({
            type: "reliability.v1.stream.started",
            surface: "popup",
            projectId: context.projectId,
            payload: {
                requestKey,
                phase: "popup_stream",
            },
        });

        const emitTerminalMetric = (reason: StreamTerminalReason) => {
            if (terminalEventEmitted) return;
            terminalEventEmitted = true;
            const runStatus = reason === "completed"
                ? "completed"
                : reason === "paused_for_input"
                    ? "paused"
                    : reason === "cancelled_by_user"
                        ? "cancelled"
                        : "failed";
            recordReliabilityMetric({
                type: "reliability.v1.stream.terminal",
                surface: "popup",
                projectId: context.projectId,
                payload: {
                    requestKey,
                    phase: "popup_stream",
                    reason,
                    runStatus,
                },
            });
        };

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

            const summary = await processAIStream({
                reader,
                signal: controller.signal,
                throwOnErrorChunk: true,
                onChunk: (event) => {
                    updateStreamState((prev) => reducePopupStreamChunk(prev, event, {
                        aiMessageId: aiMsgId,
                        page: contextToPage(context),
                        section: context.type === "protocol_section" || context.type === "draft_selection"
                            ? context.section
                            : undefined,
                        now: () => new Date().toISOString(),
                    }));
                },
            });
            terminalReason = summary.terminalReason;
            if (userStopRequestedRef.current && (terminalReason === "failed_network" || terminalReason === "failed_interrupted")) {
                terminalReason = "cancelled_by_user";
            }
            sendSucceeded = isSuccessfulTerminalReason(terminalReason);
            if (terminalReason) emitTerminalMetric(terminalReason);
            if (terminalReason && isFailureTerminalReason(terminalReason)) {
                const errorState = buildUnexpectedTerminalErrorState(terminalReason);
                updateStreamState((prev) => appendPopupTerminalError(prev, {
                    message: errorState.message,
                    retryable: errorState.retryable,
                    errorMeta: {
                        ...errorState.errorMeta,
                    },
                    createdAt: new Date().toISOString(),
                }));
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") {
                terminalReason = terminalReasonFromThrownError(error, { isUserAbort: true });
                emitTerminalMetric(terminalReason);
                return;
            }
            terminalReason = terminalReasonFromThrownError(error);
            emitTerminalMetric(terminalReason);

            if (error instanceof AIErrorWithEnvelope) {
                return;
            }

            const errorState = buildClientErrorState(error);
            updateStreamState((prev) => appendPopupTerminalError(prev, {
                message: errorState.message,
                retryable: errorState.retryable,
                errorMeta: errorState.errorMeta,
                createdAt: new Date().toISOString(),
            }));
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
    }, [context, input, isStreaming, updateStreamState]);

    const handleStop = useCallback(() => {
        userStopRequestedRef.current = true;
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
        if (!context || streamState.items.length === 0) return;
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
            for (const msg of getPopupTranscriptEntries(streamStateRef.current.items)) {
                if (!msg.content.trim()) continue;
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
    }, [context, projectId, refreshConversations, selectConversation, setCollapsed, streamState.items.length, closePopupChat]);

    const handleSaveToNotes = useCallback(async () => {
        if (streamState.items.length === 0) return;

        const markdown = getPopupTranscriptEntries(streamStateRef.current.items)
            .filter((entry) => entry.content.trim().length > 0)
            .map((entry) => (entry.role === "user" ? `**You:** ${entry.content}` : `**AI:** ${entry.content}`))
            .join("\n\n---\n\n");

        await createNoteAction(projectId, markdown, "conversation");
    }, [projectId, streamState.items.length]);

    const label = getContextLabel(context);
    const preview = getContextPreview(context);
    const icon = contextIcon(context);
    const canSend = input.trim().length > 0 && !isStreaming;
    const popupClassName = `${styles.popupChat} ${mobilePopupV2Enabled ? styles.popupChatMobileV2 : ""}`;
    const renderedItems = streamState.items;

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
                            <div className={styles.contextMeta}>
                                <span className={styles.contextLabel}>{label}</span>
                                {preview ? <span className={styles.contextPreview}>{preview}</span> : null}
                            </div>
                        </div>
                        <Dialog.Close asChild>
                            <button type="button" className={styles.closeBtn} aria-label="Close">
                                <span className="material-icons-round" style={{ fontSize: 18 }}>close</span>
                            </button>
                        </Dialog.Close>
                    </div>

                    {/* Messages */}
                    <div className={styles.messages} ref={messagesContainerRef} onScroll={onMessagesScroll}>
                        {renderedItems.length === 0 ? (
                            <div className={styles.emptyMessages}>{getPlaceholder(context)}</div>
                        ) : (
                            renderedItems.map((item, index) => {
                                if (item.type === "error" && isAssistantItem(renderedItems[index - 1])) {
                                    return null;
                                }

                                if (item.type === "progress") {
                                    return (
                                        <div key={item.id} className={styles.metaRow}>
                                            <div className={styles.metaCard}>
                                                <span className="material-icons-round">sync</span>
                                                <span>{item.message}</span>
                                            </div>
                                        </div>
                                    );
                                }

                                if (item.type === "checkpoint") {
                                    return (
                                        <div key={item.id} className={styles.metaRow}>
                                            <div className={styles.checkpointCard}>{item.label}</div>
                                        </div>
                                    );
                                }

                                if (item.type === "user_input_request") {
                                    return (
                                        <div key={item.id} className={styles.metaRow}>
                                            <div className={styles.blockerCard}>
                                                {item.header ? <div className={styles.blockerHeader}>{item.header}</div> : null}
                                                <div className={styles.blockerQuestion}>{item.question}</div>
                                                {item.context ? <div className={styles.blockerContext}>{item.context}</div> : null}
                                                <button
                                                    type="button"
                                                    className={styles.blockerAction}
                                                    onClick={handleContinueInCopilot}
                                                >
                                                    Continue in Copilot to answer
                                                </button>
                                            </div>
                                        </div>
                                    );
                                }

                                if (item.type === "error") {
                                    return (
                                        <div key={item.id} className={styles.msgRow}>
                                            <div className={`${styles.msgBubble} ${styles.msgBubbleError}`} data-popup-error="1">
                                                <div className={styles.msgErrorText}>{item.message}</div>
                                                <div className={styles.msgStatus}>
                                                    {item.retryable ? "Retry recommended" : "Request not completed"}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }

                                if (item.type === "assistant_message") {
                                    const nextItem = renderedItems[index + 1];
                                    const adjacentError = isErrorItem(nextItem) ? nextItem : null;
                                    const displayContent = normalizeAssistantContent(item.content).displayContent;
                                    return (
                                        <div
                                            key={item.id}
                                            className={`${styles.msgRow} ${styles.msgRowAi}`}
                                        >
                                            <div
                                                className={`${styles.msgBubble} ${adjacentError ? styles.msgBubbleError : ""}`}
                                                data-popup-error={adjacentError ? "1" : undefined}
                                            >
                                                <div className={styles.msgText}>
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MarkdownComponents}>
                                                        {displayContent}
                                                    </ReactMarkdown>
                                                    {isStreaming && index === renderedItems.length - 1 && (
                                                        <span className={styles.streamingCursor} aria-hidden="true">◎</span>
                                                    )}
                                                </div>
                                                {adjacentError ? (
                                                    <>
                                                        <div className={styles.msgErrorText}>{adjacentError.message}</div>
                                                        <div className={styles.msgStatus}>
                                                            {adjacentError.retryable ? "Retry recommended" : "Request not completed"}
                                                        </div>
                                                    </>
                                                ) : null}
                                            </div>
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        key={item.id}
                                        className={`${styles.msgRow} ${styles.msgRowUser}`}
                                    >
                                        <div className={styles.msgBubble}>
                                            <div className={styles.msgText}>{item.content}</div>
                                        </div>
                                    </div>
                                );
                            })
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
                    {renderedItems.length > 0 && (
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
