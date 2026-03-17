"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ApproveArtifactsBatchResult } from "@/types/copilot-context";
import type { ArtifactType } from "@/types/artifacts";
import type { TimelineArtifact, TimelineItem } from "@/types/timeline";

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

type PendingApprovalLifecycleState = "idle" | "approving" | "finished";

type PendingApprovalSummary = {
    approvedCount: number;
    failedArtifactIds: string[];
    stopped: boolean;
};

export type PendingApprovalBatchHandler = (
    artifactIds: string[],
    options?: {
        shouldStop?: () => boolean;
        onProgress?: (completed: number, total: number) => void;
        conversationId?: string;
    },
) => Promise<ApproveArtifactsBatchResult>;

export type PendingApprovalBarState = {
    pendingArtifacts: TimelineArtifact[];
    pendingCount: number;
    showBar: boolean;
    state: PendingApprovalLifecycleState;
    progress: { completed: number; total: number };
    resultText: string;
    interactionLocked: boolean;
    approveAll: () => Promise<void>;
    stopApproval: () => void;
};

type UsePendingApprovalBarStateArgs = {
    timeline: TimelineItem[];
    conversationId?: string | null;
    isLoading: boolean;
    hasActiveProgress: boolean;
    approveArtifactsBatch?: PendingApprovalBatchHandler;
};

function isBatchApprovableArtifactType(artifactType: ArtifactType): boolean {
    return BATCH_APPROVABLE_TYPES.has(artifactType);
}

function isLikelyPersistedArtifact(item: TimelineArtifact): boolean {
    const artifactId = item.artifactId.trim();
    if (!artifactId) return false;
    if (item.id !== `artifact-${artifactId}`) return false;
    // Stream-local placeholder artifact ids are synthesized when the server never
    // emitted a persisted artifact id. They should not be part of batch review.
    if (item.id.startsWith("artifact-art-")) return false;
    return true;
}

export function getValidPendingApprovalArtifacts(timeline: TimelineItem[]): TimelineArtifact[] {
    const latestArtifactById = new Map<string, TimelineArtifact>();
    for (const item of timeline) {
        if (item.type !== "artifact") continue;
        latestArtifactById.set(item.artifactId, item);
    }

    return [...latestArtifactById.values()].filter((item) => {
        if (item.status !== "proposed") return false;
        if (!isBatchApprovableArtifactType(item.artifactType)) return false;
        return isLikelyPersistedArtifact(item);
    });
}

function buildResultText(
    summary: PendingApprovalSummary | null,
    progress: { completed: number; total: number },
): string {
    if (!summary) return "Batch finished.";
    const processedCount = summary.approvedCount + summary.failedArtifactIds.length;
    const total = progress.total || processedCount;
    const failedCount = summary.failedArtifactIds.length;
    if (!summary.stopped && failedCount === 0) {
        return "All approved.";
    }
    if (summary.stopped) {
        return `Stopped. Approved ${summary.approvedCount}/${total}.`;
    }
    return `Approved ${summary.approvedCount}/${total}. ${failedCount} remaining.`;
}

export function usePendingApprovalBarState({
    timeline,
    conversationId,
    isLoading,
    hasActiveProgress,
    approveArtifactsBatch,
}: UsePendingApprovalBarStateArgs): PendingApprovalBarState {
    const pendingArtifacts = useMemo(
        () => (approveArtifactsBatch ? getValidPendingApprovalArtifacts(timeline) : []),
        [approveArtifactsBatch, timeline],
    );
    const [state, setState] = useState<PendingApprovalLifecycleState>("idle");
    const [progress, setProgress] = useState<{ completed: number; total: number }>({ completed: 0, total: 0 });
    const [summary, setSummary] = useState<PendingApprovalSummary | null>(null);
    const abortRef = useRef(false);
    const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const sessionRef = useRef(0);
    const prevConversationIdRef = useRef<string | null | undefined>(conversationId);

    const clearDismissTimer = useCallback(() => {
        if (dismissTimerRef.current) {
            clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = null;
        }
    }, []);

    const resetState = useCallback(() => {
        clearDismissTimer();
        setState("idle");
        setProgress({ completed: 0, total: 0 });
        setSummary(null);
    }, [clearDismissTimer]);

    const eligible = Boolean(approveArtifactsBatch)
        && !isLoading
        && !hasActiveProgress
        && pendingArtifacts.length >= 2;

    useEffect(() => {
        return () => clearDismissTimer();
    }, [clearDismissTimer]);

    useEffect(() => {
        if (prevConversationIdRef.current === conversationId) return;
        abortRef.current = true;
        sessionRef.current += 1;
        prevConversationIdRef.current = conversationId;
        resetState();
    }, [conversationId, resetState]);

    useEffect(() => {
        if (state !== "finished") return;
        dismissTimerRef.current = setTimeout(() => {
            setState("idle");
            setProgress({ completed: 0, total: 0 });
            setSummary(null);
            dismissTimerRef.current = null;
        }, 1500);
        return clearDismissTimer;
    }, [clearDismissTimer, state]);

    useEffect(() => {
        if (state === "approving") return;
        if (!isLoading && !hasActiveProgress) return;
        resetState();
    }, [hasActiveProgress, isLoading, resetState, state]);

    const stopApproval = useCallback(() => {
        abortRef.current = true;
    }, []);

    const approveAll = useCallback(async () => {
        if (!approveArtifactsBatch || state === "approving") return;
        const artifactIds = pendingArtifacts.map((item) => item.artifactId);
        if (artifactIds.length < 2) return;

        clearDismissTimer();
        abortRef.current = false;
        setSummary(null);
        setState("approving");
        setProgress({ completed: 0, total: artifactIds.length });

        const sessionId = sessionRef.current + 1;
        sessionRef.current = sessionId;
        let processedCount = 0;
        const updateProgress = (completed: number, total: number) => {
            processedCount = completed;
            setProgress({ completed, total });
        };

        try {
            const result = await approveArtifactsBatch(artifactIds, {
                shouldStop: () => abortRef.current,
                onProgress: updateProgress,
                conversationId: conversationId ?? undefined,
            });
            if (sessionRef.current !== sessionId) return;
            setSummary(result);
        } catch (error) {
            console.error("[PendingApprovalBar] batch failed", error);
            if (sessionRef.current !== sessionId) return;
            setSummary({
                approvedCount: processedCount,
                failedArtifactIds: artifactIds.slice(processedCount),
                stopped: true,
            });
        } finally {
            if (sessionRef.current === sessionId) {
                setState("finished");
            }
        }
    }, [approveArtifactsBatch, clearDismissTimer, conversationId, pendingArtifacts, state]);

    return {
        pendingArtifacts,
        pendingCount: pendingArtifacts.length,
        showBar: state !== "idle" || eligible,
        state,
        progress,
        resultText: buildResultText(summary, progress),
        interactionLocked: state === "approving",
        approveAll,
        stopApproval,
    };
}
