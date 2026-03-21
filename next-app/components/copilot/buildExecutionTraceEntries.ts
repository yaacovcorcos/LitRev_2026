import type {
    TimelineArtifact,
    TimelineAssistantMessage,
    TimelineCheckpoint,
    TimelineItem,
    TimelineProgress,
    TimelineToolActivity,
} from "@/types/timeline";
import { isArtifactReviewable } from "@/lib/artifacts/reviewability";

export type DurableExecutionTraceItem =
    | TimelineToolActivity
    | TimelineCheckpoint
    | TimelineArtifact;

export type ExecutionTraceEntry =
    | { kind: "single"; item: TimelineItem }
    | {
        kind: "execution_trace";
        id: string;
        mode: "live" | "anchored";
        traceItems: DurableExecutionTraceItem[];
        interstitialProgressItems: TimelineProgress[];
        canCollapse: boolean;
        defaultCollapsed: boolean;
        summaryText: string;
        anchorAssistantMessageId?: string;
        assistantMessage?: TimelineAssistantMessage;
    };

function isDurableExecutionTraceItem(item: TimelineItem | undefined): item is DurableExecutionTraceItem {
    if (!item) return false;
    if (item.type === "tool_activity" || item.type === "checkpoint") return true;
    if (item.type === "artifact") return !isArtifactReviewable(item.status);
    return false;
}

function isProgressItem(item: TimelineItem | undefined): item is TimelineProgress {
    return !!item && item.type === "progress";
}

function hasRenderableAssistantAnswer(
    item: TimelineAssistantMessage,
    streamingAssistantMessageId?: string | null,
): boolean {
    if (item.id === streamingAssistantMessageId) return true;
    return item.content.trim().length > 0;
}

export function buildExecutionTraceSummary(traceItems: DurableExecutionTraceItem[]): string {
    let lastCheckpoint: TimelineCheckpoint | null = null;
    let lastToolActivity: TimelineToolActivity | null = null;
    let lastArtifact: TimelineArtifact | null = null;
    let toolSteps = 0;
    let checkpoints = 0;
    let artifacts = 0;

    for (const item of traceItems) {
        if (item.type === "tool_activity") {
            toolSteps += 1;
            lastToolActivity = item;
        } else if (item.type === "checkpoint") {
            checkpoints += 1;
            lastCheckpoint = item;
        } else if (item.type === "artifact") {
            artifacts += 1;
            lastArtifact = item;
        }
    }

    const checkpointLabel = lastCheckpoint?.label?.replace(/\s+/g, " ").trim();
    if (checkpointLabel) {
        return checkpointLabel.length <= 96 ? checkpointLabel : `${checkpointLabel.slice(0, 93).trimEnd()}...`;
    }

    const toolSummary = lastToolActivity?.outcomeSummary?.trim()
        || lastToolActivity?.summary?.trim()
        || lastToolActivity?.displayLabel?.trim();
    if (toolSummary) {
        return toolSummary.length <= 96 ? toolSummary : `${toolSummary.slice(0, 93).trimEnd()}...`;
    }

    if (lastArtifact?.title?.trim()) {
        return lastArtifact.title.trim();
    }

    const parts: string[] = [];
    if (toolSteps > 0) parts.push(`${toolSteps} tool step${toolSteps === 1 ? "" : "s"}`);
    if (checkpoints > 0) parts.push(`${checkpoints} checkpoint${checkpoints === 1 ? "" : "s"}`);
    if (artifacts > 0) parts.push(`${artifacts} artifact${artifacts === 1 ? "" : "s"}`);
    return parts.join(", ");
}

export function buildLiveExecutionTraceSummary(
    traceItems: DurableExecutionTraceItem[],
    interstitialProgressItems: TimelineProgress[],
): string {
    const latestProgress = interstitialProgressItems.at(-1)?.message?.replace(/\s+/g, " ").trim();
    if (latestProgress) {
        return latestProgress.length <= 96 ? latestProgress : `${latestProgress.slice(0, 93).trimEnd()}...`;
    }
    return buildExecutionTraceSummary(traceItems);
}

function canCreateLiveExecutionTrace(items: TimelineItem[], liveTraceStart: number): boolean {
    for (let index = liveTraceStart - 1; index >= 0; index -= 1) {
        const item = items[index];
        if (!item) continue;
        if (item.type === "user_message") return true;
        if (item.type === "assistant_message") return false;
    }
    return true;
}

export function buildExecutionTraceEntries(
    items: TimelineItem[],
    options?: { streamingAssistantMessageId?: string | null },
): ExecutionTraceEntry[] {
    const streamingAssistantMessageId = options?.streamingAssistantMessageId ?? null;
    const groupByStartIndex = new Map<number, Extract<ExecutionTraceEntry, { kind: "execution_trace" }> & { endIndex: number }>();

    for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        if (!item || item.type !== "assistant_message") continue;

        if (!hasRenderableAssistantAnswer(item, streamingAssistantMessageId)) continue;

        const nextItem = items[index + 1];
        if (nextItem?.type === "user_input_request" || nextItem?.type === "error") continue;

        const traceRangeItems: TimelineItem[] = [];
        let cursor = index - 1;
        while (cursor >= 0 && (isDurableExecutionTraceItem(items[cursor]) || isProgressItem(items[cursor]))) {
            traceRangeItems.unshift(items[cursor]!);
            cursor -= 1;
        }

        const traceItems = traceRangeItems.filter(isDurableExecutionTraceItem);
        if (traceItems.length === 0) continue;

        const traceStartIndex = index - traceRangeItems.length;
        const interstitialProgressItems = traceRangeItems.filter(isProgressItem);
            groupByStartIndex.set(traceStartIndex, {
                kind: "execution_trace",
                mode: "anchored",
            id: `trace-${item.id}`,
            anchorAssistantMessageId: item.id,
            traceItems,
            interstitialProgressItems,
                assistantMessage: item,
                canCollapse: item.id !== streamingAssistantMessageId,
                defaultCollapsed: item.id !== streamingAssistantMessageId,
                summaryText: buildExecutionTraceSummary(traceItems),
                endIndex: index,
            });
    }

    let liveTraceStart = items.length;
    const liveTraceRangeItems: TimelineItem[] = [];
    let liveCursor = items.length - 1;
    while (liveCursor >= 0 && (isDurableExecutionTraceItem(items[liveCursor]) || isProgressItem(items[liveCursor]))) {
        liveTraceRangeItems.unshift(items[liveCursor]!);
        liveCursor -= 1;
    }
    if (liveTraceRangeItems.length > 0) {
        const liveTraceItems = liveTraceRangeItems.filter(isDurableExecutionTraceItem);
        if (liveTraceItems.length > 0) {
            liveTraceStart = items.length - liveTraceRangeItems.length;
            if (canCreateLiveExecutionTrace(items, liveTraceStart)) {
                groupByStartIndex.set(liveTraceStart, {
                    kind: "execution_trace",
                    mode: "live",
                    id: `trace-live-${liveTraceStart}`,
                    traceItems: liveTraceItems,
                    interstitialProgressItems: liveTraceRangeItems.filter(isProgressItem),
                    canCollapse: false,
                    defaultCollapsed: false,
                    summaryText: buildLiveExecutionTraceSummary(
                        liveTraceItems,
                        liveTraceRangeItems.filter(isProgressItem),
                    ),
                    endIndex: items.length - 1,
                });
            }
        }
    }

    const entries: ExecutionTraceEntry[] = [];
    for (let index = 0; index < items.length; index += 1) {
        const groupedEntry = groupByStartIndex.get(index);
        if (groupedEntry) {
            entries.push(groupedEntry);
            index = groupedEntry.endIndex;
            continue;
        }
        entries.push({ kind: "single", item: items[index]! });
    }

    return entries;
}
