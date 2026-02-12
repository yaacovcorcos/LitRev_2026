/**
 * TimelineRenderer
 * Renders the conversation timeline: messages, artifacts, progress, checkpoints, errors.
 * Supports both legacy CopilotMessage[] and new TimelineItem[] inputs.
 * (planC Phase 0.6 + Phase 1)
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "../markdown/CodeBlock";
import type { CopilotMessage } from "@/lib/projectCopilotStorage";
import type { TimelineItem, TimelineArtifact } from "@/types/timeline";
import type {
    PlanPayload,
    StudyProposalPayload,
    ScreeningBatchPayload,
    CriteriaCardPayload,
    ProtocolSuggestionPayload,
    DraftDiffPayload,
    MemoryProposalPayload,
} from "@/types/artifacts";
import { messagesToTimeline } from "./StreamReducer";
import { ArtifactWrapper } from "../artifacts/ArtifactWrapper";
import { PlanCard } from "../artifacts/PlanCard";
import { StudyCard } from "../artifacts/StudyCard";
import { ScreeningBatch } from "../artifacts/ScreeningBatch";
import { ProtocolEditCard } from "../artifacts/ProtocolEditCard";
import { CriteriaCard } from "../artifacts/CriteriaCard";
import { DraftBlock } from "../artifacts/DraftBlock";
import { MemoryCard } from "../artifacts/MemoryCard";
import { StreamingProgress } from "./StreamingProgress";
import styles from "../ProjectCopilot.module.css";
import artifactStyles from "@/styles/artifacts.module.css";
import markdownStyles from "@/styles/markdown.module.css";

const ARTIFACT_JUMP_MAP: Record<string, { tab: string; label: string }> = {
    study_proposal: { tab: "ledger", label: "View in Ledger" },
    screening_batch: { tab: "ledger", label: "View in Ledger" },
    criteria_card: { tab: "protocol", label: "View in Protocol" },
    protocol_suggestion: { tab: "protocol", label: "View in Protocol" },
    draft_diff: { tab: "draft", label: "View in Draft" },
};

function getJumpToProps(artifactType: string, projectId: string): { jumpToLink?: string; jumpToLabel?: string } {
    const mapping = ARTIFACT_JUMP_MAP[artifactType];
    if (!mapping) return {};
    return {
        jumpToLink: `/project/${projectId}/${mapping.tab}`,
        jumpToLabel: mapping.label,
    };
}

export type TimelineRendererProps = {
    /** Legacy message input (backward compat) */
    messages: CopilotMessage[];
    /** New timeline item input — takes priority over messages when provided */
    items?: TimelineItem[];
    isLoading: boolean;
    onInsert?: (text: string) => void;
    emptyState: {
        icon: string;
        title: string;
        description: string;
        suggestions: { label: string; prompt: string }[];
    };
    onSuggestionClick: (prompt: string) => void;
    /** Callback when user reviews an artifact (accept/reject). editedPayload is set when user edits before accepting. */
    onReviewArtifact?: (artifactId: string, status: "accepted" | "rejected", note?: string, editedPayload?: Record<string, unknown>) => void;
    /** Callback to save a message to notes */
    onSaveToNotes?: (content: string, messageId: string) => void | Promise<void>;
    /** Layout variant: "panel" for copilot sidebar (bubbles), "page" for conversation mode (full-width) */
    variant?: "panel" | "page";
};

export function TimelineRenderer({
    messages,
    items,
    isLoading,
    onInsert,
    emptyState,
    onSuggestionClick,
    onReviewArtifact,
    onSaveToNotes,
    variant = "panel",
}: TimelineRendererProps) {
    const params = useParams<{ id: string }>();
    const projectId = params?.id;
    const listRef = useRef<HTMLDivElement | null>(null);
    const autoScrollRef = useRef(true);
    const [isAtBottom, setIsAtBottom] = useState(true);
    const [savedNoteId, setSavedNoteId] = useState<string | null>(null);

    // Resolve timeline: prefer items, fall back to legacy messages
    const timeline = items ?? messagesToTimeline(messages);

    // Auto-scroll to bottom when new items arrive
    useEffect(() => {
        if (!listRef.current || !autoScrollRef.current) return;
        listRef.current.scrollTop = listRef.current.scrollHeight;
    }, [timeline]);

    const handleScroll = useCallback(() => {
        if (!listRef.current) return;
        const { scrollTop, clientHeight, scrollHeight } = listRef.current;
        const atBottom = scrollTop + clientHeight >= scrollHeight - 80;
        autoScrollRef.current = atBottom;
        setIsAtBottom(atBottom);
    }, []);

    const scrollToBottom = useCallback(() => {
        if (!listRef.current) return;
        listRef.current.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
        autoScrollRef.current = true;
        setIsAtBottom(true);
    }, []);

    const handleCopy = useCallback((text: string) => {
        navigator.clipboard.writeText(text).catch(console.error);
    }, []);

    const handleSaveToNotes = useCallback(async (content: string, messageId: string) => {
        if (onSaveToNotes) {
            try {
                await onSaveToNotes(content, messageId);
                setSavedNoteId(messageId);
                setTimeout(() => setSavedNoteId(null), 2000);
            } catch {
                // Silently fail — note creation error doesn't need to block UI
            }
        }
    }, [onSaveToNotes]);

    // Empty state
    if (timeline.length === 0) {
        return (
            <div className={`${styles.copilotBody} ${variant === "page" ? styles.copilotBodyEmpty : ""}`} ref={listRef}>
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
                                onClick={() => onSuggestionClick(suggestion.prompt)}
                            >
                                {suggestion.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    const renderArtifactContent = (item: TimelineArtifact) => {
        const handleReview = (status: "accepted" | "rejected", note?: string, editedPayload?: Record<string, unknown>) => {
            onReviewArtifact?.(item.artifactId, status, note, editedPayload);
        };

        const jumpTo = projectId ? getJumpToProps(item.artifactType, projectId) : {};

        const wrapperProps = {
            artifactId: item.artifactId,
            artifactType: item.artifactType,
            status: item.status,
            title: item.title,
            version: item.version,
            onReview: handleReview,
            ...jumpTo,
        };

        switch (item.artifactType) {
            case "plan":
                return (
                    <ArtifactWrapper
                        {...wrapperProps}
                        summaryText={`Plan executed: ${(item.payload as PlanPayload)?.steps?.length ?? 0} steps`}
                    >
                        <PlanCard
                            payload={item.payload as PlanPayload}
                            onRun={() => handleReview("accepted")}
                            onCancel={() => handleReview("rejected")}
                        />
                    </ArtifactWrapper>
                );

            case "study_proposal":
                return (
                    <ArtifactWrapper
                        {...wrapperProps}
                        summaryText={`${(item.payload as StudyProposalPayload)?.title ?? "Study"}`}
                    >
                        <StudyCard
                            payload={item.payload as StudyProposalPayload}
                            onKeep={() => handleReview("accepted")}
                            onExclude={(reason) => handleReview("rejected", reason)}
                            onMaybe={() => {/* Phase 2: handle maybe status */}}
                        />
                    </ArtifactWrapper>
                );

            case "screening_batch":
                return (
                    <ArtifactWrapper
                        {...wrapperProps}
                        summaryText={`Screened ${(item.payload as ScreeningBatchPayload)?.summary?.total ?? 0} studies`}
                    >
                        <ScreeningBatch
                            payload={item.payload as ScreeningBatchPayload}
                            onAcceptAll={() => handleReview("accepted")}
                            onReviewEach={() => {/* Phase 2: expand to individual cards */}}
                            onOverride={() => {/* Phase 2: handle overrides */}}
                        />
                    </ArtifactWrapper>
                );

            case "protocol_suggestion": {
                const protocolPayload = item.payload as ProtocolSuggestionPayload;
                return (
                    <ArtifactWrapper
                        {...wrapperProps}
                        summaryText={`Protocol updated: ${protocolPayload?.field ?? "field"}`}
                    >
                        <ProtocolEditCard
                            payload={protocolPayload}
                            onAccept={(editedValue) => {
                                if (editedValue !== undefined) {
                                    // User edited the value — pass edited payload through the review pipeline
                                    handleReview("accepted", undefined, {
                                        ...protocolPayload,
                                        value: editedValue,
                                    });
                                } else {
                                    handleReview("accepted");
                                }
                            }}
                        />
                    </ArtifactWrapper>
                );
            }

            case "criteria_card":
                // Legacy: read-only renderer for old criteria_card artifacts still in DB
                return (
                    <ArtifactWrapper
                        {...wrapperProps}
                        summaryText={`${(item.payload as CriteriaCardPayload)?.inclusion?.length ?? 0} inclusion + ${(item.payload as CriteriaCardPayload)?.exclusion?.length ?? 0} exclusion criteria`}
                    >
                        <CriteriaCard
                            payload={item.payload as CriteriaCardPayload}
                            onSave={() => handleReview("accepted")}
                            onAdd={() => {}}
                            onRemove={() => {}}
                        />
                    </ArtifactWrapper>
                );

            case "draft_diff":
                return (
                    <ArtifactWrapper
                        {...wrapperProps}
                        summaryText={`${(item.payload as DraftDiffPayload)?.section ?? "Draft"} saved`}
                    >
                        <DraftBlock
                            payload={item.payload as DraftDiffPayload}
                            onAccept={() => handleReview("accepted")}
                            onEdit={() => {/* Phase 2: navigate to draft editor */}}
                            onRedo={() => {/* Phase 2: re-send message */}}
                        />
                    </ArtifactWrapper>
                );

            case "memory_proposal":
                return (
                    <ArtifactWrapper
                        {...wrapperProps}
                        summaryText={`Remembered: ${(item.payload as MemoryProposalPayload)?.key ?? "preference"}`}
                    >
                        <MemoryCard
                            payload={item.payload as MemoryProposalPayload}
                            onAccept={() => handleReview("accepted")}
                            onReject={() => handleReview("rejected")}
                            onEditAndAccept={() => handleReview("accepted")}
                        />
                    </ArtifactWrapper>
                );

            default:
                // evidence_table — deferred to later phases
                return (
                    <ArtifactWrapper {...wrapperProps} summaryText={item.title}>
                        <div style={{ padding: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                            {item.title}
                        </div>
                    </ArtifactWrapper>
                );
        }
    };

    // Streaming cursor: detect when last AI message is actively receiving tokens
    const lastAssistantIndex = timeline.length > 0 && timeline[timeline.length - 1].type === "assistant_message"
        ? timeline.length - 1
        : -1;
    const isStreaming = isLoading && lastAssistantIndex >= 0;

    const renderTimelineItem = (item: TimelineItem, index: number) => {
        switch (item.type) {
            case "user_message":
                return (
                    <div key={item.id} className={`${styles.chatMsg} ${styles.chatMsgUser}`}>
                        <div className={styles.chatBubble}>
                            {item.attachments && item.attachments.length > 0 && (
                                <div className={styles.messageAttachments}>
                                    {item.attachments.map((att) => (
                                        <div key={att.fileAssetId ?? att.filename} className={styles.messageAttachment}>
                                            <span className="material-icons-round" style={{ fontSize: 14 }}>description</span>
                                            <span className={styles.messageAttachmentName}>{att.filename}</span>
                                            <span className={styles.messageAttachmentSize}>
                                                {att.size >= 1024 * 1024
                                                    ? `${(att.size / (1024 * 1024)).toFixed(1)} MB`
                                                    : `${Math.round(att.size / 1024)} KB`}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                            <p className={styles.chatText}>{item.content}</p>
                        </div>
                    </div>
                );

            case "assistant_message":
                return (
                    <div key={item.id} className={`${styles.chatMsg} ${styles.chatMsgAi}`}>
                        <div className={styles.chatStack}>
                            <div className={styles.chatBubble}>
                                <div className={`${markdownStyles.markdownContent} ${isStreaming && index === lastAssistantIndex ? styles.streaming : ""}`}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                        {item.content}
                                    </ReactMarkdown>
                                </div>
                            </div>
                            <div className={`${styles.chatActions} ${savedNoteId === item.id ? styles.chatActionsVisible : ""}`}>
                                <button
                                    type="button"
                                    className={styles.chatActionBtn}
                                    onClick={() => handleCopy(item.content)}
                                    title="Copy to clipboard"
                                >
                                    <span className="material-icons-round">content_copy</span>
                                </button>
                                {onSaveToNotes && (
                                    savedNoteId === item.id ? (
                                        <span className={artifactStyles.savedConfirm}>Saved!</span>
                                    ) : (
                                        <button
                                            type="button"
                                            className={styles.chatActionBtn}
                                            onClick={() => handleSaveToNotes(item.content, item.id)}
                                            title="Save to Notes"
                                        >
                                            <span className="material-icons-round">bookmark_border</span>
                                        </button>
                                    )
                                )}
                                {onInsert && (
                                    <button
                                        type="button"
                                        className={styles.chatActionBtn}
                                        onClick={() => onInsert(item.content)}
                                        title="Insert into draft"
                                    >
                                        <span className="material-icons-round">add_circle_outline</span>
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                );

            case "artifact":
                return (
                    <div key={item.id} className={styles.chatMsg}>
                        {renderArtifactContent(item)}
                    </div>
                );

            case "progress":
                return (
                    <div key={item.id}>
                        <StreamingProgress
                            message={item.message}
                            current={item.current}
                            total={item.total}
                        />
                    </div>
                );

            case "checkpoint":
                return (
                    <div key={item.id} className={artifactStyles.checkpoint}>
                        <div className={artifactStyles.checkpointLine} />
                        <span className={artifactStyles.checkpointLabel}>{item.label}</span>
                        <div className={artifactStyles.checkpointLine} />
                    </div>
                );

            case "error":
                return (
                    <div key={item.id} className={artifactStyles.errorCard}>
                        <span className="material-icons-round">error_outline</span>
                        <span className={artifactStyles.errorMessage}>{item.message}</span>
                        {item.retryable && (
                            <button type="button" className={artifactStyles.errorRetryBtn}>
                                Retry
                            </button>
                        )}
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className={`${styles.copilotBody} ${variant === "page" ? styles.pageLayout : ""}`} ref={listRef} onScroll={handleScroll}>
            <div className={styles.chatList}>
                {timeline.map((item, index) => renderTimelineItem(item, index))}
                {isLoading && timeline.length > 0 && timeline[timeline.length - 1].type === "user_message" && (
                    <div className={styles.loadingIndicator}>
                        <div className={styles.loadingDots}>
                            <span className={styles.loadingDot} />
                            <span className={styles.loadingDot} />
                            <span className={styles.loadingDot} />
                        </div>
                    </div>
                )}
            </div>
            {!isAtBottom && (
                <button
                    type="button"
                    className={styles.scrollFab}
                    onClick={scrollToBottom}
                    aria-label="Scroll to bottom"
                >
                    <span className="material-icons-round">keyboard_arrow_down</span>
                </button>
            )}
        </div>
    );
}
