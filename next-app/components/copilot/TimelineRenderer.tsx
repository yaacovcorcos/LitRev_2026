/**
 * TimelineRenderer
 * Renders the conversation timeline: messages, artifacts, progress, checkpoints, errors.
 * Supports both legacy CopilotMessage[] and new TimelineItem[] inputs.
 * (planC Phase 0.6 + Phase 1)
 */

"use client";

import { Component, memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useStableChatScroll } from "@/hooks/useStableChatScroll";
import type { ErrorInfo, ReactNode } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "../markdown/CodeBlock";
import type { CopilotMessage } from "@/lib/projectCopilotStorage";
import type { TimelineAttachment, TimelineArtifact, TimelineContextAttachment, TimelineItem } from "@/types/timeline";
import type { CopilotPage, ReasoningMode } from "@/types/ai";
import type { AgentMode } from "@/types/agent";
import type {
    ArtifactType,
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
import { UserInputCard } from "../artifacts/UserInputCard";
import { StreamingProgress } from "./StreamingProgress";
import { addMentionedStudyAction } from "@/app/actions/ledger";
import { extractMentionedStudies, stripMentionedStudiesMarkup, type MentionedStudy } from "@/lib/ai/mentioned-studies";
import { useMentionedStudyTitles } from "@/lib/ai/use-mentioned-study-titles";
import { isChatStudyMentionsEnabled } from "@/lib/agent/feature-flags";
import { getReasoningSummaryPreview } from "@/lib/ai/reasoning-visibility";
import { getContextTargetKey } from "@/lib/context-capture/targets";
import { buildExecutionTraceEntries, type ExecutionTraceEntry } from "./execution-trace-grouping";
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

const BATCH_APPROVABLE_TYPES: ReadonlySet<ArtifactType> = new Set<ArtifactType>([
    "study_proposal",
    "study_update",
    "screening_batch",
    "protocol_suggestion",
    "criteria_card",
    "draft_diff",
    "memory_proposal",
    "memory_forget_proposal",
]);

const TOOL_ACTIVITY_META: Record<"queued" | "running" | "done" | "failed" | "interrupted", { icon: string; label: string }> = {
    queued: { icon: "schedule", label: "Queued" },
    running: { icon: "sync", label: "Running" },
    done: { icon: "check_circle", label: "Done" },
    failed: { icon: "error", label: "Failed" },
    interrupted: { icon: "wifi_off", label: "Interrupted" },
};

type TimelineToolActivityItem = Extract<TimelineItem, { type: "tool_activity" }>;
type TimelineErrorItem = Extract<TimelineItem, { type: "error" }>;

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
    if (item.toolName === "search_pubmed") return "PubMed";
    if (item.toolName === "search_openalex") return "OpenAlex";
    if (item.toolName === "search_semantic_scholar") return "Semantic Scholar";
    return item.toolName;
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
    const displayContent = stripAssistantMarkupForDisplay(item.content);
    const rawReasoningText = item.reasoning?.text?.trim() ?? "";
    const hasReasoning = rawReasoningText.length > 0;
    const showReasoningArea = hasReasoning && reasoningMode !== "off";
    const isSummaryMode = reasoningMode === "summary";
    const summaryPreview = getReasoningSummaryPreview(rawReasoningText);
    const [showFullSummary, setShowFullSummary] = useState(false);
    const reasoningText = isSummaryMode && !showFullSummary
        ? summaryPreview.text
        : rawReasoningText;
    const isReasoningStreaming = item.reasoning?.state === "streaming";
    const mentions = useMemo(
        () => (CHAT_STUDY_MENTIONS_ENABLED ? extractMentionedStudies(item.content) : []),
        [item.content]
    );
    const hydratedMentionTitles = useMentionedStudyTitles(mentions);
    const [mentionStates, setMentionStates] = useState<Record<string, MentionAddState>>({});
    const [showReasoning, setShowReasoning] = useState(reasoningMode !== "off" && isReasoningStreaming);

    useEffect(() => {
        if (reasoningMode !== "off" && isReasoningStreaming) {
            setShowReasoning(true);
        }
    }, [isReasoningStreaming, reasoningMode]);

    const reasoningStateLabel = isReasoningStreaming
        ? "Live"
        : item.reasoning?.truncated
            ? "Truncated"
            : undefined;

    useEffect(() => {
        if (reasoningMode !== "summary") {
            setShowFullSummary(false);
        }
    }, [reasoningMode]);

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
                            isReasoningStreaming && (
                                <span className={styles.reasoningPlaceholder}>Thinking...</span>
                            )
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
    /** Optional batch-approve callback with progress and cancellation hooks. */
    onApproveArtifactsBatch?: (
        artifactIds: string[],
        options?: {
            shouldStop?: () => boolean;
            onProgress?: (completed: number, total: number) => void;
            conversationId?: string;
        },
    ) => Promise<{
        approvedCount: number;
        failedArtifactIds: string[];
        stopped: boolean;
    }>;
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

export function TimelineRenderer({
    messages = [],
    items,
    isLoading,
    onInsert,
    emptyState,
    onSuggestionClick,
    onActionPrompt,
    onReviewArtifact,
    onApproveArtifactsBatch,
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
    const [approveAllState, setApproveAllState] = useState<"idle" | "approving" | "finished">("idle");
    const [approveAllProgress, setApproveAllProgress] = useState<{ completed: number; total: number }>({ completed: 0, total: 0 });
    const [approveAllSummary, setApproveAllSummary] = useState<{ approvedCount: number; failedArtifactIds: string[]; stopped: boolean } | null>(null);
    const [collapsedTraceByAssistantId, setCollapsedTraceByAssistantId] = useState<Record<string, boolean>>({});
    const approveAllAbortRef = useRef(false);
    const approveAllDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const prevConversationIdRef = useRef<string | undefined>(conversationId);

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
    const canBatchApprove = !!(onApproveArtifactsBatch || onReviewArtifact);
    const pendingApprovable = useMemo(() => {
        if (!canBatchApprove) return [];
        const latestArtifactById = new Map<string, TimelineArtifact>();
        for (const item of timeline) {
            if (item.type === "artifact") {
                latestArtifactById.set(item.artifactId, item);
            }
        }
        return [...latestArtifactById.values()].filter(
            (item) => item.status === "proposed" && BATCH_APPROVABLE_TYPES.has(item.artifactType),
        );
    }, [canBatchApprove, timeline]);
    const showApproveAllBar = approveAllState !== "idle" || pendingApprovable.length >= 2;
    const approveAllResultText = useMemo(() => {
        if (!approveAllSummary) return "Batch finished.";
        const processedCount = approveAllSummary.approvedCount + approveAllSummary.failedArtifactIds.length;
        const total = approveAllProgress.total || processedCount;
        const failedCount = approveAllSummary.failedArtifactIds.length;
        if (!approveAllSummary.stopped && failedCount === 0) {
            return "All approved.";
        }
        if (approveAllSummary.stopped) {
            return `Stopped. Approved ${approveAllSummary.approvedCount}/${total}.`;
        }
        return `Approved ${approveAllSummary.approvedCount}/${total}. ${failedCount} remaining.`;
    }, [approveAllProgress.total, approveAllSummary]);

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

    const windowSize = initialVisibleCount && initialVisibleCount > 0 ? initialVisibleCount : null;
    const [visibleCount, setVisibleCount] = useState<number>(() => {
        if (!windowSize) return timeline.length;
        return Math.min(windowSize, timeline.length);
    });

    useEffect(() => {
        if (!windowSize) {
            setVisibleCount(timeline.length);
            return;
        }
        setVisibleCount(Math.min(windowSize, timeline.length));
    }, [conversationId, timeline.length, windowSize]);

    const effectiveVisibleCount = windowSize ? Math.min(visibleCount, timeline.length) : timeline.length;
    const hiddenItemCount = Math.max(0, timeline.length - effectiveVisibleCount);
    const visibleTimeline = hiddenItemCount > 0 ? timeline.slice(-effectiveVisibleCount) : timeline;
    const visibleFirstTimelineId = visibleTimeline[0]?.id ?? null;
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
    useEffect(() => {
        setExpandedSequenceIds({});
    }, [conversationId]);
    useEffect(() => {
        setCollapsedTraceByAssistantId({});
    }, [conversationId]);
    // ── Content change — schedule scroll if pinned ──────────────────────────
    useLayoutEffect(() => { notifyContentChanged(); }, [notifyContentChanged, timeline, visibleFirstTimelineId, effectiveVisibleCount]);
    useEffect(() => {
        return () => {
            if (approveAllDismissTimerRef.current) {
                clearTimeout(approveAllDismissTimerRef.current);
            }
        };
    }, []);
    useEffect(() => {
        if (prevConversationIdRef.current !== conversationId && approveAllState === "approving") {
            approveAllAbortRef.current = true;
        }
        prevConversationIdRef.current = conversationId;
    }, [conversationId, approveAllState]);
    useEffect(() => {
        if (approveAllState !== "finished") return;
        approveAllDismissTimerRef.current = setTimeout(() => {
            setApproveAllState("idle");
            setApproveAllProgress({ completed: 0, total: 0 });
            setApproveAllSummary(null);
        }, 1500);
        return () => {
            if (approveAllDismissTimerRef.current) {
                clearTimeout(approveAllDismissTimerRef.current);
            }
        };
    }, [approveAllState]);

    // ── Prepend anchor for "load older messages" ─────────────────────────
    const firstItemRef = useRef<HTMLDivElement | null>(null);
    const pendingPrependRef = useRef<{ firstIdBeforeLoad: string | null } | null>(null);
    const revealPendingRef = useRef(false);
    const latestFirstTimelineIdRef = useRef<string | null>(visibleFirstTimelineId);
    useLayoutEffect(() => {
        latestFirstTimelineIdRef.current = visibleFirstTimelineId;
    }, [visibleFirstTimelineId]);

    const handleLoadOlder = useCallback(async () => {
        if (!onLoadOlder) return;
        const firstIdBeforeLoad = visibleFirstTimelineId;
        capturePrependAnchor(firstItemRef.current);
        pendingPrependRef.current = { firstIdBeforeLoad };
        await onLoadOlder();
        // If no prepend occurred, clear pending marker to avoid stale restore later.
        if (
            pendingPrependRef.current?.firstIdBeforeLoad === firstIdBeforeLoad
            && latestFirstTimelineIdRef.current === firstIdBeforeLoad
        ) {
            pendingPrependRef.current = null;
        }
    }, [onLoadOlder, capturePrependAnchor, visibleFirstTimelineId]);

    const handleRevealEarlier = useCallback(() => {
        if (hiddenItemCount <= 0) return;
        capturePrependAnchor(firstItemRef.current);
        revealPendingRef.current = true;
        setVisibleCount((current) => Math.min(timeline.length, current + Math.max(visibleStep, 1)));
    }, [capturePrependAnchor, hiddenItemCount, timeline.length, visibleStep]);

    // Restore viewport after prepend
    useLayoutEffect(() => {
        const pending = pendingPrependRef.current;
        if (!pending) return;
        // Restore only once a prepend has actually changed the first visible item.
        if (visibleFirstTimelineId !== pending.firstIdBeforeLoad) {
            restorePrependAnchor();
            pendingPrependRef.current = null;
        }
    }, [restorePrependAnchor, visibleFirstTimelineId]);

    useLayoutEffect(() => {
        if (!revealPendingRef.current) return;
        restorePrependAnchor();
        revealPendingRef.current = false;
    }, [restorePrependAnchor, visibleFirstTimelineId]);

    useEffect(() => {
        if (!onTimelineReady) return;
        if (isConversationLoading) return;
        onTimelineReady({
            visibleItems: visibleTimeline.length,
            hiddenItems: hiddenItemCount,
            totalItems: timeline.length,
        });
    }, [hiddenItemCount, isConversationLoading, onTimelineReady, timeline.length, visibleTimeline.length]);

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

    const handleStopApproveAll = useCallback(() => {
        approveAllAbortRef.current = true;
    }, []);

    const handleApproveAll = useCallback(async () => {
        if (approveAllState === "approving") return;
        const artifactIds = pendingApprovable.map((item) => item.artifactId);
        if (artifactIds.length < 2) return;

        if (approveAllDismissTimerRef.current) {
            clearTimeout(approveAllDismissTimerRef.current);
        }
        approveAllAbortRef.current = false;
        setApproveAllSummary(null);
        setApproveAllState("approving");
        setApproveAllProgress({ completed: 0, total: artifactIds.length });

        let processedCount = 0;
        const updateProgress = (completed: number, total: number) => {
            processedCount = completed;
            setApproveAllProgress({ completed, total });
        };

        try {
            if (onApproveArtifactsBatch) {
                const result = await onApproveArtifactsBatch(artifactIds, {
                    shouldStop: () => approveAllAbortRef.current,
                    onProgress: updateProgress,
                    conversationId,
                });
                setApproveAllSummary(result);
            } else if (onReviewArtifact) {
                let approvedCount = 0;
                const failedArtifactIds: string[] = [];
                for (let i = 0; i < artifactIds.length; i += 1) {
                    if (approveAllAbortRef.current) break;
                    try {
                        await onReviewArtifact(artifactIds[i], "accepted");
                        approvedCount += 1;
                    } catch {
                        failedArtifactIds.push(artifactIds[i]);
                    }
                    updateProgress(i + 1, artifactIds.length);
                }
                setApproveAllSummary({
                    approvedCount,
                    failedArtifactIds,
                    stopped: approveAllAbortRef.current,
                });
            }
        } catch (error) {
            console.error("[ApproveAll] batch failed", error);
            setApproveAllSummary({
                approvedCount: processedCount,
                failedArtifactIds: artifactIds.slice(processedCount),
                stopped: true,
            });
        } finally {
            setApproveAllState("finished");
        }
    }, [approveAllState, conversationId, onApproveArtifactsBatch, onReviewArtifact, pendingApprovable]);

    const renderArtifactContent = (item: TimelineArtifact) => {
        const handleReview = (status: "accepted" | "rejected", note?: string, editedPayload?: Record<string, unknown>) => {
            onReviewArtifact?.(item.artifactId, status, note, editedPayload);
        };

        const jumpTo = projectId ? getJumpToProps(item.artifactType, projectId) : {};
        const canAct = !isLoading && !isConversationLoading;

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
                const planPayload = item.payload as PlanPayload;
                const canExecutePlan = !!onExecutePlan && canAct && Boolean(planPayload.execution);
                return (
                    <ArtifactWrapper
                        {...wrapperProps}
                        summaryText={`Plan executed: ${planPayload?.steps?.length ?? 0} steps`}
                    >
                        <PlanCard
                            payload={planPayload}
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
                            canAct={canAct}
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
                            canAct={canAct}
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
                            canAct={canAct}
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
                            canAct={canAct}
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
                            canAct={canAct}
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
                            canAct={canAct}
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
                            canAct={canAct}
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
                            canAct={canAct}
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
                            canAct={canAct}
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
                const summary = item.summary?.trim();
                const queryPreview = item.queryPreview?.trim();
                const resultCountText = getSearchResultCountText(item);
                const identifierText = getSearchIdentifierText(item);
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
                            <span className={styles.toolActivityState}>{meta.label}</span>
                        </div>
                        <p className={styles.toolActivityMeta}>{timingText}</p>
                        {queryPreview ? <p className={styles.toolActivitySummary}>{queryPreview}</p> : null}
                        {resultCountText ? <p className={styles.toolActivityMeta}>{resultCountText}</p> : null}
                        {identifierText ? <p className={styles.toolActivityMeta}>{identifierText}</p> : null}
                        {summary ? <p className={styles.toolActivitySummary}>{summary}</p> : null}
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
                            const resultCountText = getSearchResultCountText(item);
                            const timingText = getToolActivityTimingText(item);
                            const identifierText = getSearchIdentifierText(item);
                            return (
                                <li key={item.id} className={styles.toolSequenceItem}>
                                    <div className={styles.toolSequenceItemHead}>
                                        <span className={styles.toolSequenceIndex}>{itemIndex + 1}.</span>
                                        {item.queryPreview ? (
                                            <span className={styles.toolSequenceQuery}>{item.queryPreview}</span>
                                        ) : (
                                            <span className={styles.toolSequenceQueryMuted}>Query unavailable</span>
                                        )}
                                    </div>
                                    <div className={styles.toolSequenceMetaRow}>
                                        {resultCountText ? (
                                            <span className={styles.toolActivityMeta}>{resultCountText}</span>
                                        ) : null}
                                        {identifierText ? (
                                            <span className={styles.toolActivityMeta}>{identifierText}</span>
                                        ) : null}
                                        <span className={styles.toolActivityMeta}>{timingText}</span>
                                    </div>
                                    {item.summary?.trim() ? (
                                        <p className={styles.toolActivitySummary}>{item.summary.trim()}</p>
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
            {showApproveAllBar && (
                <div className={styles.approveAllBar}>
                    {approveAllState === "idle" && (
                        <>
                            <div className={styles.approveAllMeta}>
                                <span className="material-icons-round" aria-hidden="true">done_all</span>
                                <span>{pendingApprovable.length} pending proposals</span>
                            </div>
                            <button
                                type="button"
                                className={styles.approveAllBtn}
                                onClick={handleApproveAll}
                                disabled={isLoading}
                                aria-label="Approve all pending proposals"
                            >
                                Approve All
                            </button>
                        </>
                    )}
                    {approveAllState === "approving" && (
                        <>
                            <div className={styles.approveAllMeta}>
                                <span className={`material-icons-round ${styles.approveAllSpinner}`} aria-hidden="true">sync</span>
                                <span>Approving {approveAllProgress.completed}/{approveAllProgress.total}...</span>
                            </div>
                            <button
                                type="button"
                                className={styles.approveAllStopBtn}
                                onClick={handleStopApproveAll}
                                aria-label="Stop approving remaining proposals"
                            >
                                Stop
                            </button>
                        </>
                    )}
                    {approveAllState === "finished" && (
                        <div className={styles.approveAllMeta} aria-live="polite">
                            <span className="material-icons-round" aria-hidden="true">
                                {approveAllSummary && approveAllSummary.failedArtifactIds.length === 0 && !approveAllSummary.stopped
                                    ? "check_circle"
                                    : "info"}
                            </span>
                            <span>{approveAllResultText}</span>
                        </div>
                    )}
                </div>
            )}
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
