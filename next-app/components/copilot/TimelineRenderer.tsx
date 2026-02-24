/**
 * TimelineRenderer
 * Renders the conversation timeline: messages, artifacts, progress, checkpoints, errors.
 * Supports both legacy CopilotMessage[] and new TimelineItem[] inputs.
 * (planC Phase 0.6 + Phase 1)
 */

"use client";

import { Component, memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStableChatScroll } from "@/hooks/useStableChatScroll";
import type { ErrorInfo, ReactNode } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "../markdown/CodeBlock";
import type { CopilotMessage } from "@/lib/projectCopilotStorage";
import type { TimelineItem, TimelineArtifact } from "@/types/timeline";
import type { AgentMode } from "@/types/agent";
import type {
    PlanPayload,
    StudyProposalPayload,
    StudyUpdatePayload,
    ScreeningBatchPayload,
    CriteriaCardPayload,
    ProtocolSuggestionPayload,
    ScopingReportPayload,
    DraftDiffPayload,
    MemoryProposalPayload,
    MemoryForgetProposalPayload,
} from "@/types/artifacts";
import { messagesToTimeline } from "./StreamReducer";
import { ArtifactWrapper } from "../artifacts/ArtifactWrapper";
import { PlanCard } from "../artifacts/PlanCard";
import { StudyCard } from "../artifacts/StudyCard";
import { StudyUpdateCard } from "../artifacts/StudyUpdateCard";
import { ScreeningBatch } from "../artifacts/ScreeningBatch";
import { ProtocolEditCard } from "../artifacts/ProtocolEditCard";
import { CriteriaCard } from "../artifacts/CriteriaCard";
import { DraftBlock } from "../artifacts/DraftBlock";
import { MemoryCard } from "../artifacts/MemoryCard";
import { MemoryForgetCard } from "../artifacts/MemoryForgetCard";
import { ScopingReportCard } from "../artifacts/ScopingReportCard";
import { StreamingProgress } from "./StreamingProgress";
import { addMentionedStudyAction } from "@/app/actions/ledger";
import { extractMentionedStudies, stripMentionedStudiesMarkup, type MentionedStudy } from "@/lib/ai/mentioned-studies";
import { isChatStudyMentionsEnabled } from "@/lib/agent/feature-flags";
import styles from "../ProjectCopilot.module.css";
import artifactStyles from "@/styles/artifacts.module.css";
import markdownStyles from "@/styles/markdown.module.css";

// ── Per-artifact error boundary (P5) ─────────────────────────────────────────
// Prevents a single broken artifact card from crashing the whole timeline.

class ArtifactErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
    constructor(props: { children: ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }
    static getDerivedStateFromError(): { hasError: boolean } {
        return { hasError: true };
    }
    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("[ArtifactErrorBoundary]", error, info.componentStack);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--glass-border)", background: "rgba(192,57,43,0.06)", color: "var(--color-danger, #c0392b)", fontSize: 13 }}>
                    Failed to render this artifact.
                </div>
            );
        }
        return this.props.children;
    }
}

// ─────────────────────────────────────────────────────────────────────────────

const ARTIFACT_JUMP_MAP: Record<string, { tab: string; label: string }> = {
    study_proposal: { tab: "ledger", label: "View in Ledger" },
    study_update: { tab: "ledger", label: "View in Ledger" },
    screening_batch: { tab: "ledger", label: "View in Ledger" },
    criteria_card: { tab: "protocol", label: "View in Protocol" },
    protocol_suggestion: { tab: "protocol", label: "View in Protocol" },
    scoping_report: { tab: "protocol", label: "Refine Protocol" },
    draft_diff: { tab: "draft", label: "View in Draft" },
    memory_forget_proposal: { tab: "memory", label: "View in Memory" },
};

function getJumpToProps(artifactType: string, projectId: string): { jumpToLink?: string; jumpToLabel?: string } {
    const mapping = ARTIFACT_JUMP_MAP[artifactType];
    if (!mapping) return {};
    return {
        jumpToLink: `/project/${projectId}/${mapping.tab}`,
        jumpToLabel: mapping.label,
    };
}

// ── Memo-wrapped row components (P1 / P2) ─────────────────────────────────────
// Defined at module level so React treats them as stable component types and
// memo's shallow-prop comparison actually prevents re-renders of unchanged rows.

type UserMessageRowProps = {
    item: Extract<TimelineItem, { type: "user_message" }>;
    onCopy: (text: string) => void;
    onBranchFromMessage?: (messageId: string, createdAt: string) => void | Promise<void>;
};

const USER_MARKDOWN_ELEMENTS = ["p", "strong", "em", "code", "a", "br"] as const;
const SCOPING_REPORT_COMMENT_RE = /<!--\s*SCOPING_REPORT:\s*[\s\S]*?-->/gi;
const SCOPING_REPORT_COMMENT_OPEN_RE = /<!--\s*SCOPING_REPORT:\s*[\s\S]*$/i;
const SCOPING_REPORT_XML_RE = /<scoping_report>\s*[\s\S]*?<\/scoping_report>/gi;
const SCOPING_REPORT_XML_OPEN_RE = /<scoping_report>[\s\S]*$/i;
const CHAT_STUDY_MENTIONS_ENABLED = isChatStudyMentionsEnabled();

function stripInternalAssistantMetadata(content: string): string {
    return content
        .replace(SCOPING_REPORT_COMMENT_RE, "")
        .replace(SCOPING_REPORT_XML_RE, "")
        .replace(SCOPING_REPORT_COMMENT_OPEN_RE, "")
        .replace(SCOPING_REPORT_XML_OPEN_RE, "")
        .trimEnd();
}

function stripAssistantMarkupForDisplay(content: string): string {
    return stripMentionedStudiesMarkup(stripInternalAssistantMetadata(content))
        .trimEnd();
}

const UserMessageRow = memo(function UserMessageRow({ item, onCopy, onBranchFromMessage }: UserMessageRowProps) {
    return (
        <div className={`${styles.chatMsg} ${styles.chatMsgUser}`} role="article" aria-label="You">
            <div className={styles.chatStack}>
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
                    {/* Inline-only markdown: bold, italic, code, links — no headers/lists */}
                    <div className={styles.chatText}>
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            allowedElements={USER_MARKDOWN_ELEMENTS}
                            unwrapDisallowed
                        >
                            {item.content}
                        </ReactMarkdown>
                    </div>
                </div>
                <div className={styles.chatActions}>
                    <button
                        type="button"
                        className={styles.chatActionBtn}
                        onClick={() => onCopy(item.content)}
                        title="Copy to clipboard"
                    >
                        <span className="material-icons-round">content_copy</span>
                    </button>
                    {onBranchFromMessage && (
                        <button
                            type="button"
                            className={styles.chatActionBtn}
                            onClick={() => onBranchFromMessage(item.id, item.createdAt)}
                            title="Branch from this message"
                        >
                            <span className="material-icons-round">call_split</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
});

type AssistantMessageRowProps = {
    item: Extract<TimelineItem, { type: "assistant_message" }>;
    projectId?: string;
    /** True only when this specific message is actively receiving streaming tokens */
    isStreaming: boolean;
    /** True when this message was just saved to Notes (shows confirmation) */
    isSaved: boolean;
    /** True while the save-to-notes request is in-flight (shows spinner) */
    isSaving: boolean;
    onCopy: (text: string) => void;
    onSaveToNotes?: (content: string, messageId: string) => void | Promise<void>;
    onInsert?: (text: string) => void;
    onBranchFromMessage?: (messageId: string, createdAt: string) => void | Promise<void>;
};

type MentionAddState = "idle" | "adding" | "added" | "exists" | "error";

function mentionDisplayTitle(study: MentionedStudy): string {
    if (study.title) return study.title;
    if (study.doi) return study.doi;
    if (study.pmid) return `PMID ${study.pmid}`;
    if (study.s2PaperId) return `S2 ${study.s2PaperId}`;
    return "Untitled study";
}

function mentionButtonText(state: MentionAddState, hasProject: boolean): string {
    if (!hasProject) return "Select project";
    if (state === "adding") return "Adding...";
    if (state === "added") return "Added";
    if (state === "exists") return "Already in ledger";
    if (state === "error") return "Retry";
    return "Add to ledger";
}

const AssistantMessageRow = memo(function AssistantMessageRow({
    item,
    projectId,
    isStreaming,
    isSaved,
    isSaving,
    onCopy,
    onSaveToNotes,
    onInsert,
    onBranchFromMessage,
}: AssistantMessageRowProps) {
    const displayContent = stripAssistantMarkupForDisplay(item.content);
    const mentions = useMemo(
        () => (CHAT_STUDY_MENTIONS_ENABLED ? extractMentionedStudies(item.content) : []),
        [item.content]
    );
    const [mentionStates, setMentionStates] = useState<Record<string, MentionAddState>>({});

    const addMentionedStudy = useCallback(async (study: MentionedStudy) => {
        if (!projectId) return;
        setMentionStates((prev) => ({ ...prev, [study.key]: "adding" }));

        try {
            const result = await addMentionedStudyAction(projectId, {
                title: study.title,
                authors: study.authors,
                year: study.year,
                doi: study.doi,
                pmid: study.pmid,
                s2PaperId: study.s2PaperId,
                sourceUrl: study.sourceUrl,
            });
            if (!result.success) throw new Error(result.error);
            setMentionStates((prev) => ({
                ...prev,
                [study.key]: result.data.created ? "added" : "exists",
            }));
            window.dispatchEvent(new CustomEvent("litrev:ledger-changed", { detail: { projectId } }));
        } catch (error) {
            console.error("[mentions] add to ledger failed", error);
            setMentionStates((prev) => ({ ...prev, [study.key]: "error" }));
        }
    }, [projectId]);

    return (
        <div className={`${styles.chatMsg} ${styles.chatMsgAi}`} role="article" aria-label="Assistant">
            <div className={styles.chatStack}>
                <div className={styles.chatBubble}>
                    <div className={markdownStyles.markdownContent}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {displayContent}
                        </ReactMarkdown>
                        {isStreaming && (
                            <span className={styles.streamingCursor} aria-hidden="true">◎</span>
                        )}
                    </div>
                </div>
                {mentions.length > 0 && (
                    <div className={styles.mentionedStudiesRow}>
                        <span className={styles.mentionedStudiesLabel}>Mentioned studies</span>
                        <div className={styles.mentionedStudiesList}>
                            {mentions.map((study) => {
                                const state = mentionStates[study.key] ?? "idle";
                                const disabled = !projectId || state === "adding" || state === "added" || state === "exists";
                                return (
                                    <div key={study.key} className={styles.mentionedStudyChip}>
                                        <span className={styles.mentionedStudyTitle}>{mentionDisplayTitle(study)}</span>
                                        {study.year && <span className={styles.mentionedStudyYear}>{study.year}</span>}
                                        {study.sourceUrl && (
                                            <a
                                                href={study.sourceUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className={styles.mentionedStudyLink}
                                                aria-label={`Open source for ${mentionDisplayTitle(study)}`}
                                                title="Open source"
                                            >
                                                <span className="material-icons-round">open_in_new</span>
                                            </a>
                                        )}
                                        <button
                                            type="button"
                                            className={styles.mentionedStudyAddBtn}
                                            onClick={() => { void addMentionedStudy(study); }}
                                            disabled={disabled}
                                        >
                                            {mentionButtonText(state, !!projectId)}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
                <div className={`${styles.chatActions} ${isSaved || isSaving ? styles.chatActionsVisible : ""}`}>
                    <button
                        type="button"
                        className={styles.chatActionBtn}
                        onClick={() => onCopy(displayContent)}
                        title="Copy to clipboard"
                    >
                        <span className="material-icons-round">content_copy</span>
                    </button>
                    {onSaveToNotes && (
                        isSaved ? (
                            <span className={artifactStyles.savedConfirm}>Saved!</span>
                        ) : isSaving ? (
                            <span className={styles.savingSpinner} aria-label="Saving…">
                                <span className="material-icons-round">sync</span>
                            </span>
                        ) : (
                            <button
                                type="button"
                                className={styles.chatActionBtn}
                                onClick={() => onSaveToNotes(displayContent, item.id)}
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
                            onClick={() => onInsert(displayContent)}
                            title="Insert into draft"
                        >
                            <span className="material-icons-round">add_circle_outline</span>
                        </button>
                    )}
                    {onBranchFromMessage && (
                        <button
                            type="button"
                            className={styles.chatActionBtn}
                            onClick={() => onBranchFromMessage(item.id, item.createdAt)}
                            title="Branch from this message"
                        >
                            <span className="material-icons-round">call_split</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
});

// ─────────────────────────────────────────────────────────────────────────────

export type TimelineRendererProps = {
    /** Legacy message input (backward compat) */
    messages?: CopilotMessage[];
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
    /** Callback for one-click action prompts from artifact cards (e.g., scoping decision actions). */
    onActionPrompt?: (prompt: string, mode?: AgentMode) => void;
    /** Callback when user reviews an artifact (accept/reject). editedPayload is set when user edits before accepting. */
    onReviewArtifact?: (artifactId: string, status: "accepted" | "rejected", note?: string, editedPayload?: Record<string, unknown>) => void;
    /** Callback when user clicks Run on a plan artifact with selected step indexes. */
    onExecutePlan?: (artifactId: string, selectedIndexes: number[]) => void;
    /** Callback to save a message to notes */
    onSaveToNotes?: (content: string, messageId: string) => void | Promise<void>;
    /** Optional retry callback for retryable error cards */
    onRetryLastMessage?: () => void;
    /** Optional callback to branch conversation history up to a specific message */
    onBranchFromMessage?: (messageId: string, createdAt: string) => void | Promise<void>;
    /** Layout variant: "panel" for copilot sidebar (bubbles), "page" for conversation mode (full-width) */
    variant?: "panel" | "page";
    /** When true (conversation being fetched), show a shimmer skeleton instead of the empty state */
    isConversationLoading?: boolean;
    /** Stable ID of the active conversation — used to reset scroll state on switch */
    conversationId?: string;
    /** Optional explicit project ID override (used in /ai route where useParams has no project id). */
    projectId?: string;
};

export function TimelineRenderer({
    messages = [],
    items,
    isLoading,
    onInsert,
    emptyState,
    onSuggestionClick,
    onActionPrompt,
    onReviewArtifact,
    onExecutePlan,
    onSaveToNotes,
    onRetryLastMessage,
    onBranchFromMessage,
    variant = "panel",
    isConversationLoading = false,
    conversationId,
    projectId: projectIdProp,
}: TimelineRendererProps) {
    const params = useParams();
    const routeProjectId = params && typeof params === "object" && "id" in params
        ? String((params as Record<string, unknown>).id)
        : undefined;
    const projectId = projectIdProp ?? routeProjectId;
    const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
    const [savingNoteId, setSavingNoteId] = useState<string | null>(null);

    // ── Shared scroll hook ──────────────────────────────────────────────────
    const {
        containerRef, bottomRef, onScroll, isPinned, scrollToBottom,
        notifyStreamStart, notifyConversationChanged, notifyContentChanged,
    } = useStableChatScroll();

    // Resolve timeline: prefer items, fall back to legacy messages.
    // Memoized so useLayoutEffect([timeline]) only fires on real content changes,
    // not on every unrelated re-render.
    const timeline = useMemo(
        () => items ?? messagesToTimeline(messages),
        [items, messages]
    );

    // ── Conversation change — ID-only, Strict Mode safe ─────────────────────
    useLayoutEffect(() => {
        if (conversationId) notifyConversationChanged(conversationId);
    }, [conversationId, notifyConversationChanged]);

    // ── Stream start — fires once on false→true transition only ─────────────
    const prevLoadingRef = useRef(false);
    useLayoutEffect(() => {
        if (isLoading && !prevLoadingRef.current) notifyStreamStart();
        prevLoadingRef.current = isLoading;
    }, [isLoading, notifyStreamStart]);

    // ── Content change — schedule scroll if pinned ──────────────────────────
    useLayoutEffect(() => { notifyContentChanged(); }, [timeline, notifyContentChanged]);

    const handleCopy = useCallback((text: string) => {
        navigator.clipboard.writeText(text).catch(console.error);
    }, []);

    const handleSaveToNotes = useCallback(async (content: string, messageId: string) => {
        if (onSaveToNotes) {
            setSavingNoteId(messageId);
            try {
                await onSaveToNotes(content, messageId);
                setSavedNoteId(messageId);
                setTimeout(() => setSavedNoteId(null), 2000);
            } catch {
                // Silently fail — note creation error doesn't need to block UI
            } finally {
                setSavingNoteId(null);
            }
        }
    }, [onSaveToNotes]);

    // Skeleton while a conversation is being fetched from the server
    if (isConversationLoading && timeline.length === 0) {
        return (
            <div className={`${styles.copilotBody} ${variant === "page" ? styles.pageLayout : ""}`} ref={containerRef} onScroll={onScroll}>
                <div className={styles.skeletonList} aria-busy="true" aria-label="Loading conversation">
                    <div className={styles.skeletonRow}>
                        <div className={`${styles.skeletonBubble} ${styles.skeletonBubbleUser}`} />
                    </div>
                    <div className={styles.skeletonRow}>
                        <div className={`${styles.skeletonBubble} ${styles.skeletonBubbleLong}`} />
                        <div className={`${styles.skeletonBubble} ${styles.skeletonBubbleMid}`} />
                        <div className={`${styles.skeletonBubble} ${styles.skeletonBubbleShort}`} />
                    </div>
                    <div className={styles.skeletonRow}>
                        <div className={`${styles.skeletonBubble} ${styles.skeletonBubbleUser}`} />
                    </div>
                    <div className={styles.skeletonRow}>
                        <div className={`${styles.skeletonBubble} ${styles.skeletonBubbleMid}`} />
                        <div className={`${styles.skeletonBubble} ${styles.skeletonBubbleShort}`} />
                    </div>
                </div>
                <div ref={bottomRef} style={{ height: 1, flexShrink: 0 }} aria-hidden="true" />
            </div>
        );
    }

    // Empty state
    if (timeline.length === 0) {
        return (
            <div className={`${styles.copilotBody} ${variant === "page" ? styles.pageLayout : ""}`} ref={containerRef} onScroll={onScroll}>
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
                <div ref={bottomRef} style={{ height: 1, flexShrink: 0 }} aria-hidden="true" />
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
            case "plan": {
                const canExecutePlan = !!onExecutePlan && !isLoading && !isConversationLoading;
                return (
                    <ArtifactWrapper
                        {...wrapperProps}
                        summaryText={`Plan executed: ${(item.payload as PlanPayload)?.steps?.length ?? 0} steps`}
                    >
                        <PlanCard
                            payload={item.payload as PlanPayload}
                            status={item.status}
                            onRun={canExecutePlan ? (selectedIndexes) => onExecutePlan(item.artifactId, selectedIndexes) : undefined}
                            onCancel={() => handleReview("rejected")}
                            canRun={canExecutePlan}
                        />
                    </ArtifactWrapper>
                );
            }

            case "study_proposal": {
                const studyPayload = item.payload as StudyProposalPayload;
                const isExclusion = studyPayload?.recommendation === "exclude";
                return (
                    <ArtifactWrapper
                        {...wrapperProps}
                        summaryText={`${studyPayload?.title ?? "Study"}`}
                    >
                        <StudyCard
                            payload={studyPayload}
                            onKeep={() => handleReview(isExclusion ? "rejected" : "accepted")}
                            onExclude={(reason) => handleReview(isExclusion ? "accepted" : "rejected", reason)}
                        />
                    </ArtifactWrapper>
                );
            }

            case "study_update": {
                const updatePayload = item.payload as StudyUpdatePayload;
                const n = updatePayload?.changes?.length ?? 0;
                return (
                    <ArtifactWrapper
                        {...wrapperProps}
                        summaryText={`${n} field${n === 1 ? "" : "s"} updated on "${updatePayload?.studyTitle ?? "study"}"`}
                    >
                        <StudyUpdateCard
                            payload={updatePayload}
                            onAccept={() => handleReview("accepted")}
                            onReject={() => handleReview("rejected")}
                        />
                    </ArtifactWrapper>
                );
            }

            case "screening_batch":
                return (
                    <ArtifactWrapper
                        {...wrapperProps}
                        summaryText={`Screened ${(item.payload as ScreeningBatchPayload)?.summary?.total ?? 0} studies`}
                    >
                        <ScreeningBatch
                            payload={item.payload as ScreeningBatchPayload}
                            onAcceptAll={() => handleReview("accepted")}
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
                            onDiscuss={() => {
                                const prompt = `Let's discuss the proposed protocol update to "${protocolPayload?.field ?? "this field"}" before applying it.`;
                                if (onActionPrompt) {
                                    onActionPrompt(prompt, "protocol");
                                    return;
                                }
                                onSuggestionClick(prompt);
                            }}
                            onAccept={(editedValue) => {
                                if (editedValue !== undefined) {
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

            case "scoping_report": {
                const scopingPayload = item.payload as ScopingReportPayload;
                const qCount = scopingPayload?.recommendedQuestions?.length ?? 0;
                return (
                    <ArtifactWrapper
                        {...wrapperProps}
                        summaryText={`Scoping complete: ${qCount} recommended question${qCount === 1 ? "" : "s"}`}
                    >
                        <ScopingReportCard
                            payload={scopingPayload}
                            onActionPrompt={(prompt) => {
                                if (onActionPrompt) {
                                    onActionPrompt(prompt, "scoping");
                                    return;
                                }
                                onSuggestionClick(prompt);
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
                            onDiscuss={() => {
                                const prompt = "Let's discuss these criteria before saving them to the protocol.";
                                if (onActionPrompt) {
                                    onActionPrompt(prompt, "protocol");
                                    return;
                                }
                                onSuggestionClick(prompt);
                            }}
                            onSave={() => handleReview("accepted")}
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
                            onEditAndAccept={(edited) => handleReview("accepted", undefined, edited as unknown as Record<string, unknown>)}
                        />
                    </ArtifactWrapper>
                );

            case "memory_forget_proposal":
                return (
                    <ArtifactWrapper
                        {...wrapperProps}
                        summaryText={`Forget: ${(item.payload as MemoryForgetProposalPayload)?.key ?? "memory"}`}
                    >
                        <MemoryForgetCard
                            payload={item.payload as MemoryForgetProposalPayload}
                            onAccept={() => handleReview("accepted")}
                            onReject={() => handleReview("rejected")}
                        />
                    </ArtifactWrapper>
                );

            default:
                return (
                    <ArtifactWrapper {...wrapperProps} summaryText={item.title}>
                        <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12 }}>
                            <span className="material-icons-round" style={{ fontSize: 22, color: "var(--text-muted)", flexShrink: 0 }}>
                                pending_actions
                            </span>
                            <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>
                                    {item.title}
                                </div>
                                <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}>
                                    This artifact type is not yet supported in the UI.
                                </div>
                            </div>
                        </div>
                    </ArtifactWrapper>
                );
        }
    };

    // Streaming cursor: which assistant message is actively receiving tokens
    const lastAssistantIndex = timeline.length > 0 && timeline[timeline.length - 1].type === "assistant_message"
        ? timeline.length - 1
        : -1;
    const isStreaming = isLoading && lastAssistantIndex >= 0;

    const renderTimelineItem = (item: TimelineItem, index: number) => {
        switch (item.type) {
            case "user_message":
                return <UserMessageRow key={item.id} item={item} onCopy={handleCopy} onBranchFromMessage={onBranchFromMessage} />;

            case "assistant_message":
                return (
                    <AssistantMessageRow
                        key={item.id}
                        item={item}
                        projectId={projectId}
                        isStreaming={isStreaming && index === lastAssistantIndex}
                        isSaved={savedNoteId === item.id}
                        isSaving={savingNoteId === item.id}
                        onCopy={handleCopy}
                        onSaveToNotes={onSaveToNotes ? handleSaveToNotes : undefined}
                        onInsert={onInsert}
                        onBranchFromMessage={onBranchFromMessage}
                    />
                );

            case "artifact":
                return (
                    <div key={item.id} className={styles.chatMsg}>
                        <ArtifactErrorBoundary>
                            {renderArtifactContent(item)}
                        </ArtifactErrorBoundary>
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
                        {item.retryable && onRetryLastMessage && (
                            <button type="button" className={artifactStyles.errorRetryBtn} onClick={onRetryLastMessage}>
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
        <div className={`${styles.copilotBody} ${variant === "page" ? styles.pageLayout : ""}`} ref={containerRef} onScroll={onScroll}>
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
                {/* Bottom sentinel — scroll anchor */}
                <div ref={bottomRef} style={{ height: 1, flexShrink: 0 }} aria-hidden="true" />
            </div>
            <button
                type="button"
                className={`${styles.scrollFab} ${isPinned ? styles.scrollFabHidden : ""}`}
                onClick={scrollToBottom}
                aria-label="Scroll to bottom"
                tabIndex={isPinned ? -1 : 0}
            >
                <span className="material-icons-round">keyboard_arrow_down</span>
            </button>
        </div>
    );
}
