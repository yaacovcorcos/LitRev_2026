"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { usePopupChat } from "@/contexts/PopupChatContext";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import { createNoteAction } from "@/app/actions/notes";
import { createConversation, addMessage } from "@/app/actions/conversations";
import { AGENT_MODE_PROMPTS, buildStudyContext, sanitizeContext } from "@/lib/ai/prompts/copilot-prompts";
import { parseNDJSONStream } from "@/lib/ai/stream-parser";
import type { PopupChatContext, PopupMessage } from "@/types/popup-chat";
import type { CopilotPage } from "@/contexts/ProjectCopilotContext";
import styles from "./PopupChat.module.css";

const TURN_HINT_THRESHOLD = 3;

/** Build a compact system prompt for the mini-chat. */
function buildPopupSystemPrompt(ctx: PopupChatContext): string {
    const base = AGENT_MODE_PROMPTS.general;
    const conciseness =
        "\n\nThis is a quick-answer mini-chat. Be concise — aim for 2-4 sentences for simple questions, short structured lists for complex ones. The user can continue in the full copilot for deeper work.";

    let contextBlock = "";
    switch (ctx.type) {
        case "study":
            contextBlock = buildStudyContext({
                title: ctx.title,
                authors: ctx.authors ?? "",
                year: 0,
                quality: "-",
                abstract: ctx.abstract,
            });
            break;
        case "protocol_section":
            contextBlock = `\n\n[ADDITIONAL_CONTEXT]\nSection: ${sanitizeContext(ctx.section)}\n${sanitizeContext(ctx.currentContent)}`;
            break;
        case "criterion":
            contextBlock = `\n\n[ADDITIONAL_CONTEXT]\nCriterion (${ctx.criterionType}): ${sanitizeContext(ctx.text)}`;
            break;
        case "draft_selection":
            contextBlock = `\n\n[ADDITIONAL_CONTEXT]\nDraft section: ${sanitizeContext(ctx.section)}\nSelected text: ${sanitizeContext(ctx.selectedText)}`;
            break;
    }

    return base + conciseness + contextBlock;
}

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
    const { isOpen, context, closePopupChat } = usePopupChat();
    const { selectConversation, setCollapsed, refreshConversations } = useProjectCopilot();

    const [messages, setMessages] = useState<PopupMessage[]>([]);
    const [input, setInput] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [showTurnHint, setShowTurnHint] = useState(false);
    const [turnHintDismissed, setTurnHintDismissed] = useState(false);

    const abortRef = useRef<AbortController | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    }, [context]);

    // Show turn hint after threshold
    useEffect(() => {
        if (userTurnCount >= TURN_HINT_THRESHOLD && !turnHintDismissed) {
            setShowTurnHint(true);
        }
    }, [userTurnCount, turnHintDismissed]);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Focus textarea when popup opens
    useEffect(() => {
        if (isOpen) {
            setTimeout(() => textareaRef.current?.focus(), 100);
        }
    }, [isOpen]);

    const handleSend = useCallback(async () => {
        const trimmed = input.trim();
        if (!trimmed || isStreaming || !context) return;

        const userMsg: PopupMessage = {
            id: `pm-${Date.now()}`,
            role: "user",
            content: trimmed,
            createdAt: new Date().toISOString(),
        };

        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setIsStreaming(true);

        // Build messages array for the API
        const systemPrompt = buildPopupSystemPrompt(context);
        const apiMessages = [
            { id: "sys", role: "system" as const, content: systemPrompt, createdAt: "" },
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
                body: JSON.stringify({ messages: apiMessages }),
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
        } catch (error) {
            if (error instanceof DOMException && error.name === "AbortError") return;

            const errorText = `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}`;
            setMessages((prev) => [
                ...prev,
                { id: aiMsgId, role: "assistant", content: fullContent ? fullContent + "\n\n" + errorText : errorText, createdAt: new Date().toISOString() },
            ]);
        } finally {
            setIsStreaming(false);
            if (abortRef.current === controller) {
                abortRef.current = null;
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

    const handleContinueInCopilot = useCallback(async () => {
        if (!context || messages.length === 0) return;

        try {
            const page = contextToPage(context);
            const studyId = context.type === "study" ? context.studyId : undefined;

            const { id: convId } = await createConversation({
                projectId,
                studyId,
                page,
                context: studyId ? "study" : "project",
            });

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
        } catch (err) {
            console.error("Failed to continue in copilot:", err);
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

    return (
        <Dialog.Root open={isOpen} onOpenChange={(open) => { if (!open) closePopupChat(); }}>
            <Dialog.Portal>
                <Dialog.Overlay className={styles.overlay} />
                <Dialog.Content
                    className={styles.popupChat}
                    aria-label="Ask AI mini-chat"
                    onEscapeKeyDown={() => closePopupChat()}
                    onInteractOutside={(e) => {
                        // Don't close if clicking inside the popup itself
                        e.preventDefault();
                    }}
                >
                    {/* Header */}
                    <div className={styles.header}>
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
                    <div className={styles.messages}>
                        {messages.length === 0 ? (
                            <div className={styles.emptyMessages}>Ask a question about this context...</div>
                        ) : (
                            messages.map((msg, i) => (
                                <div
                                    key={msg.id}
                                    className={`${styles.msgRow} ${msg.role === "user" ? styles.msgRowUser : styles.msgRowAi}`}
                                >
                                    <div className={styles.msgBubble}>
                                        {msg.role === "assistant" ? (
                                            <div
                                                className={`${styles.msgText} ${isStreaming && i === messages.length - 1 ? styles.streaming : ""}`}
                                            >
                                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                    {msg.content}
                                                </ReactMarkdown>
                                            </div>
                                        ) : (
                                            <div className={styles.msgText}>{msg.content}</div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}
                        <div ref={messagesEndRef} />
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
                                placeholder="Ask a question..."
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
