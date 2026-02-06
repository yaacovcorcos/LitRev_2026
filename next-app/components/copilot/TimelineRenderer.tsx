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
import type { CopilotMessage } from "@/lib/projectCopilotStorage";
import type { TimelineItem, TimelineArtifact } from "@/types/timeline";
import type {
    PlanPayload,
    StudyProposalPayload,
    ScreeningBatchPayload,
    CriteriaCardPayload,
    DraftDiffPayload,
} from "@/types/artifacts";
import { messagesToTimeline } from "./StreamReducer";
import { ArtifactWrapper } from "../artifacts/ArtifactWrapper";
import { PlanCard } from "../artifacts/PlanCard";
import { StudyCard } from "../artifacts/StudyCard";
import { ScreeningBatch } from "../artifacts/ScreeningBatch";
import { PICOCard, type PICOValues } from "../artifacts/PICOCard";
import { CriteriaCard } from "../artifacts/CriteriaCard";
import { DraftBlock } from "../artifacts/DraftBlock";
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
    /** Callback when user reviews an artifact (accept/reject) */
    onReviewArtifact?: (artifactId: string, status: "accepted" | "rejected", note?: string) => void;
    /** Callback to save a message to notes */
    onSaveToNotes?: (content: string, messageId: string) => void;
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
}: TimelineRendererProps) {
    const params = useParams<{ id: string }>();
    const projectId = params?.id;
    const listRef = useRef<HTMLDivElement | null>(null);
    const autoScrollRef = useRef(true);
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
        autoScrollRef.current = scrollTop + clientHeight >= scrollHeight - 80;
    }, []);

    const handleCopy = useCallback((text: string) => {
        navigator.clipboard.writeText(text).catch(console.error);
    }, []);

    const handleSaveToNotes = useCallback((content: string, messageId: string) => {
        if (onSaveToNotes) {
            onSaveToNotes(content, messageId);
            setSavedNoteId(messageId);
            setTimeout(() => setSavedNoteId(null), 2000);
        }
    }, [onSaveToNotes]);

    // Empty state
    if (timeline.length === 0) {
        return (
            <div className={styles.copilotBody} ref={listRef}>
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
        const handleReview = (status: "accepted" | "rejected", note?: string) => {
            onReviewArtifact?.(item.artifactId, status, note);
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

            case "protocol_suggestion":
                return (
                    <ArtifactWrapper
                        {...wrapperProps}
                        summaryText="PICO saved to protocol"
                    >
                        <PICOCard
                            payload={item.payload as PICOValues}
                            onAccept={() => handleReview("accepted")}
                            onEdit={() => {/* Phase 2: handle inline edits */}}
                        />
                    </ArtifactWrapper>
                );

            case "criteria_card":
                return (
                    <ArtifactWrapper
                        {...wrapperProps}
                        summaryText={`${(item.payload as CriteriaCardPayload)?.inclusion?.length ?? 0} inclusion + ${(item.payload as CriteriaCardPayload)?.exclusion?.length ?? 0} exclusion criteria saved`}
                    >
                        <CriteriaCard
                            payload={item.payload as CriteriaCardPayload}
                            onSave={() => handleReview("accepted")}
                            onAdd={() => {/* Phase 2: handle adds */}}
                            onRemove={() => {/* Phase 2: handle removes */}}
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

            default:
                // evidence_table, memory_proposal — deferred to later phases
                return (
                    <ArtifactWrapper {...wrapperProps} summaryText={item.title}>
                        <div style={{ padding: 8, fontSize: 13, color: "var(--text-secondary)" }}>
                            {item.title}
                        </div>
                    </ArtifactWrapper>
                );
        }
    };

    const renderTimelineItem = (item: TimelineItem) => {
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
                        <div className={styles.chatBubble}>
                            <div className={markdownStyles.markdownContent}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {item.content}
                                </ReactMarkdown>
                            </div>
                            <div className={styles.chatActions}>
                                {onInsert && (
                                    <button
                                        type="button"
                                        className={styles.smallBtn}
                                        onClick={() => onInsert(item.content)}
                                    >
                                        Insert
                                    </button>
                                )}
                                {onSaveToNotes && (
                                    savedNoteId === item.id ? (
                                        <span className={artifactStyles.savedConfirm}>Saved!</span>
                                    ) : (
                                        <button
                                            type="button"
                                            className={artifactStyles.msgActionBtn}
                                            onClick={() => handleSaveToNotes(item.content, item.id)}
                                        >
                                            <span className="material-icons-round">bookmark</span>
                                            Save to Notes
                                        </button>
                                    )
                                )}
                                <button
                                    type="button"
                                    className={styles.smallBtnGhost}
                                    onClick={() => handleCopy(item.content)}
                                >
                                    Copy
                                </button>
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
        <div className={styles.copilotBody} ref={listRef} onScroll={handleScroll}>
            <div className={styles.chatList}>
                {timeline.map(renderTimelineItem)}
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
        </div>
    );
}
