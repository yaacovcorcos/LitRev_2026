/**
 * TimelineRenderer
 * Renders the conversation timeline: messages, artifacts, progress, checkpoints, errors.
 * Supports both legacy CopilotMessage[] and new TimelineItem[] inputs.
 * (planC Phase 0.6 + Phase 1)
 */

"use client";

import { Component, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStableChatScroll } from "@/hooks/useStableChatScroll";
import { useStreamStartNotification } from "@/hooks/useStreamStartNotification";
import { useTimelineWindowing } from "@/hooks/useTimelineWindowing";
import type { ErrorInfo, ReactNode } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "@/components/markdown/CodeBlock";
import type { CopilotMessage } from "@/lib/projectCopilotStorage";
import type { TimelineAttachment, TimelineArtifact, TimelineContextAttachment, TimelineItem } from "@/types/timeline";
import type { CopilotPage, ReasoningMode } from "@/types/ai";
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
import { ArtifactWrapper } from "@/components/artifacts/ArtifactWrapper";
import { PlanCard } from "@/components/artifacts/PlanCard";
import { StudyCard } from "@/components/artifacts/StudyCard";
import { StudyUpdateCard } from "@/components/artifacts/StudyUpdateCard";
import { ScreeningBatch } from "@/components/artifacts/ScreeningBatch";
import { ProtocolEditCard } from "@/components/artifacts/ProtocolEditCard";
import { CriteriaCard } from "@/components/artifacts/CriteriaCard";
import { DraftBlock } from "@/components/artifacts/DraftBlock";
import { MemoryCard } from "@/components/artifacts/MemoryCard";
import { MemoryForgetCard } from "@/components/artifacts/MemoryForgetCard";
import { ScopingReportCard } from "@/components/artifacts/ScopingReportCard";
import { UserInputCard } from "@/components/artifacts/UserInputCard";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StreamingProgress } from "./StreamingProgress";
import { addMentionedStudyAction } from "@/app/actions/ledger";
import { type MentionedStudy } from "@/lib/ai/mentioned-studies";
import { normalizeAssistantContent } from "@/lib/ai/normalize-assistant-content";
import { useMentionedStudyTitles } from "@/lib/ai/use-mentioned-study-titles";
import { isChatStudyMentionsEnabled } from "@/lib/agent/feature-flags";
import { getReasoningSummaryPreview } from "@/lib/ai/reasoning-visibility";
import { getContextTargetKey } from "@/lib/context-capture/targets";
import { buildExecutionTraceEntries, type ExecutionTraceEntry } from "./execution-trace-grouping";
import { isArtifactReviewable } from "@/lib/artifacts/reviewability";
import { getArtifactInlineActionModel, type ArtifactInlineActionDescriptor } from "@/lib/artifacts/inline-actions";
import styles from "./TimelineMessages.module.css";
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
                <div style={{ padding: "10px 12px", borderRadius: 10, border: "1px solid var(--glass-border)", background: "rgba(var(--rgb-color-danger), 0.06)", color: "var(--color-danger)", fontSize: 13 }}>
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

const TOOL_ACTIVITY_META: Record<"queued" | "running" | "done" | "failed" | "interrupted", { icon: string; label: string }> = {
    queued: { icon: "schedule", label: "Queued" },
    running: { icon: "sync", label: "Running" },
    done: { icon: "check_circle", label: "Done" },
    failed: { icon: "error", label: "Failed" },
    interrupted: { icon: "wifi_off", label: "Interrupted" },
};

type TimelineToolActivityItem = Extract<TimelineItem, { type: "tool_activity" }>;
type TimelineErrorItem = Extract<TimelineItem, { type: "error" }>;

type ArtifactConfirmationState = {
    artifactId: string;
    descriptor: ArtifactInlineActionDescriptor;
    title: string;
    message: string;
    confirmLabel: string;
    variant: "danger" | "default";
    onConfirm: () => Promise<void>;
} | null;

type PresentedTimelineItem =
    | { kind: "single"; item: TimelineItem }
    | { kind: "pubmed_sequence"; id: string; items: TimelineToolActivityItem[] };

function parseTimestampMs(value?: string): number | null {
    if (!value) return null;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function formatDurationMs(durationMs: number): string {
    if (durationMs < 1000) return `${durationMs}ms`;
    if (durationMs < 10_000) return `${(durationMs / 1000).toFixed(1)}s`;
    if (durationMs < 60_000) return `${Math.round(durationMs / 1000)}s`;
    const minutes = Math.floor(durationMs / 60_000);
    const seconds = Math.round((durationMs % 60_000) / 1000);
    return `${minutes}m ${seconds}s`;
}

function getToolActivityTimingText(item: Extract<TimelineItem, { type: "tool_activity" }>): string {
    const started = parseTimestampMs(item.startedAt);
    const completed = parseTimestampMs(item.completedAt);

    if (item.status === "running") return "In progress";
    if (item.status === "done" && started !== null && completed !== null && completed >= started) {
        return `Completed in ${formatDurationMs(completed - started)}`;
    }
    if (item.status === "failed" && started !== null && completed !== null && completed >= started) {
        return `Failed after ${formatDurationMs(completed - started)}`;
    }
    if (item.status === "done") return "Completed";
    if (item.status === "failed") return "Failed";
    return "Pending";
}

function getToolActivityDisplayName(item: TimelineToolActivityItem): string {
    if (item.displayLabel?.trim()) return item.displayLabel.trim();
    if (item.toolName === "search_pubmed") return "PubMed";
    if (item.toolName === "search_openalex") return "OpenAlex";
    if (item.toolName === "search_semantic_scholar") return "Semantic Scholar";
    return item.toolName;
}

function getToolActivityInputPreview(item: TimelineToolActivityItem): string | null {
    const inputPreview = item.inputPreview?.trim();
    if (inputPreview) return inputPreview;
    const queryPreview = item.queryPreview?.trim();
    return queryPreview || null;
}

function getToolActivityOutcomeSummary(item: TimelineToolActivityItem): string | null {
    const outcomeSummary = item.outcomeSummary?.trim();
    if (outcomeSummary) return outcomeSummary;
    const summary = item.summary?.trim();
    return summary || null;
}

function getToolActivityDetailItems(item: TimelineToolActivityItem): string[] {
    const detailItems = (item.detailItems ?? []).map((value) => value.trim()).filter(Boolean);
    if (detailItems.length > 0) return detailItems;

    const fallback: string[] = [];
    const resultCountText = getSearchResultCountText(item);
    const identifierText = getSearchIdentifierText(item);
    if (resultCountText) fallback.push(resultCountText);
    if (identifierText) fallback.push(identifierText);
    return fallback;
}

function isSearchReceipt(item: TimelineToolActivityItem): boolean {
    return item.toolName === "search_pubmed"
        || item.toolName === "search_openalex"
        || item.toolName === "search_semantic_scholar";
}

function getSearchResultCountText(item: TimelineToolActivityItem): string | null {
    if (!isSearchReceipt(item)) return null;
    if (typeof item.returnedCount === "number" && typeof item.totalResults === "number") {
        return `${item.returnedCount} of ${item.totalResults} results`;
    }
    if (typeof item.returnedCount === "number") {
        return `${item.returnedCount} results`;
    }
    if (typeof item.totalResults === "number") {
        return `${item.totalResults} results`;
    }
    return null;
}

function getSearchIdentifierText(item: TimelineToolActivityItem): string | null {
    if (!item.resultIdentifiers || item.resultIdentifiers.length === 0) return null;
    return item.resultIdentifiers.join(" · ");
}

function getPubMedSearchSize(item: TimelineToolActivityItem): number | null {
    if (typeof item.totalResults === "number") return item.totalResults;
    if (typeof item.returnedCount === "number") return item.returnedCount;
    return null;
}

function normalizePubMedQueryPreview(value?: string): string | null {
    const normalized = value?.replace(/\s+/g, " ").trim().toLowerCase();
    return normalized ? normalized : null;
}

function derivePubMedSequenceAnnotation(items: TimelineToolActivityItem[]): string | null {
    if (items.length < 2) return null;

    const comparableQueries = items
        .map((item) => normalizePubMedQueryPreview(item.queryPreview))
        .filter((query): query is string => !!query);
    const queryChanged = new Set(comparableQueries).size > 1;
    const sizedItems = items
        .map((item) => ({ item, size: getPubMedSearchSize(item) }))
        .filter((entry): entry is { item: TimelineToolActivityItem; size: number } => entry.size !== null);

    if (!queryChanged && sizedItems.length < 2) return null;

    const firstSize = sizedItems[0]?.size ?? null;
    const lastSize = sizedItems[sizedItems.length - 1]?.size ?? null;

    if (queryChanged && lastSize !== null && lastSize <= 2) {
        return "The latest search may be too narrow and may need broader terms.";
    }

    if (queryChanged && firstSize !== null && lastSize !== null) {
        if (lastSize < firstSize) {
            return "The search is narrowing toward a smaller result set.";
        }
        if (lastSize > firstSize) {
            return "The search is broadening to explore a larger result set.";
        }
        if (lastSize >= 25) {
            return "The search is still broad and is being refined further.";
        }
    }

    if (queryChanged && comparableQueries.length >= 2) {
        return "Multiple PubMed searches were used to refine the result set.";
    }

    return null;
}

function getArtifactConfirmationContent(
    descriptor: ArtifactInlineActionDescriptor,
    item: TimelineArtifact,
): { title: string; message: string; confirmLabel: string; variant: "danger" | "default" } {
    switch (descriptor.class) {
        case "undo":
            return {
                title: "Undo applied change?",
                message: `This will revert the applied changes for "${item.title}".`,
                confirmLabel: "Undo",
                variant: "danger",
            };
        case "review_resolution":
            switch (descriptor.kind) {
                case "exclude":
                    return {
                        title: "Exclude study?",
                        message: `This will mark "${item.title}" as excluded.`,
                        confirmLabel: "Exclude",
                        variant: "danger",
                    };
                case "reject":
                    return {
                        title: "Reject proposal?",
                        message: `This will reject "${item.title}" and remove it from the pending review set.`,
                        confirmLabel: "Reject",
                        variant: "danger",
                    };
                case "dismiss":
                    return {
                        title: "Dismiss proposal?",
                        message: `This will dismiss "${item.title}" without applying it.`,
                        confirmLabel: "Dismiss",
                        variant: "danger",
                    };
                case "archive":
                    return {
                        title: "Archive memory?",
                        message: `This will archive the memory changes proposed in "${item.title}".`,
                        confirmLabel: "Archive",
                        variant: "danger",
                    };
                default:
                    return {
                        title: "Confirm action?",
                        message: `Apply this action to "${item.title}"?`,
                        confirmLabel: "Confirm",
                        variant: "default",
                    };
            }
        default:
            return {
                title: "Confirm action?",
                message: `Apply this action to "${item.title}"?`,
                confirmLabel: "Confirm",
                variant: "default",
            };
    }
}

function buildPresentedTimeline(items: TimelineItem[]): PresentedTimelineItem[] {
    const presented: PresentedTimelineItem[] = [];

    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (item?.type !== "tool_activity" || item.toolName !== "search_pubmed") {
            presented.push({ kind: "single", item });
            continue;
        }

        const group: TimelineToolActivityItem[] = [item];
        let cursor = index + 1;
        while (cursor < items.length) {
            const candidate = items[cursor];
            if (candidate?.type !== "tool_activity" || candidate.toolName !== "search_pubmed") break;
            group.push(candidate);
            cursor += 1;
        }

        if (group.length === 1) {
            presented.push({ kind: "single", item });
        } else {
            presented.push({
                kind: "pubmed_sequence",
                id: `pubmed-sequence-${group[0]?.id}-${group[group.length - 1]?.id}`,
                items: group,
            });
        }

        index = cursor - 1;
    }

    return presented;
}

function getPubMedSequenceStatus(items: TimelineToolActivityItem[]): keyof typeof TOOL_ACTIVITY_META {
    if (items.some((item) => item.status === "failed")) return "failed";
    if (items.some((item) => item.status === "running")) return "running";
    if (items.every((item) => item.status === "done")) return "done";
    return "queued";
}

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
const CHAT_STUDY_MENTIONS_ENABLED = isChatStudyMentionsEnabled();

function isContextTimelineAttachment(
    attachment: TimelineAttachment,
): attachment is TimelineContextAttachment {
    return "type" in attachment && attachment.type === "context_capture";
}

const UserMessageRow = memo(function UserMessageRow({ item, onCopy, onBranchFromMessage }: UserMessageRowProps) {
    return (
        <div className={`${styles.chatMsg} ${styles.chatMsgUser}`} role="article" aria-label="You">
            <div className={styles.chatStack}>
                <div className={styles.chatBubble}>
                    {item.attachments && item.attachments.length > 0 && (
                        <div className={styles.messageAttachments}>
                            {item.attachments.map((att) => (
                                isContextTimelineAttachment(att) ? (
                                    <div key={getContextTargetKey(att.target)} className={`${styles.messageAttachment} ${styles.contextAttachment}`}>
                                        <span className="material-icons-round" style={{ fontSize: 14 }}>{att.target.icon}</span>
                                        <span className={styles.messageAttachmentName}>{att.target.label}</span>
                                        {att.target.preview ? (
                                            <span className={styles.contextAttachmentPreview}>{att.target.preview}</span>
                                        ) : null}
                                    </div>
                                ) : (
                                    <div key={att.fileAssetId ?? att.filename} className={styles.messageAttachment}>
                                        <span className="material-icons-round" style={{ fontSize: 14 }}>description</span>
                                        <span className={styles.messageAttachmentName}>{att.filename}</span>
                                        <span className={styles.messageAttachmentSize}>
                                            {att.size >= 1024 * 1024
                                                ? `${(att.size / (1024 * 1024)).toFixed(1)} MB`
                                                : `${Math.round(att.size / 1024)} KB`}
                                        </span>
                                    </div>
                                )
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
                        aria-label="Copy to clipboard"
                        title="Copy to clipboard"
                    >
                        <span className="material-icons-round">content_copy</span>
                    </button>
                    {onBranchFromMessage && (
                        <button
                            type="button"
                            className={styles.chatActionBtn}
                            onClick={() => onBranchFromMessage(item.id, item.createdAt)}
                            aria-label="Branch from this message"
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
    reasoningMode: ReasoningMode;
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

function mentionDisplayTitle(study: MentionedStudy, hydratedTitle?: string): string {
    if (study.title) return study.title;
    if (hydratedTitle) return hydratedTitle;
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
    reasoningMode,
    isStreaming,
    isSaved,
    isSaving,
    onCopy,
    onSaveToNotes,
    onInsert,
    onBranchFromMessage,
}: AssistantMessageRowProps) {
    const normalizedContent = useMemo(() => normalizeAssistantContent(item.content), [item.content]);
    const displayContent = normalizedContent.displayContent;
    const rawReasoningText = item.reasoning?.text?.trim() ?? "";
    const hasReasoning = rawReasoningText.length > 0;
    const showReasoningArea = hasReasoning && reasoningMode !== "off" && Boolean(displayContent);
    const isSummaryMode = reasoningMode === "summary";
    const isReserved = item.deliveryState === "reserved" && !displayContent;
    const summaryPreview = getReasoningSummaryPreview(rawReasoningText);
    const [showFullSummary, setShowFullSummary] = useState(false);
    const reasoningText = isSummaryMode && showFullSummary
        ? rawReasoningText
        : summaryPreview.text;
    const isReasoningStreaming = item.reasoning?.state === "streaming";
    const mentions = CHAT_STUDY_MENTIONS_ENABLED ? normalizedContent.mentionedStudies : [];
    const hydratedMentionTitles = useMentionedStudyTitles(mentions);
    const [mentionStates, setMentionStates] = useState<Record<string, MentionAddState>>({});
    const [showReasoning, setShowReasoning] = useState(false);

    const reasoningStateLabel = isReasoningStreaming
        ? "Live"
        : item.reasoning?.truncated
            ? "Truncated"
            : undefined;

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
                    {showReasoningArea && (
                        <div className={styles.reasoningWrap}>
                            <button
                                type="button"
                                className={styles.reasoningToggle}
                                onClick={() => setShowReasoning((prev) => !prev)}
                                aria-expanded={showReasoning}
                            >
                                <span className="material-icons-round" aria-hidden="true">
                                    {showReasoning ? "expand_more" : "chevron_right"}
                                </span>
                                <span>
                                    {isReasoningStreaming
                                        ? "Thinking"
                                        : isSummaryMode
                                            ? "Reasoning (summary)"
                                            : "Reasoning"}
                                </span>
                                {reasoningStateLabel ? (
                                    <span className={styles.reasoningState}>{reasoningStateLabel}</span>
                                ) : null}
                            </button>
                            {showReasoning && (
                                <div className={styles.reasoningPanel}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                        {reasoningText}
                                    </ReactMarkdown>
                                    {item.reasoning?.truncated && (
                                        <div className={styles.reasoningTruncatedNote}>
                                            Thinking output truncated for safety.
                                        </div>
                                    )}
                                    {isSummaryMode && summaryPreview.truncated && (
                                        <button
                                            type="button"
                                            className={styles.reasoningExpandBtn}
                                            onClick={() => setShowFullSummary((prev) => !prev)}
                                        >
                                            {showFullSummary ? "Show less" : "Show full"}
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    <div className={markdownStyles.markdownContent}>
                        {displayContent ? (
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                                {displayContent}
                            </ReactMarkdown>
                        ) : (
                            isReserved ? (
                                <span className={styles.assistantReservedState} aria-label="Assistant preparing a reply">
                                    <span className={styles.assistantReservedLabel}>Preparing answer</span>
                                    <span className={styles.assistantReservedDots} aria-hidden="true">
                                        <span className={styles.loadingDot} />
                                        <span className={styles.loadingDot} />
                                        <span className={styles.loadingDot} />
                                    </span>
                                </span>
                            ) : isReasoningStreaming ? (
                                <span className={styles.reasoningPlaceholder}>Thinking...</span>
                            ) : null
                        )}
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
                                const displayTitle = mentionDisplayTitle(study, hydratedMentionTitles[study.key]);
                                return (
                                    <div key={study.key} className={styles.mentionedStudyChip}>
                                        <span className={styles.mentionedStudyTitle}>{displayTitle}</span>
                                        {study.year && <span className={styles.mentionedStudyYear}>{study.year}</span>}
                                        {study.sourceUrl && (
                                            <a
                                                href={study.sourceUrl}
                                                target="_blank"
                                                rel="noreferrer"
                                                className={styles.mentionedStudyLink}
                                                aria-label={`Open source for ${displayTitle}`}
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
                        aria-label="Copy to clipboard"
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
                                aria-label="Save to notes"
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
                            aria-label="Insert into draft"
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
                            aria-label="Branch from this message"
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
        suggestions: { label: string; prompt: string; icon?: string; description?: string }[];
    };
    onSuggestionClick: (prompt: string) => void;
    /** Callback for one-click action prompts from artifact cards (e.g., scoping decision actions). */
    onActionPrompt?: (prompt: string, mode?: AgentMode) => void;
    /** Callback when user reviews an artifact (accept/reject). editedPayload is set when user edits before accepting. */
    onReviewArtifact?: (artifactId: string, status: "accepted" | "rejected", note?: string, editedPayload?: Record<string, unknown>) => void;
    /** Callback when user undoes a supported applied artifact. */
    onUndoArtifact?: (artifactId: string) => void | Promise<void>;
    /** Callback when user clicks Run on a plan artifact with selected step indexes. */
    onExecutePlan?: (artifactId: string, selectedIndexes: number[]) => void;
    /** Callback to save a message to notes */
    onSaveToNotes?: (content: string, messageId: string) => void | Promise<void>;
    /** Optional retry callback for retryable error cards */
    onRetryLastMessage?: () => void;
    /** Optional reconnect callback for recovery-aware active runs. */
    onReconnectRun?: (item: TimelineErrorItem) => void;
    /** Optional continuation callback for proven durable recovery state. */
    onContinueFromDurableStateRun?: (item: TimelineErrorItem) => void;
    /** Optional explicit replacement callback for live runs that should be replaced. */
    onStopAndRetryRun?: (item: TimelineErrorItem) => void;
    /** Optional resume callback for recoverable plan-run errors */
    onResumeRun?: () => void;
    /** Optional callback to branch conversation history up to a specific message */
    onBranchFromMessage?: (messageId: string, createdAt: string) => void | Promise<void>;
    /** Layout variant: "panel" for copilot sidebar (bubbles), "page" for conversation mode (full-width) */
    variant?: "panel" | "page";
    /** Global reasoning visibility mode */
    reasoningMode?: ReasoningMode;
    /** When true (conversation being fetched), show a shimmer skeleton instead of the empty state */
    isConversationLoading?: boolean;
    /** Stable ID of the active conversation — used to reset scroll state on switch */
    conversationId?: string;
    /** Optional explicit project ID override (used in /ai route where useParams has no project id). */
    projectId?: string;
    /** Callback when user answers a structured ask_user question */
    onAnswerUserInput?: (callId: string, answer: string, page?: CopilotPage, section?: string) => void;
    /** Whether older messages are available to load */
    hasMore?: boolean;
    /** Whether older messages are currently loading */
    isLoadingOlder?: boolean;
    /** Callback to load older messages */
    onLoadOlder?: () => Promise<void>;
    /** Exposes the scroll container element to parent layout surfaces. */
    onContainerElementChange?: (node: HTMLDivElement | null) => void;
    /** Optional client-side windowing for long timelines. Defaults to rendering all items. */
    initialVisibleCount?: number;
    /** Number of hidden items to reveal per click when client-side windowing is enabled. */
    visibleStep?: number;
    /** Route-local readiness callback once the currently visible timeline settles. */
    onTimelineReady?: (details: { visibleItems: number; hiddenItems: number; totalItems: number }) => void;
    /** Render-only suppression for a single progress row elevated above the composer. */
    suppressedProgressId?: string | null;
};

export function TimelineRenderer(props: TimelineRendererProps) {
    return (
        <TimelineRendererInner
            key={props.conversationId ?? "__timeline-no-conversation__"}
            {...props}
        />
    );
}

function TimelineRendererInner({
    messages = [],
    items,
    isLoading,
    onInsert,
    emptyState,
    onSuggestionClick,
    onActionPrompt,
    onReviewArtifact,
    onUndoArtifact,
    onExecutePlan,
    onSaveToNotes,
    onRetryLastMessage,
    onReconnectRun,
    onContinueFromDurableStateRun,
    onStopAndRetryRun,
    onResumeRun,
    onBranchFromMessage,
    variant = "panel",
    reasoningMode = "full",
    isConversationLoading = false,
    conversationId,
    projectId: projectIdProp,
    onAnswerUserInput,
    hasMore,
    isLoadingOlder,
    onLoadOlder,
    onContainerElementChange,
    initialVisibleCount,
    visibleStep = 60,
    onTimelineReady,
    suppressedProgressId = null,
}: TimelineRendererProps) {
    const params = useParams();
    const routeProjectId = params && typeof params === "object" && "id" in params
        ? String((params as Record<string, unknown>).id)
        : undefined;
    const projectId = projectIdProp ?? routeProjectId;
    const [savedNoteId, setSavedNoteId] = useState<string | null>(null);
    const [savingNoteId, setSavingNoteId] = useState<string | null>(null);
    const [collapsedTraceByAssistantId, setCollapsedTraceByAssistantId] = useState<Record<string, boolean>>({});
    const [pendingArtifactMutation, setPendingArtifactMutation] = useState<{ artifactId: string; actionKey: string } | null>(null);
    const [confirmationState, setConfirmationState] = useState<ArtifactConfirmationState>(null);

    // ── Shared scroll hook ──────────────────────────────────────────────────
    const {
        containerRef, bottomRef, onScroll, isPinned, scrollToBottom,
        notifyStreamStart, notifyConversationChanged, notifyContentChanged,
        capturePrependAnchor, restorePrependAnchor,
    } = useStableChatScroll();

    const setContainerRef = useCallback((node: HTMLDivElement | null) => {
        containerRef(node);
        onContainerElementChange?.(node);
    }, [containerRef, onContainerElementChange]);

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

    useStreamStartNotification(isLoading, notifyStreamStart);

    const firstItemRef = useRef<HTMLDivElement | null>(null);
    const {
        effectiveVisibleCount,
        hiddenItemCount,
        visibleItems: visibleTimeline,
        visibleFirstItemId: visibleFirstTimelineId,
        handleLoadOlder,
        handleRevealEarlier,
    } = useTimelineWindowing({
        items: timeline,
        initialVisibleCount,
        visibleStep,
        onLoadOlder,
        capturePrependAnchor,
        restorePrependAnchor,
        firstItemRef,
        getItemId: (item) => item?.id ?? null,
    });
    const lastAssistantIndex = visibleTimeline.length > 0 && visibleTimeline[visibleTimeline.length - 1].type === "assistant_message"
        ? visibleTimeline.length - 1
        : -1;
    const isStreaming = isLoading && lastAssistantIndex >= 0;
    const streamingAssistantMessageId = isStreaming
        ? visibleTimeline[lastAssistantIndex]?.id ?? null
        : null;
    const renderEntries = useMemo(
        () => buildExecutionTraceEntries(visibleTimeline, { streamingAssistantMessageId }),
        [streamingAssistantMessageId, visibleTimeline],
    );
    const toggleCollapsedTrace = useCallback((assistantMessageId: string) => {
        setCollapsedTraceByAssistantId((prev) => ({
            ...prev,
            [assistantMessageId]: !(prev[assistantMessageId] ?? true),
        }));
    }, []);
    const [expandedSequenceIds, setExpandedSequenceIds] = useState<Record<string, boolean>>({});
    const toggleSequenceExpanded = useCallback((sequenceId: string) => {
        setExpandedSequenceIds((prev) => ({
            ...prev,
            [sequenceId]: !prev[sequenceId],
        }));
    }, []);
    // ── Content change — schedule scroll if pinned ──────────────────────────
    useLayoutEffect(() => { notifyContentChanged(); }, [notifyContentChanged, timeline, visibleFirstTimelineId, effectiveVisibleCount]);

    useEffect(() => {
        if (!onTimelineReady) return;
        if (isConversationLoading) return;
        onTimelineReady({
            visibleItems: visibleTimeline.length,
            hiddenItems: hiddenItemCount,
            totalItems: timeline.length,
        });
    }, [hiddenItemCount, isConversationLoading, onTimelineReady, timeline.length, visibleTimeline.length]);

    const handleCopy = useCallback(async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
        } catch (error) {
            console.error("Failed to copy timeline item", error);
        }
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

    const executeArtifactMutation = useCallback(async (
        artifactId: string,
        actionKey: string,
        execute: () => void | Promise<void>,
    ) => {
        if (pendingArtifactMutation) return;
        setPendingArtifactMutation({ artifactId, actionKey });
        try {
            await execute();
        } finally {
            setPendingArtifactMutation((current) =>
                current?.artifactId === artifactId && current.actionKey === actionKey ? null : current,
            );
        }
    }, [pendingArtifactMutation]);

    const requestArtifactConfirmation = useCallback((
        item: TimelineArtifact,
        descriptor: ArtifactInlineActionDescriptor,
        onConfirm: () => Promise<void>,
    ) => {
        const confirmation = getArtifactConfirmationContent(descriptor, item);
        setConfirmationState({
            artifactId: item.artifactId,
            descriptor,
            title: confirmation.title,
            message: confirmation.message,
            confirmLabel: confirmation.confirmLabel,
            variant: confirmation.variant,
            onConfirm,
        });
    }, []);

    const renderArtifactContent = (item: TimelineArtifact) => {
        const actionModel = getArtifactInlineActionModel(item.artifactType, item.status);
        const actionMap = new Map(actionModel.actions.map((action) => [action.key, action] as const));
        const isMutationBusy = pendingArtifactMutation !== null;
        const activeMutationForCard = pendingArtifactMutation?.artifactId === item.artifactId ? pendingArtifactMutation : null;
        const canRunArtifactActions = !isLoading && !isConversationLoading && !isMutationBusy;
        const getActionDescriptor = (key: string): ArtifactInlineActionDescriptor | null => actionMap.get(key) ?? null;

        const runReview = (
            descriptor: ArtifactInlineActionDescriptor,
            status: "accepted" | "rejected",
            note?: string,
            editedPayload?: Record<string, unknown>,
        ) => {
            if (!onReviewArtifact) return;
            const execute = () => executeArtifactMutation(item.artifactId, descriptor.key, () =>
                onReviewArtifact(item.artifactId, status, note, editedPayload),
            );
            if (descriptor.requiresConfirmation) {
                requestArtifactConfirmation(item, descriptor, execute);
                return;
            }
            void execute();
        };

        const runUndo = (descriptor: Extract<ArtifactInlineActionDescriptor, { class: "undo" }>) => {
            if (!onUndoArtifact) return;
            const execute = () => executeArtifactMutation(item.artifactId, descriptor.key, () =>
                onUndoArtifact(item.artifactId),
            );
            if (descriptor.requiresConfirmation) {
                requestArtifactConfirmation(item, descriptor, execute);
                return;
            }
            void execute();
        };

        const handleReview = (
            descriptor: ArtifactInlineActionDescriptor,
            status: "accepted" | "rejected",
            note?: string,
            editedPayload?: Record<string, unknown>,
        ) => runReview(descriptor, status, note, editedPayload);

        const jumpTo = projectId ? getJumpToProps(item.artifactType, projectId) : {};
        const isReviewable = actionModel.isReviewable;
        const canReview = canRunArtifactActions && isReviewable;

        const wrapperProps = {
            artifactId: item.artifactId,
            artifactType: item.artifactType,
            status: item.status,
            title: item.title,
            version: item.version,
            onReview: () => undefined,
            ...jumpTo,
            settledLabel: actionModel.settled.label,
            settledAction: actionModel.settled.undoAction && onUndoArtifact ? {
                label: "Undo",
                onClick: () => runUndo(actionModel.settled.undoAction!),
                pending: activeMutationForCard?.actionKey === actionModel.settled.undoAction.key,
                disabled: isMutationBusy,
            } : null,
        };

        switch (item.artifactType) {
            case "plan": {
                const planPayload = item.payload as PlanPayload;
                const canExecutePlan = !!onExecutePlan && canRunArtifactActions && Boolean(planPayload.execution);
                return (
                    <ArtifactWrapper
                        {...wrapperProps}
                        summaryText={`Plan executed: ${planPayload?.steps?.length ?? 0} steps`}
                    >
                        <PlanCard
                            payload={planPayload}
                            status={item.status}
                            onRun={canExecutePlan ? (selectedIndexes) => onExecutePlan(item.artifactId, selectedIndexes) : undefined}
                            onCancel={() => {
                                const descriptor = getActionDescriptor("reject");
                                if (descriptor) handleReview(descriptor, "rejected");
                            }}
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
                            status={item.status}
                            onKeep={() => {
                                const descriptor = getActionDescriptor("keep");
                                if (descriptor) handleReview(descriptor, isExclusion ? "rejected" : "accepted");
                            }}
                            onExclude={(reason) => {
                                const descriptor = getActionDescriptor("exclude");
                                if (descriptor) handleReview(descriptor, isExclusion ? "accepted" : "rejected", reason);
                            }}
                            canAct={canReview}
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
                            status={item.status}
                            onAccept={() => {
                                const descriptor = getActionDescriptor("apply");
                                if (descriptor) handleReview(descriptor, "accepted");
                            }}
                            onReject={() => {
                                const descriptor = getActionDescriptor("reject");
                                if (descriptor) handleReview(descriptor, "rejected");
                            }}
                            canAct={canReview}
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
                            status={item.status}
                            onAcceptAll={() => {
                                const descriptor = getActionDescriptor("apply");
                                if (descriptor) handleReview(descriptor, "accepted");
                            }}
                            canAct={canReview}
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
                            status={item.status}
                            onDiscuss={() => {
                                const prompt = `Let's discuss the proposed protocol update to "${protocolPayload?.field ?? "this field"}" before applying it.`;
                                if (onActionPrompt) {
                                    onActionPrompt(prompt, "protocol");
                                    return;
                                }
                                onSuggestionClick(prompt);
                            }}
                            onAccept={(editedValue) => {
                                const descriptor = getActionDescriptor("apply");
                                if (!descriptor) return;
                                if (editedValue !== undefined) {
                                    handleReview(descriptor, "accepted", undefined, {
                                        ...protocolPayload,
                                        value: editedValue,
                                    });
                                } else {
                                    handleReview(descriptor, "accepted");
                                }
                            }}
                            canAct={canReview}
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
                            canAct={canRunArtifactActions}
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
                            status={item.status}
                            onDiscuss={() => {
                                const prompt = "Let's discuss these criteria before saving them to the protocol.";
                                if (onActionPrompt) {
                                    onActionPrompt(prompt, "protocol");
                                    return;
                                }
                                onSuggestionClick(prompt);
                            }}
                            onSave={() => {
                                const descriptor = getActionDescriptor("apply");
                                if (descriptor) handleReview(descriptor, "accepted");
                            }}
                            canAct={canReview}
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
                            status={item.status}
                            onAccept={() => {
                                const descriptor = getActionDescriptor("apply");
                                if (descriptor) handleReview(descriptor, "accepted");
                            }}
                            canAct={canReview}
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
                            status={item.status}
                            onAccept={() => {
                                const descriptor = getActionDescriptor("remember");
                                if (descriptor) handleReview(descriptor, "accepted");
                            }}
                            onReject={() => {
                                const descriptor = getActionDescriptor("dismiss");
                                if (descriptor) handleReview(descriptor, "rejected");
                            }}
                            onEditAndAccept={(edited) => {
                                const descriptor = getActionDescriptor("remember");
                                if (descriptor) handleReview(descriptor, "accepted", undefined, edited as unknown as Record<string, unknown>);
                            }}
                            canAct={canReview}
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
                            status={item.status}
                            onAccept={() => {
                                const descriptor = getActionDescriptor("archive");
                                if (descriptor) handleReview(descriptor, "accepted");
                            }}
                            onReject={() => {
                                const descriptor = getActionDescriptor("dismiss");
                                if (descriptor) handleReview(descriptor, "rejected");
                            }}
                            canAct={canReview}
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

    const renderCheckpoint = (item: Extract<TimelineItem, { type: "checkpoint" }>, options?: { grouped?: boolean }) => {
        if (options?.grouped) {
            return (
                <div key={item.id} className={styles.groupedCheckpoint}>
                    <span className={styles.groupedCheckpointLabel}>{item.label}</span>
                </div>
            );
        }

        return (
            <div key={item.id} className={artifactStyles.checkpoint}>
                <div className={artifactStyles.checkpointLine} />
                <span className={artifactStyles.checkpointLabel}>{item.label}</span>
                <div className={artifactStyles.checkpointLine} />
            </div>
        );
    };

    const renderTimelineItem = (item: TimelineItem, index: number, options?: { grouped?: boolean }) => {
        switch (item.type) {
            case "user_message":
                return <UserMessageRow key={item.id} item={item} onCopy={handleCopy} onBranchFromMessage={onBranchFromMessage} />;

            case "assistant_message":
                return (
                    <AssistantMessageRow
                        key={item.id}
                        item={item}
                        projectId={projectId}
                        reasoningMode={reasoningMode}
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

            case "tool_activity": {
                const meta = TOOL_ACTIVITY_META[item.status];
                const timingText = getToolActivityTimingText(item);
                const inputPreview = getToolActivityInputPreview(item);
                const outcomeSummary = getToolActivityOutcomeSummary(item);
                const detailItems = getToolActivityDetailItems(item);
                return (
                    <div
                        key={item.id}
                        className={styles.toolActivityCard}
                        data-status={item.status}
                        role="status"
                        aria-live="polite"
                    >
                        <div className={styles.toolActivityHead}>
                            <span className={`material-icons-round ${styles.toolActivityIcon}`}>
                                {meta.icon}
                            </span>
                            <span className={styles.toolActivityTitle}>{getToolActivityDisplayName(item)}</span>
                            {item.sourceBadge ? <span className={styles.toolActivityBadge}>{item.sourceBadge}</span> : null}
                            <span className={styles.toolActivityState}>{meta.label}</span>
                        </div>
                        <p className={styles.toolActivityMeta}>{timingText}</p>
                        {inputPreview ? <p className={styles.toolActivitySummary}>{inputPreview}</p> : null}
                        {detailItems.length > 0 ? (
                            <div className={styles.toolActivityMetaRow}>
                                {detailItems.map((detail) => (
                                    <span key={detail} className={styles.toolActivityMeta}>{detail}</span>
                                ))}
                            </div>
                        ) : null}
                        {outcomeSummary ? <p className={styles.toolActivitySummary}>{outcomeSummary}</p> : null}
                    </div>
                );
            }

            case "progress":
                if (item.id === suppressedProgressId) {
                    return null;
                }
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
                return renderCheckpoint(item, options);

            case "error": {
                const recommendation = item.errorMeta?.recoveryRecommendation;
                const showReconnect = recommendation === "reconnect" && onReconnectRun;
                const showContinue = (
                    recommendation === "continue_from_durable_state"
                    || recommendation === "continue_from_checkpoint"
                ) && onContinueFromDurableStateRun;
                const showStopAndRetry = recommendation === "stop_and_retry" && onStopAndRetryRun;
                const showRetry = (!recommendation && item.retryable && onRetryLastMessage)
                    || ((recommendation === "retry" || recommendation === "terminal") && onRetryLastMessage);
                const showResume = item.errorMeta?.kind === "plan_execution" && onResumeRun;
                return (
                    <div key={item.id} className={artifactStyles.errorCard}>
                        <span className="material-icons-round">error_outline</span>
                        <span className={artifactStyles.errorMessage}>{item.message}</span>
                        {showRetry && (
                            <button type="button" className={artifactStyles.errorRetryBtn} onClick={onRetryLastMessage}>
                                Retry
                            </button>
                        )}
                        {showReconnect ? (
                            <button type="button" className={artifactStyles.errorRetryBtn} onClick={() => onReconnectRun(item)}>
                                Reconnect
                            </button>
                        ) : null}
                        {showContinue ? (
                            <button type="button" className={artifactStyles.errorRetryBtn} onClick={() => onContinueFromDurableStateRun(item)}>
                                Continue
                            </button>
                        ) : null}
                        {showStopAndRetry ? (
                            <button type="button" className={artifactStyles.errorRetryBtn} onClick={() => onStopAndRetryRun(item)}>
                                Stop & Retry
                            </button>
                        ) : null}
                        {showResume ? (
                            <button type="button" className={artifactStyles.errorRetryBtn} onClick={onResumeRun}>
                                Resume
                            </button>
                        ) : null}
                    </div>
                );
            }

            case "user_input_request":
                return (
                    <UserInputCard
                        key={item.id}
                        question={item.question}
                        questionType={item.questionType}
                        options={item.options}
                        header={item.header}
                        context={item.context}
                        answered={item.answered}
                        answer={item.answer}
                        onAnswer={(answer) => onAnswerUserInput?.(item.callId, answer, item.page, item.section)}
                        onDismiss={() => onAnswerUserInput?.(
                            item.callId,
                            "Dismissed — please proceed without my input.",
                            item.page,
                            item.section
                        )}
                    />
                );

            default:
                return null;
        }
    };

    const renderPresentedTimelineItem = (entry: PresentedTimelineItem, index: number, options?: { grouped?: boolean }) => {
        if (entry.kind === "single") {
            return renderTimelineItem(entry.item, index, options);
        }

        const status = getPubMedSequenceStatus(entry.items);
        const meta = TOOL_ACTIVITY_META[status];
        const expanded = entry.items.length < 3 || !!expandedSequenceIds[entry.id];
        const toggleLabel = expanded ? "Collapse PubMed search sequence" : "Expand PubMed search sequence";
        const sequenceAnnotation = derivePubMedSequenceAnnotation(entry.items);

        return (
            <div
                key={entry.id}
                className={styles.toolActivityCard}
                data-status={status}
                role="status"
                aria-live="polite"
            >
                <button
                    type="button"
                    className={styles.toolSequenceToggle}
                    onClick={() => toggleSequenceExpanded(entry.id)}
                    aria-expanded={expanded}
                    aria-label={toggleLabel}
                >
                    <div className={styles.toolActivityHead}>
                        <span className={`material-icons-round ${styles.toolActivityIcon}`}>
                            {meta.icon}
                        </span>
                        <span className={styles.toolActivityTitle}>PubMed</span>
                        <span className={styles.toolActivityState}>{meta.label}</span>
                    </div>
                    <div className={styles.toolSequenceHeaderMeta}>
                        <span className={styles.toolActivityMeta}>
                            {entry.items.length} {entry.items.length === 1 ? "search" : "searches"}
                        </span>
                        <span className={`material-icons-round ${styles.toolSequenceChevron}`}>
                            {expanded ? "expand_less" : "expand_more"}
                        </span>
                    </div>
                </button>
                {expanded ? (
                    <ol className={styles.toolSequenceList}>
                        {entry.items.map((item, itemIndex) => {
                            const timingText = getToolActivityTimingText(item);
                            const detailItems = getToolActivityDetailItems(item);
                            const outcomeSummary = getToolActivityOutcomeSummary(item);
                            const inputPreview = getToolActivityInputPreview(item);
                            return (
                                <li key={item.id} className={styles.toolSequenceItem}>
                                    <div className={styles.toolSequenceItemHead}>
                                        <span className={styles.toolSequenceIndex}>{itemIndex + 1}.</span>
                                        {inputPreview ? (
                                            <span className={styles.toolSequenceQuery}>{inputPreview}</span>
                                        ) : (
                                            <span className={styles.toolSequenceQueryMuted}>Query unavailable</span>
                                        )}
                                    </div>
                                    <div className={styles.toolSequenceMetaRow}>
                                        {item.sourceBadge ? (
                                            <span className={styles.toolActivityBadge}>{item.sourceBadge}</span>
                                        ) : null}
                                        {detailItems.map((detail) => (
                                            <span key={detail} className={styles.toolActivityMeta}>{detail}</span>
                                        ))}
                                        <span className={styles.toolActivityMeta}>{timingText}</span>
                                    </div>
                                    {outcomeSummary ? (
                                        <p className={styles.toolActivitySummary}>{outcomeSummary}</p>
                                    ) : null}
                                </li>
                            );
                        })}
                    </ol>
                ) : null}
                {sequenceAnnotation ? (
                    <p className={styles.toolSequenceAnnotation}>{sequenceAnnotation}</p>
                ) : null}
            </div>
        );
    };
    const renderExecutionTraceEntry = (entry: Extract<ExecutionTraceEntry, { kind: "execution_trace" }>) => {
        const presentedTraceItems = buildPresentedTimeline(entry.traceItems);
        const collapsed = entry.mode === "anchored"
            ? collapsedTraceByAssistantId[entry.anchorAssistantMessageId ?? ""] ?? entry.defaultCollapsed
            : false;
        const isLiveTrace = entry.mode === "live";
        const canToggleCollapse = entry.mode === "anchored" && entry.canCollapse && !!entry.anchorAssistantMessageId;
        const showLiveBadge = isLiveTrace || (!!entry.assistantMessage && entry.assistantMessage.id === streamingAssistantMessageId);

        return (
            <div key={entry.id} className={styles.executionTraceGroup}>
                {collapsed ? (
                    <button
                        type="button"
                        className={styles.executionTraceSummaryBar}
                        onClick={() => {
                            if (entry.anchorAssistantMessageId) toggleCollapsedTrace(entry.anchorAssistantMessageId);
                        }}
                        aria-expanded="false"
                        aria-label="Show process details"
                    >
                        <span className={`material-icons-round ${styles.executionTraceSummaryIcon}`}>toc</span>
                        <span className={styles.executionTraceSummaryLabel}>Process details</span>
                        <span className={styles.executionTraceSummaryMeta}>{entry.summaryText}</span>
                        <span className={`material-icons-round ${styles.executionTraceSummaryChevron}`}>expand_more</span>
                    </button>
                ) : (
                    <section className={styles.executionTraceContainer} aria-label="Process details">
                        <div className={styles.executionTraceHeader}>
                            <div className={styles.executionTraceHeaderText}>
                                <span className={styles.executionTraceHeaderLabel}>Process details</span>
                                <span className={styles.executionTraceHeaderMeta}>{entry.summaryText}</span>
                            </div>
                            {canToggleCollapse ? (
                                <button
                                    type="button"
                                    className={styles.executionTraceCollapseBtn}
                                    onClick={() => {
                                        if (entry.anchorAssistantMessageId) toggleCollapsedTrace(entry.anchorAssistantMessageId);
                                    }}
                                    aria-label="Hide process details"
                                >
                                    <span className="material-icons-round">expand_less</span>
                                </button>
                            ) : (
                                <span className={styles.executionTraceLiveBadge}>{showLiveBadge ? "Live" : "Open"}</span>
                            )}
                        </div>
                        <div className={styles.executionTraceItems}>
                            {presentedTraceItems.map((traceEntry, traceIndex) => renderPresentedTimelineItem(traceEntry, traceIndex, { grouped: true }))}
                        </div>
                    </section>
                )}
                {entry.interstitialProgressItems.map((progressItem) => {
                    if (progressItem.id === suppressedProgressId) {
                        return null;
                    }
                    return (
                        <div key={progressItem.id}>
                            <StreamingProgress
                                message={progressItem.message}
                                current={progressItem.current}
                                total={progressItem.total}
                            />
                        </div>
                    );
                })}
                {entry.assistantMessage ? (
                    <AssistantMessageRow
                        item={entry.assistantMessage}
                        projectId={projectId}
                        reasoningMode={reasoningMode}
                        isStreaming={streamingAssistantMessageId === entry.assistantMessage.id}
                        isSaved={savedNoteId === entry.assistantMessage.id}
                        isSaving={savingNoteId === entry.assistantMessage.id}
                        onCopy={handleCopy}
                        onSaveToNotes={onSaveToNotes ? handleSaveToNotes : undefined}
                        onInsert={onInsert}
                        onBranchFromMessage={onBranchFromMessage}
                    />
                ) : null}
            </div>
        );
    };

    const renderTimelineEntries = useMemo(() => {
        const rendered: Array<{ key: string; node: ReactNode }> = [];
        let singleBuffer: TimelineItem[] = [];

        const flushSingleBuffer = () => {
            if (singleBuffer.length === 0) return;
            const presentedSingles = buildPresentedTimeline(singleBuffer);
            presentedSingles.forEach((presentedEntry, presentedIndex) => {
                const key = presentedEntry.kind === "single"
                    ? presentedEntry.item.id
                    : presentedEntry.id;
                rendered.push({
                    key,
                    node: renderPresentedTimelineItem(presentedEntry, presentedIndex),
                });
            });
            singleBuffer = [];
        };

        renderEntries.forEach((entry) => {
            if (entry.kind === "single") {
                singleBuffer.push(entry.item);
                return;
            }
            flushSingleBuffer();
            rendered.push({
                key: entry.id,
                node: renderExecutionTraceEntry(entry),
            });
        });

        flushSingleBuffer();
        return rendered;
    }, [renderEntries, renderPresentedTimelineItem, renderExecutionTraceEntry]);

    // Skeleton while a conversation is being fetched from the server
    if (isConversationLoading && timeline.length === 0) {
        return (
            <div className={`${styles.copilotBody} ${variant === "page" ? styles.pageLayout : ""}`} ref={setContainerRef} onScroll={onScroll}>
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
            <div className={`${styles.copilotBody} ${variant === "page" ? styles.pageLayout : ""}`} ref={setContainerRef} onScroll={onScroll}>
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
                                className={suggestion.description ? styles.suggestCard : styles.suggestChip}
                                onClick={() => onSuggestionClick(suggestion.prompt)}
                                disabled={isLoading}
                            >
                                {suggestion.icon ? (
                                    <span className={`material-icons-round ${styles.suggestCardIcon}`} aria-hidden="true">
                                        {suggestion.icon}
                                    </span>
                                ) : null}
                                <span className={styles.suggestCardBody}>
                                    <span className={styles.suggestCardLabel}>{suggestion.label}</span>
                                    {suggestion.description ? (
                                        <span className={styles.suggestCardDescription}>{suggestion.description}</span>
                                    ) : null}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
                <div ref={bottomRef} style={{ height: 1, flexShrink: 0 }} aria-hidden="true" />
            </div>
        );
    }

    return (
        <>
        <div className={`${styles.copilotBody} ${variant === "page" ? styles.pageLayout : ""}`} ref={setContainerRef} onScroll={onScroll}>
            <div className={styles.chatList}>
                {hasMore && (
                    <div className={styles.loadOlderRow}>
                        <button
                            type="button"
                            className={styles.loadOlderBtn}
                            onClick={handleLoadOlder}
                            disabled={isLoadingOlder}
                            aria-label="Load older messages"
                        >
                            <span className="material-icons-round" style={{ fontSize: 16 }}>
                                {isLoadingOlder ? "sync" : "expand_less"}
                            </span>
                            {isLoadingOlder ? "Loading..." : "Load older messages"}
                        </button>
                    </div>
                )}
                {hiddenItemCount > 0 && (
                    <div className={styles.loadOlderRow}>
                        <button
                            type="button"
                            className={styles.loadOlderBtn}
                            onClick={handleRevealEarlier}
                            aria-label={`Show ${Math.min(visibleStep, hiddenItemCount)} earlier messages`}
                        >
                            <span className="material-icons-round" style={{ fontSize: 16 }}>
                                expand_less
                            </span>
                            {`Show ${Math.min(visibleStep, hiddenItemCount)} earlier ${
                                Math.min(visibleStep, hiddenItemCount) === 1 ? "message" : "messages"
                            }`}
                        </button>
                    </div>
                )}
                {renderTimelineEntries.map((entry, index) => {
                    if (index === 0) {
                        return (
                            <div key={entry.key} ref={(el) => { firstItemRef.current = el; }}>
                                {entry.node}
                            </div>
                        );
                    }
                    return entry.node;
                })}
                {isLoading && visibleTimeline.length > 0 && visibleTimeline[visibleTimeline.length - 1].type === "user_message" && (
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
        <ConfirmDialog
            isOpen={Boolean(confirmationState)}
            title={confirmationState?.title ?? "Confirm action"}
            message={confirmationState?.message ?? ""}
            confirmLabel={confirmationState?.confirmLabel ?? "Confirm"}
            variant={confirmationState?.variant ?? "default"}
            onCancel={() => setConfirmationState(null)}
            onConfirm={() => {
                const pendingConfirmation = confirmationState;
                setConfirmationState(null);
                if (!pendingConfirmation) return;
                void pendingConfirmation.onConfirm();
            }}
        />
        </>
    );
}
