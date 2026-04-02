/**
 * Custom hook encapsulating all stream and artifact action logic
 * extracted from ProjectCopilotContext.tsx for maintainability.
 * Combines C-3 (stream) and C-4 (artifacts) extractions.
 */
import { useCallback, useRef } from "react";
import type {
    CopilotMessage,
    CopilotMessageAttachment,
    ProjectCopilotState,
} from "@/lib/projectCopilotStorage";
import { processAIStream } from "@/lib/ai/stream-processor";
import {
    dispatchProjectDataChanged,
    getChangedDomainsForAcceptedArtifact,
    getProtocolPatchForAcceptedArtifact,
} from "@/lib/project-data-events";
import { isProtocolLiveSyncV1Enabled } from "@/lib/protocol-live-sync-feature-flags";
import { createConversation } from "@/app/actions/conversations";
import { reviewArtifactAction, undoArtifactAction } from "@/app/actions/agent";
import type { ArtifactData, ArtifactStatus } from "@/types/artifacts";
import type { AgentMode } from "@/types/agent";
import type {
    AIErrorEnvelope,
    AIStreamChunk,
    ChoiceOption,
    CopilotPage,
    ReasoningMode,
    RunRecoveryResponse,
    RunRecoveryRecommendation,
    StreamPhase,
    UserInputRequest,
    UserInputResolution,
} from "@/types/ai";
import type { ContextCaptureTarget } from "@/types/context-capture";
import {
    createInitialProjectStreamState,
    failRunningProjectToolActivityMessages,
    handleProjectCopilotStreamChunk,
    interruptRunningProjectToolActivityMessages,
    reserveProjectCopilotAssistantTurn,
} from "@/contexts/project-copilot-stream-events";
import type { ArtifactActionContract } from "@/lib/artifacts/action-contract";
import { resolveReasoningRequest } from "@/lib/ai/reasoning-request";
import {
    buildUnexpectedTerminalErrorState,
    buildClientErrorState,
    clearRunScopedRecoveryState,
    formatStreamErrorForUI,
    hasCanonicalFailureFallbackText,
    reconcileRunScopedRenderedErrors,
    reconcileRunScopedRecoveryState,
    shouldSuppressClientFallback,
} from "@/lib/ai/stream-error-ui";
import { recordChatUnificationMetric } from "@/lib/ai/chat-unification-telemetry";
import {
    isSuccessfulTerminalReason,
    terminalReasonFromRunEnd,
    terminalReasonFromThrownError,
    type StreamTerminalReason,
} from "@/lib/ai/stream-lifecycle";
import { recordReliabilityMetric } from "@/lib/ai/reliability-telemetry";
import type { RetryModelExpectation } from "@/types/chat-unification";
import {
    ABNORMAL_END_TOOL_FAILURE_SUMMARY,
    shouldFailRunningToolsOnAbnormalEnd,
} from "@/lib/ai/ai-stream-runtime";
import { isProgressiveAnswerStreamingEnabled } from "@/lib/feature-flags";
import {
    createRecoveryErrorEnvelope,
    getRunRecoveryMessage,
    pollRunRecovery,
    RUN_RECOVERY_INTERRUPTED_TOOL_SUMMARY,
    RUN_RECOVERY_RECONNECT_SUMMARY,
} from "@/lib/ai/run-recovery-client";
import type { PendingAttachment, ApproveArtifactsBatchResult } from "@/types/copilot-context";
import type { useCopilotConversations } from "@/hooks/useCopilotConversations";

/** Dependencies injected by the provider. */
export type CopilotStreamActionsDeps = {
    projectId: string;
    updateState: (updater: (prev: ProjectCopilotState) => ProjectCopilotState) => void;
    stateRef: React.MutableRefObject<ProjectCopilotState>;
    streamGenRef: React.MutableRefObject<number>;
    abortControllerRef: React.MutableRefObject<AbortController | null>;
    isLoadingRef: React.MutableRefObject<boolean>;
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
    setStreamPhase: React.Dispatch<React.SetStateAction<StreamPhase>>;
    setCurrentRunId: React.Dispatch<React.SetStateAction<string | null>>;
    setPendingChoices: React.Dispatch<React.SetStateAction<ChoiceOption[]>>;
    setPendingUserInput: React.Dispatch<React.SetStateAction<UserInputRequest | null>>;
    pendingUserInput: UserInputRequest | null;
    currentRunId: string | null;
    setArtifacts: React.Dispatch<React.SetStateAction<Map<string, ArtifactData>>>;
    pendingAttachment: PendingAttachment | null;
    setPendingAttachment: React.Dispatch<React.SetStateAction<PendingAttachment | null>>;
    reasoningMode: ReasoningMode;
    convo: ReturnType<typeof useCopilotConversations>;
    onNavigate: (url: string) => void;
};

export function useCopilotStreamActions(deps: CopilotStreamActionsDeps) {
    const {
        projectId,
        updateState,
        stateRef,
        streamGenRef,
        abortControllerRef,
        isLoadingRef,
        setIsLoading,
        setStreamPhase,
        setCurrentRunId,
        setPendingChoices,
        setPendingUserInput,
        pendingUserInput,
        currentRunId,
        setArtifacts,
        pendingAttachment,
        setPendingAttachment,
        reasoningMode,
        convo,
        onNavigate,
    } = deps;

    const userCancelRequestedRef = useRef(false);
    const progressiveAnswerStreamingEnabled = isProgressiveAnswerStreamingEnabled();

    const stripReservedAssistantMessages = useCallback((messages: CopilotMessage[], assistantMessageId: string) => (
        messages.filter((message) => !(
            message.id === assistantMessageId
            && message.sender === "ai"
            && message.deliveryState === "reserved"
            && !message.text
            && !message.reasoning?.text
            && !message.streamError
        ))
    ), []);

    const cancelStream = useCallback(() => {
        userCancelRequestedRef.current = true;
        streamGenRef.current++;
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsLoading(false);
        setPendingChoices([]);
    }, [abortControllerRef, setIsLoading, setPendingChoices, streamGenRef]);

    const buildProjectRecoverySeedState = useCallback((params: {
        messages: CopilotMessage[];
        conversationId: string | null;
        runId: string;
    }) => {
        const assistantMessages = params.messages.filter((message) => (
            message.sender === "ai"
            && !message.progress
            && !message.toolActivity
            && !message.streamError
            && !message.artifact
            && !message.userInputRequest
            && !message.checkpoint
        ));
        const latestAssistant = assistantMessages.at(-1) ?? null;
        const runningToolIds = params.messages
            .filter((message) => {
                const status = message.toolActivity?.status;
                return status === "running" || status === "interrupted";
            })
            .map((message) => message.toolActivity?.callId)
            .filter((callId): callId is string => Boolean(callId));

        return {
            aiMessageId: latestAssistant?.id ?? `m-${Date.now() + 1}`,
            state: createInitialProjectStreamState({
                aiMessageCreated: Boolean(latestAssistant),
                hasVisibleContent: Boolean(latestAssistant?.text),
                fullContent: latestAssistant?.text ?? "",
                reasoningContent: latestAssistant?.reasoning?.text ?? "",
                reasoningState: latestAssistant?.reasoning?.state ?? "done",
                reasoningTruncated: latestAssistant?.reasoning?.truncated ?? false,
                runningToolCallIds: runningToolIds,
                lastToolCallId: runningToolIds.at(-1) ?? null,
                localRunId: params.runId,
                effectiveConvId: params.conversationId,
            }),
        };
    }, []);

    const appendProjectRecoveryCheckpoint = useCallback((
        page: CopilotPage,
        section: string | undefined,
        runId: string,
        label: string,
    ) => {
        updateState((prev) => {
            const reconciled = reconcileRunScopedRecoveryState({
                items: prev.messages,
                nextCheckpoint: {
                    runId,
                    checkpointKind: "recovery",
                    label,
                },
                getMessage: (message) => message.text,
                getErrorMeta: (message) => message.streamError,
                getCheckpointMeta: (message) => message.checkpoint
                    ? {
                        runId: message.checkpoint.runId ?? null,
                        checkpointKind: message.checkpoint.checkpointKind ?? "standard",
                        label: message.checkpoint.label,
                    }
                    : null,
            });
            if (!reconciled.shouldAppend) {
                return {
                    ...prev,
                    messages: reconciled.items,
                };
            }
            return {
                ...prev,
                messages: [
                    ...reconciled.items,
                    {
                        id: `recovery-checkpoint-${Date.now()}`,
                        sender: "ai",
                        text: "",
                        createdAt: new Date().toISOString(),
                        context: { page, section },
                        checkpoint: { label, runId, checkpointKind: "recovery" },
                    },
                ],
            };
        });
    }, [updateState]);

    const appendProjectRecoveryError = useCallback((params: {
        page: CopilotPage;
        section?: string;
        message: string;
        errorMeta: AIErrorEnvelope;
    }) => {
        updateState((prev) => {
            const reconciled = reconcileRunScopedRecoveryState({
                items: prev.messages,
                nextMessage: params.message,
                nextMeta: params.errorMeta,
                getMessage: (message) => message.text,
                getErrorMeta: (message) => message.streamError,
                getCheckpointMeta: (message) => message.checkpoint
                    ? {
                        runId: message.checkpoint.runId ?? null,
                        checkpointKind: message.checkpoint.checkpointKind ?? "standard",
                        label: message.checkpoint.label,
                    }
                    : null,
            });
            if (!reconciled.shouldAppend) {
                return {
                    ...prev,
                    messages: reconciled.items,
                };
            }
            return {
                ...prev,
                messages: [
                    ...reconciled.items.filter((message) => !message.progress),
                    {
                        id: `recovery-error-${Date.now()}`,
                        sender: "ai",
                        text: params.message,
                        streamError: params.errorMeta,
                        createdAt: new Date().toISOString(),
                        context: { page: params.page, section: params.section },
                    },
                ],
            };
        });
    }, [updateState]);

    const appendProjectArtifactActionError = useCallback((params: {
        message: string;
        errorCode?: string;
    }) => {
        const errorState = buildClientErrorState({
            errorMeta: {
                kind: "artifact_review",
                code: params.errorCode ?? "ARTIFACT_REVIEW_FAILED",
                retryable: false,
                source: "artifact_review",
                message: params.message,
            },
        });

        updateState((prev) => {
            const context = [...prev.messages]
                .reverse()
                .find((message) => message.context?.page)?.context;
            const reconciled = reconcileRunScopedRenderedErrors({
                items: prev.messages.filter((message) => message.sender === "ai"),
                nextMessage: errorState.message,
                nextMeta: errorState.errorMeta,
                getMessage: (message) => message.text,
                getErrorMeta: (message) => message.streamError,
            });
            const retainedMessageIds = new Set(reconciled.items.map((message) => message.id));

            if (!reconciled.shouldAppend) {
                return {
                    ...prev,
                    messages: prev.messages.filter((message) =>
                        message.sender !== "ai" || retainedMessageIds.has(message.id)
                    ),
                };
            }

            const nextMessage: CopilotMessage = {
                id: `artifact-action-error-${Date.now()}`,
                sender: "ai",
                text: errorState.message,
                streamError: errorState.errorMeta,
                createdAt: new Date().toISOString(),
                ...(context ? { context } : {}),
            };

            return {
                ...prev,
                messages: [
                    ...prev.messages.filter((message) =>
                        message.sender !== "ai" || retainedMessageIds.has(message.id)
                    ),
                    nextMessage,
                ],
            };
        });
    }, [updateState]);

    const runProjectRecovery = useCallback(async (params: {
        conversationId: string;
        runId: string;
        page: CopilotPage;
        section?: string;
        signal?: AbortSignal;
        onPlanStepUpdate?: (planId: string, stepIndex: number, stepStatus: string) => void;
    }): Promise<{
        outcome: "recovered" | "needs_user_action" | "retry" | "aborted" | "timeout";
        recommendation: RunRecoveryRecommendation;
        activeRunId: string;
        lastActivityAt?: string | null;
        runStatus?: string | null;
        abnormalEndClassification?: RunRecoveryResponse["abnormalEndClassification"];
    }> => {
        const { aiMessageId, state: initialState } = buildProjectRecoverySeedState({
            messages: stateRef.current.messages,
            conversationId: params.conversationId,
            runId: params.runId,
        });
        let replayState = initialState;
        let recoveredConversationId = params.conversationId;

        const applyRecoveryChunk = async (chunk: AIStreamChunk) => {
            const nextState = handleProjectCopilotStreamChunk(
                chunk,
                replayState,
                {
                    aiMessageId,
                    page: params.page,
                    section: params.section,
                    projectId,
                    myGen: streamGenRef.current,
                    getCurrentGen: () => streamGenRef.current,
                    setCurrentRunId,
                    syncConversationId: (conversationId) => {
                        recoveredConversationId = conversationId;
                        if (convo.currentConversationIdRef.current !== conversationId) {
                            convo.setCurrentConversationId(conversationId);
                        }
                    },
                    upsertConversationTitle: (conversationId, title) => {
                        convo.setConversations((prev) => {
                            const existing = prev.find((conversation) => conversation.id === conversationId);
                            if (!existing) {
                                return [{
                                    id: conversationId,
                                    title,
                                    messageCount: 0,
                                    updatedAt: new Date().toISOString(),
                                }, ...prev];
                            }
                            return prev.map((conversation) => (
                                conversation.id === conversationId
                                    ? { ...conversation, title }
                                    : conversation
                            ));
                        });
                    },
                    upsertArtifact: (artifactData) => {
                        setArtifacts((prev) => {
                            const next = new Map(prev);
                            next.set(artifactData.id, artifactData);
                            return next;
                        });
                    },
                    updateMessages: (updater) => {
                        updateState((prev) => ({
                            ...prev,
                            messages: updater(prev.messages),
                        }));
                    },
                    emitLedgerChanged: () => {
                        window.dispatchEvent(
                            new CustomEvent("litrev:ledger-changed", { detail: { projectId } }),
                        );
                    },
                    setPendingChoices,
                    setPendingUserInput,
                    onPlanStepUpdate: params.onPlanStepUpdate,
                    onNavigate,
                },
            );
            replayState = nextState;
        };

        const recoveryResult = await pollRunRecovery({
            conversationId: params.conversationId,
            runId: params.runId,
            signal: params.signal,
            onReplay: async (chunk) => applyRecoveryChunk(chunk),
            onTerminal: async (chunk) => applyRecoveryChunk(chunk),
        });

        if (recoveredConversationId && convo.currentConversationId === recoveredConversationId) {
            convo.markConversationActivity(recoveredConversationId);
        }

        return {
            outcome: recoveryResult.outcome,
            recommendation: recoveryResult.response?.recoveryRecommendation ?? "retry",
            activeRunId: recoveryResult.response?.runId ?? params.runId,
            lastActivityAt: recoveryResult.response?.lastActivityAt ?? null,
            runStatus: recoveryResult.response?.runStatus ?? null,
            abnormalEndClassification: recoveryResult.response?.abnormalEndClassification ?? null,
        };
    }, [
        buildProjectRecoverySeedState,
        convo,
        onNavigate,
        projectId,
        setArtifacts,
        setCurrentRunId,
        setPendingChoices,
        setPendingUserInput,
        stateRef,
        streamGenRef,
        updateState,
    ]);

    /**
     * Core stream lifecycle: fetch → parse → dispatch chunks.
     * Shared by sendMessage and executePlan. Manages abortController, streamGen, isLoading.
     */
    const runStream = useCallback(async (params: {
        body: Record<string, unknown>;
        page: CopilotPage;
        section?: string;
        convId: string | null;
        replaceRunId?: string | null;
        onPlanStepUpdate?: (planId: string, stepIndex: number, stepStatus: string) => void;
    }): Promise<{
        success: boolean;
        aborted: boolean;
        runStatus: string | null;
        stopReason: string | null;
        errorMessage: string | null;
        actualModel: string | null;
        actualModelSource: "provider" | "requested" | "unknown";
        terminalReason: StreamTerminalReason | null;
        runId: string | null;
        conversationId: string | null;
    }> => {
        const { body, page, section, convId, replaceRunId, onPlanStepUpdate } = params;
        let effectiveConvId = convId;

        // Stream lifecycle guards
        setIsLoading(true);
        setStreamPhase("streaming");
        streamGenRef.current++;
        const myGen = streamGenRef.current;

        const aiMessageId = `m-${Date.now() + 1}`;
        let aiMessageCreated = false;
        let fullContent = "";
        let reasoningContent = "";
        let reasoningState: "streaming" | "done" = "done";
        let reasoningTruncated = false;
        let activeReasoningId: string | null = null;
        let runningToolCallIds: string[] = [];
        let lastToolCallId: string | null = null;
        let syntheticToolCounter = 0;
        let localRunId = "";
        let completedPubmedSearchCount = 0;
        let lastPubmedSearchSize: number | null = null;
        let runStatus: string | null = null;
        let stopReason: string | null = null;
        let streamErrorMessage: string | null = null;
        let actualModel: string | null = null;
        let actualModelSource: "provider" | "requested" | "unknown" = "unknown";
        let unresolvedCountBeforeClear: number | null = null;
        let unresolvedCountAfterClear: number | null = null;
        let hasVisibleContent = false;
        let firstVisibleContentMs: number | null = null;
        let visibleChunkCount = 0;
        let visibleChunkChars = 0;
        let maxVisibleChunkChars: number | null = null;
        let visibleChunkGapTotalMs = 0;
        let visibleChunkGapCount = 0;
        let lastVisibleChunkAtMs: number | null = null;
        let terminalReason: StreamTerminalReason | null = null;
        let emittedTerminalError = false;
        let aborted = false;
        const requestKey = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `project-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        let terminalEventEmitted = false;
        const streamStartedAtMs = Date.now();

        recordReliabilityMetric({
            type: "reliability.v1.stream.started",
            surface: "project",
            projectId,
            conversationId: effectiveConvId,
            payload: {
                requestKey,
                phase: "project_stream",
            },
        });

        const emitTerminalMetric = (reason: StreamTerminalReason, status: string | null) => {
            if (terminalEventEmitted) return;
            terminalEventEmitted = true;
            recordReliabilityMetric({
                type: "reliability.v1.stream.terminal",
                surface: "project",
                projectId,
                conversationId: effectiveConvId,
                runId: localRunId || null,
                payload: {
                    requestKey,
                    phase: "project_stream",
                    reason,
                    runStatus: status,
                },
            });
        };
        const applyRecoveredTerminalState = (recoveredRunStatus: string | null | undefined) => {
            if (recoveredRunStatus && recoveredRunStatus !== "missing") {
                runStatus = recoveredRunStatus;
            }
            terminalReason = terminalReasonFromRunEnd({
                runStatus,
                stopReason: runStatus === "paused" ? "paused_for_input" : null,
            });
            const recoveredRunId = localRunId || currentRunId;
            if (recoveredRunId) {
                updateState((prev) => ({
                    ...prev,
                    messages: clearRunScopedRecoveryState({
                        items: prev.messages,
                        runId: recoveredRunId,
                        getErrorMeta: (message) => message.streamError,
                        getCheckpointMeta: (message) => message.checkpoint
                            ? {
                                runId: message.checkpoint.runId ?? null,
                                checkpointKind: message.checkpoint.checkpointKind ?? "standard",
                                label: message.checkpoint.label,
                            }
                            : null,
                    }),
                }));
            }
        };

        // Cancel any in-flight stream
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;
        userCancelRequestedRef.current = false;

        try {
            const requestBody = replaceRunId
                ? {
                    ...body,
                    options: {
                        ...(((body.options as Record<string, unknown> | undefined) ?? {})),
                        replaceRunId,
                    },
                }
                : body;

            const response = await fetch("/api/ai/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(requestBody),
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`AI request failed: ${response.statusText}`);
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("No response body");
            }

            const updateMessages = (updater: (messages: CopilotMessage[]) => CopilotMessage[]) => {
                updateState((prev) => ({
                    ...prev,
                    messages: updater(prev.messages),
                }));
            };

            const upsertConversationTitle = (targetId: string, title: string) => {
                convo.setConversations((prev) => {
                    const existing = prev.find((c) => c.id === targetId);
                    if (!existing) {
                        return [{
                            id: targetId,
                            title,
                            messageCount: 0,
                            updatedAt: new Date().toISOString(),
                        }, ...prev];
                    }
                    return prev.map((c) => (c.id === targetId ? { ...c, title } : c));
                });
            };

            const upsertArtifact = (artifactData: ArtifactData) => {
                setArtifacts((prev) => {
                    const next = new Map(prev);
                    next.set(artifactData.id, artifactData);
                    return next;
                });
            };

            const projectStreamDeps = {
                aiMessageId,
                page,
                section,
                projectId,
                myGen,
                getCurrentGen: () => streamGenRef.current,
                setCurrentRunId,
                syncConversationId: (conversationId: string) => {
                    if (convo.currentConversationIdRef.current !== conversationId) {
                        convo.setCurrentConversationId(conversationId);
                    }
                },
                upsertConversationTitle,
                upsertArtifact,
                updateMessages,
                emitLedgerChanged: () => {
                    window.dispatchEvent(
                        new CustomEvent("litrev:ledger-changed", { detail: { projectId } })
                    );
                },
                setPendingChoices,
                setPendingUserInput,
                onPlanStepUpdate,
                onNavigate,
            };

            if (progressiveAnswerStreamingEnabled) {
                const reservedState = reserveProjectCopilotAssistantTurn(
                    {
                        aiMessageCreated,
                        hasVisibleContent,
                        fullContent,
                        reasoningContent,
                        reasoningState,
                        reasoningTruncated,
                        activeReasoningId,
                        runningToolCallIds,
                        lastToolCallId,
                        syntheticToolCounter,
                        localRunId,
                        effectiveConvId,
                        completedPubmedSearchCount,
                        lastPubmedSearchSize,
                    },
                    projectStreamDeps,
                );
                aiMessageCreated = reservedState.aiMessageCreated;
                hasVisibleContent = reservedState.hasVisibleContent;
                fullContent = reservedState.fullContent;
                reasoningContent = reservedState.reasoningContent;
                reasoningState = reservedState.reasoningState;
                reasoningTruncated = reservedState.reasoningTruncated;
                activeReasoningId = reservedState.activeReasoningId;
                runningToolCallIds = reservedState.runningToolCallIds;
                lastToolCallId = reservedState.lastToolCallId;
                syntheticToolCounter = reservedState.syntheticToolCounter;
                localRunId = reservedState.localRunId;
                effectiveConvId = reservedState.effectiveConvId;
                completedPubmedSearchCount = reservedState.completedPubmedSearchCount;
                lastPubmedSearchSize = reservedState.lastPubmedSearchSize;
            }

            const applyChunk = (data: import("@/types/ai").AIStreamChunk) => {
                const runningToolCallIdsBeforeChunk = runningToolCallIds;
                const nextState = handleProjectCopilotStreamChunk(
                    data,
                    {
                        aiMessageCreated,
                        hasVisibleContent,
                        fullContent,
                        reasoningContent,
                        reasoningState,
                        reasoningTruncated,
                        activeReasoningId,
                        runningToolCallIds,
                        lastToolCallId,
                        syntheticToolCounter,
                        localRunId,
                        effectiveConvId,
                        completedPubmedSearchCount,
                        lastPubmedSearchSize,
                    },
                    projectStreamDeps
                );
                aiMessageCreated = nextState.aiMessageCreated;
                const previousContentLength = fullContent.length;
                hasVisibleContent = nextState.hasVisibleContent;
                fullContent = nextState.fullContent;
                reasoningContent = nextState.reasoningContent;
                reasoningState = nextState.reasoningState;
                reasoningTruncated = nextState.reasoningTruncated;
                activeReasoningId = nextState.activeReasoningId;
                runningToolCallIds = nextState.runningToolCallIds;
                lastToolCallId = nextState.lastToolCallId;
                syntheticToolCounter = nextState.syntheticToolCounter;
                localRunId = nextState.localRunId;
                effectiveConvId = nextState.effectiveConvId;
                completedPubmedSearchCount = nextState.completedPubmedSearchCount;
                lastPubmedSearchSize = nextState.lastPubmedSearchSize;
                const deltaChars = Math.max(0, nextState.fullContent.length - previousContentLength);
                if (deltaChars > 0) {
                    const nowMs = Date.now();
                    if (firstVisibleContentMs === null) {
                        firstVisibleContentMs = Math.max(0, nowMs - streamStartedAtMs);
                    } else if (lastVisibleChunkAtMs !== null) {
                        visibleChunkGapTotalMs += Math.max(0, nowMs - lastVisibleChunkAtMs);
                        visibleChunkGapCount += 1;
                    }
                    visibleChunkCount += 1;
                    visibleChunkChars += deltaChars;
                    maxVisibleChunkChars = maxVisibleChunkChars === null
                        ? deltaChars
                        : Math.max(maxVisibleChunkChars, deltaChars);
                    lastVisibleChunkAtMs = nowMs;
                }

                if (data.type === "tool_call") {
                    setStreamPhase("tool_running");
                } else if (data.type === "content" || data.type === "reasoning_start" || data.type === "reasoning_delta") {
                    setStreamPhase("streaming");
                } else if (data.type === "run_end") {
                    unresolvedCountBeforeClear = runningToolCallIdsBeforeChunk.length;
                    unresolvedCountAfterClear = nextState.runningToolCallIds.length;
                    runStatus = data.runStatus ?? runStatus;
                    actualModel = data.actualModel ?? actualModel;
                    actualModelSource = data.actualModelSource ?? actualModelSource;
                    setStreamPhase("completing");
                }
            };

            const attemptRecoveryFromAbnormalEnd = async (): Promise<boolean> => {
                if (!terminalReason || !shouldFailRunningToolsOnAbnormalEnd(terminalReason)) {
                    return false;
                }
                if (!localRunId || !effectiveConvId) {
                    return false;
                }

                setCurrentRunId(localRunId);
                updateState((prev) => ({
                    ...prev,
                    messages: interruptRunningProjectToolActivityMessages(
                        prev.messages.filter((message) => !message.progress),
                        RUN_RECOVERY_INTERRUPTED_TOOL_SUMMARY,
                    ),
                }));
                appendProjectRecoveryCheckpoint(page, section, localRunId, RUN_RECOVERY_RECONNECT_SUMMARY);

                const recoveryResult = await pollRunRecovery({
                    conversationId: effectiveConvId,
                    runId: localRunId,
                    signal: controller.signal,
                    onReplay: async (chunk) => applyChunk(chunk),
                    onTerminal: async (chunk) => applyChunk(chunk),
                });

                if (recoveryResult.outcome === "recovered") {
                    applyRecoveredTerminalState(recoveryResult.response?.runStatus ?? runStatus);
                    return true;
                }

                const recommendation = recoveryResult.response?.recoveryRecommendation
                    ?? (recoveryResult.outcome === "needs_user_action" ? "stop_and_retry" : "retry");
                const recoveryMessage = getRunRecoveryMessage(recoveryResult);
                const errorMeta = createRecoveryErrorEnvelope({
                    code: recoveryResult.outcome === "timeout"
                        ? "RUN_RECOVERY_TIMEOUT"
                        : recoveryResult.outcome === "needs_user_action"
                            ? "RUN_RECOVERY_REQUIRES_USER_ACTION"
                            : "RUN_RECOVERY_FAILED",
                    message: recoveryMessage,
                    runId: recoveryResult.response?.runId ?? localRunId,
                    activeRunId: recoveryResult.response?.runId ?? localRunId,
                    lastActivityAt: recoveryResult.response?.lastActivityAt ?? undefined,
                    recoveryRecommendation: recommendation,
                    retryable: recommendation === "retry",
                });
                appendProjectRecoveryError({
                    page,
                    section,
                    message: recoveryMessage,
                    errorMeta,
                });
                emittedTerminalError = true;
                setCurrentRunId(recommendation === "retry" ? null : (recoveryResult.response?.runId ?? localRunId));
                terminalReason = recoveryResult.outcome === "timeout" ? "timed_out" : "failed_interrupted";
                return false;
            };

            const summary = await processAIStream({
                reader,
                signal: controller.signal,
                shouldContinue: () => streamGenRef.current === myGen,
                throwOnErrorChunk: true,
                onChunk: applyChunk,
            });
            runStatus = summary.runStatus;
            stopReason = summary.stopReason;
            streamErrorMessage = summary.errorMessage ? formatStreamErrorForUI(summary.errorMessage) : null;
            actualModel = summary.actualModel;
            actualModelSource = summary.actualModelSource;
            terminalReason = summary.terminalReason;

            const recovered = await attemptRecoveryFromAbnormalEnd();
            if (!recovered && shouldFailRunningToolsOnAbnormalEnd(terminalReason)) {
                return {
                    success: false,
                    aborted: false,
                    runStatus,
                    stopReason,
                    errorMessage: streamErrorMessage,
                    actualModel,
                    actualModelSource,
                    terminalReason,
                    runId: localRunId || null,
                    conversationId: effectiveConvId,
                };
            }

            // Stale generation — skip refresh
            if (streamGenRef.current !== myGen) {
                emitTerminalMetric(terminalReason ?? "cancelled_by_user", runStatus);
                return {
                    success: false,
                    aborted: true,
                    runStatus,
                    stopReason,
                    errorMessage: streamErrorMessage,
                    actualModel,
                    actualModelSource,
                    terminalReason,
                    runId: localRunId || null,
                    conversationId: effectiveConvId,
                };
            }

            recordChatUnificationMetric({
                type: "stuck_running_tools_after_run_end",
                surface: "project",
                runId: localRunId || null,
                conversationId: effectiveConvId,
                projectId,
                payload: {
                    unresolvedCount: runningToolCallIds.length,
                    unresolvedCountBeforeClear,
                    unresolvedCountAfterClear,
                    runStatus,
                    streamPhase: "project_stream",
                },
            });

            if (
                effectiveConvId &&
                streamGenRef.current === myGen &&
                convo.currentConversationId === effectiveConvId
            ) {
                convo.markConversationActivity(effectiveConvId);
            }

            // Refresh conversation list to update titles/counts
            convo.loadConversations();
            emitTerminalMetric(terminalReason ?? "completed", runStatus);
            return {
                success: true,
                aborted: false,
                runStatus,
                stopReason,
                errorMessage: streamErrorMessage,
                actualModel,
                actualModelSource,
                terminalReason,
                runId: localRunId || null,
                conversationId: effectiveConvId,
            };
        } catch (error) {
            // Silently ignore aborted requests
            if (error instanceof DOMException && error.name === "AbortError") {
                aborted = true;
                terminalReason = terminalReasonFromThrownError(error, {
                    isUserAbort: userCancelRequestedRef.current,
                });
                emitTerminalMetric(terminalReason, runStatus);
                return {
                    success: false,
                    aborted: true,
                    runStatus,
                    stopReason,
                    errorMessage: streamErrorMessage,
                    actualModel,
                    actualModelSource,
                    terminalReason,
                    runId: localRunId || null,
                    conversationId: effectiveConvId,
                };
            }
            terminalReason = terminalReasonFromThrownError(error);
            if (
                terminalReason
                && shouldFailRunningToolsOnAbnormalEnd(terminalReason)
                && localRunId
                && effectiveConvId
            ) {
                setCurrentRunId(localRunId);
                updateState((prev) => ({
                    ...prev,
                    messages: interruptRunningProjectToolActivityMessages(
                        prev.messages.filter((message) => !message.progress),
                        RUN_RECOVERY_INTERRUPTED_TOOL_SUMMARY,
                    ),
                }));
                appendProjectRecoveryCheckpoint(page, section, localRunId, RUN_RECOVERY_RECONNECT_SUMMARY);
                const recoveryResult = await runProjectRecovery({
                    conversationId: effectiveConvId,
                    runId: localRunId,
                    page,
                    section,
                    signal: controller.signal,
                    onPlanStepUpdate,
                });
                if (recoveryResult.outcome === "recovered") {
                    applyRecoveredTerminalState(recoveryResult.runStatus ?? runStatus);
                    emitTerminalMetric(terminalReason, runStatus);
                    return {
                        success: isSuccessfulTerminalReason(terminalReason),
                        aborted: false,
                        runStatus,
                        stopReason,
                        errorMessage: streamErrorMessage,
                        actualModel,
                        actualModelSource,
                        terminalReason,
                        runId: localRunId || null,
                        conversationId: effectiveConvId,
                    };
                }
                const recoveryMessage = getRunRecoveryMessage(recoveryResult);
                const recoveryError = createRecoveryErrorEnvelope({
                    code: recoveryResult.outcome === "timeout"
                        ? "RUN_RECOVERY_TIMEOUT"
                        : recoveryResult.outcome === "needs_user_action"
                            ? "RUN_RECOVERY_REQUIRES_USER_ACTION"
                            : "RUN_RECOVERY_FAILED",
                    message: recoveryMessage,
                    runId: recoveryResult.activeRunId,
                    activeRunId: recoveryResult.activeRunId,
                    lastActivityAt: recoveryResult.lastActivityAt ?? undefined,
                    recoveryRecommendation: recoveryResult.recommendation,
                    retryable: recoveryResult.recommendation === "retry",
                });
                appendProjectRecoveryError({
                    page,
                    section,
                    message: recoveryMessage,
                    errorMeta: recoveryError,
                });
                emittedTerminalError = true;
                setCurrentRunId(recoveryResult.recommendation === "retry" ? null : recoveryResult.activeRunId);
                return {
                    success: false,
                    aborted: false,
                    runStatus,
                    stopReason,
                    errorMessage: recoveryMessage,
                    actualModel,
                    actualModelSource,
                    terminalReason,
                    runId: localRunId || null,
                    conversationId: effectiveConvId,
                };
            }
            emitTerminalMetric(terminalReason, runStatus);

            recordChatUnificationMetric({
                type: "stuck_running_tools_after_run_end",
                surface: "project",
                runId: localRunId || null,
                conversationId: effectiveConvId,
                projectId,
                payload: {
                    unresolvedCount: runningToolCallIds.length,
                    unresolvedCountBeforeClear,
                    unresolvedCountAfterClear,
                    runStatus,
                    streamPhase: "project_stream",
                },
            });

            console.error("AI chat error:", error);
            setPendingChoices([]);
            setPendingUserInput(null);
            const errorState = buildClientErrorState(error);
            updateState((prev) => {
                const visibleMessages = stripReservedAssistantMessages(prev.messages, aiMessageId);
                const errorMeta = {
                    ...errorState.errorMeta,
                    runId: localRunId ?? errorState.errorMeta.runId,
                };
                const reconciled = reconcileRunScopedRenderedErrors({
                    items: visibleMessages.filter((message) => message.sender === "ai"),
                    nextMessage: errorState.message,
                    nextMeta: errorMeta,
                    getMessage: (message) => message.text,
                    getErrorMeta: (message) => message.streamError,
                });
                const hasRenderedError = !reconciled.shouldAppend;
                const shouldSuppressFallback = shouldSuppressClientFallback({
                    errorMeta: errorMeta,
                    hasAssistantContent: hasCanonicalFailureFallbackText({
                        items: visibleMessages.filter((message) => message.sender === "ai" && !message.streamError),
                        streamError: errorMeta,
                        getText: (message) => message.text,
                    }),
                    hasRenderedError,
                });

                if (shouldSuppressFallback) {
                    emittedTerminalError = true;
                    return {
                        ...prev,
                        messages: visibleMessages.filter((message) =>
                            message.sender !== "ai" || reconciled.items.some((retained) => retained.id === message.id)
                        ),
                    };
                }

                emittedTerminalError = true;
                const nextMessage: CopilotMessage = {
                    id: aiMessageCreated ? `error-${Date.now()}` : aiMessageId,
                    sender: "ai",
                    text: errorState.message,
                    streamError: errorMeta,
                    createdAt: new Date().toISOString(),
                    context: { page, section },
                };

                return {
                    ...prev,
                    messages: [
                        ...visibleMessages.filter((message) =>
                            message.sender !== "ai" || reconciled.items.some((retained) => retained.id === message.id)
                        ),
                        nextMessage,
                    ],
                };
            });
            return {
                success: false,
                aborted: false,
                runStatus,
                stopReason,
                errorMessage: errorState.message,
                actualModel,
                actualModelSource,
                terminalReason,
                runId: localRunId || null,
                conversationId: effectiveConvId,
            };
        } finally {
            recordChatUnificationMetric({
                type: "answer_stream_delivery",
                surface: "project",
                runId: localRunId || null,
                conversationId: effectiveConvId,
                projectId,
                payload: {
                    requestKey,
                    streamPhase: "project_stream",
                    firstVisibleContentMs,
                    visibleChunkCount,
                    visibleChunkChars,
                    maxVisibleChunkChars,
                    meanVisibleChunkGapMs: visibleChunkGapCount > 0
                        ? visibleChunkGapTotalMs / visibleChunkGapCount
                        : null,
                },
            });
            if (streamGenRef.current === myGen) {
                setIsLoading(false);
                setStreamPhase("idle");
            }
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null;
            }
            if (
                streamGenRef.current === myGen
                && !aborted
                && shouldFailRunningToolsOnAbnormalEnd(terminalReason)
                && !emittedTerminalError
            ) {
                updateState((prev) => ({
                    ...prev,
                    messages: failRunningProjectToolActivityMessages(
                        prev.messages,
                        ABNORMAL_END_TOOL_FAILURE_SUMMARY,
                    ),
                }));
            }
            if (!aborted && terminalReason && shouldFailRunningToolsOnAbnormalEnd(terminalReason) && !emittedTerminalError) {
                const errorState = buildUnexpectedTerminalErrorState(terminalReason);
                updateState((prev) => {
                    const visibleMessages = stripReservedAssistantMessages(prev.messages, aiMessageId);
                    const nextStreamError: AIErrorEnvelope = {
                        ...errorState.errorMeta,
                        runId: localRunId ?? undefined,
                    };
                    const reconciled = reconcileRunScopedRenderedErrors({
                        items: visibleMessages.filter((message) => message.sender === "ai"),
                        nextMessage: errorState.message,
                        nextMeta: nextStreamError,
                        getMessage: (message) => message.text,
                        getErrorMeta: (message) => message.streamError,
                    });
                    const retainedMessageIds = new Set(reconciled.items.map((message) => message.id));
                    if (!reconciled.shouldAppend) {
                        emittedTerminalError = true;
                        return {
                            ...prev,
                            messages: visibleMessages.filter((message) => message.sender !== "ai" || retainedMessageIds.has(message.id)),
                        };
                    }
                    emittedTerminalError = true;
                    const nextMessage: CopilotMessage = {
                        id: aiMessageCreated ? `terminal-error-${Date.now()}` : aiMessageId,
                        sender: "ai",
                        text: errorState.message,
                        streamError: nextStreamError,
                        createdAt: new Date().toISOString(),
                        context: { page, section },
                    };
                    return {
                        ...prev,
                        messages: [
                            ...visibleMessages.filter((message) => message.sender !== "ai" || retainedMessageIds.has(message.id)),
                            nextMessage,
                        ],
                    };
                });
            }
        }
    }, [
        abortControllerRef,
        appendProjectRecoveryCheckpoint,
        appendProjectRecoveryError,
        convo,
        currentRunId,
        onNavigate,
        progressiveAnswerStreamingEnabled,
        projectId,
        runProjectRecovery,
        setArtifacts,
        setCurrentRunId,
        setIsLoading,
        setPendingChoices,
        setPendingUserInput,
        setStreamPhase,
        streamGenRef,
        stripReservedAssistantMessages,
        updateState,
    ]);

    const sendMessage = useCallback(
        async (
            text: string,
            page: CopilotPage,
            section?: string,
            model?: string,
            agentMode?: AgentMode,
            studyId?: string,
            retryModelExpectation?: RetryModelExpectation,
            contextTargets?: ContextCaptureTarget[],
            runtimeOverrides?: {
                replaceRunId?: string | null;
                continueFromRunId?: string | null;
                suppressUserMessageAppend?: boolean;
                userInputResolution?: UserInputResolution;
            },
        ) => {
            const trimmed = text.trim();
            const explicitUserInputResolution = runtimeOverrides?.userInputResolution ?? null;
            const attachment = pendingAttachment;
            if (!trimmed && !attachment && !explicitUserInputResolution) return;
            const continueFromRunId = runtimeOverrides?.continueFromRunId ?? null;
            const suppressUserMessageAppend = runtimeOverrides?.suppressUserMessageAppend === true;
            const replaceRunId = runtimeOverrides?.replaceRunId
                ?? (isLoadingRef.current ? currentRunId : null);
            if (isLoadingRef.current) cancelStream();
            setPendingChoices([]);
            setPendingUserInput(null);
            const resolutionTimestamp = new Date().toISOString();
            const userInputResolution = explicitUserInputResolution ?? (
                pendingUserInput?.sourceRunId
                    ? {
                        sourceRunId: pendingUserInput.sourceRunId,
                        callId: pendingUserInput.callId,
                        resolution: "cancelled" as const,
                        answerText: trimmed,
                        answeredAt: resolutionTimestamp,
                        decisionBoundaryKey: pendingUserInput.decisionBoundaryKey,
                    }
                    : null
            );

            const resolvedStudyId = studyId ?? (
                contextTargets?.length === 1 && contextTargets[0]?.kind === "study"
                    ? contextTargets[0].studyId
                    : undefined
            );

            // Determine conversation context based on page
            const conversationContext = resolvedStudyId ? "study" : "project";

            // Create conversation if needed
            let convId = convo.currentConversationId;
            if (!convId) {
                try {
                    const convResult = await createConversation({
                        projectId,
                        studyId: resolvedStudyId,
                        page,
                        context: conversationContext,
                    });
                    if (convResult.success) {
                        convId = convResult.data.id;
                        convo.setCurrentConversationId(convResult.data.id);
                        convo.markConversationActivity(convResult.data.id);
                    } else {
                        console.error("Failed to create conversation:", convResult.error);
                    }
                } catch (err) {
                    console.error("Failed to create conversation:", err);
                }
            }

            // Build attachment metadata and augmented message for AI
            let messageForAI = trimmed;
            let attachmentsMeta: CopilotMessageAttachment[] | undefined;

            if (attachment) {
                const sizeStr = attachment.size >= 1024 * 1024
                    ? `${(attachment.size / (1024 * 1024)).toFixed(1)} MB`
                    : `${Math.round(attachment.size / 1024)} KB`;
                const userText = trimmed || "I've attached a PDF. Please review it and summarize the key points.";
                messageForAI = `<attached_document filename="${attachment.filename}" size="${sizeStr}">\n${attachment.extractedText}\n</attached_document>\n\n${userText}`;
                attachmentsMeta = [{
                    fileAssetId: attachment.fileAssetId,
                    filename: attachment.filename,
                    size: attachment.size,
                    mimeType: attachment.mimeType,
                    isExisting: attachment.isExisting,
                }];
                setPendingAttachment(null);
            }

            if (contextTargets?.length) {
                attachmentsMeta = [
                    ...(attachmentsMeta ?? []),
                    ...contextTargets.map((target) => ({
                        type: "context_capture" as const,
                        target,
                    })),
                ];
            }

            // Add user message (display text only, not the augmented AI text)
            const displayText = trimmed || (attachment ? "I've attached a PDF. Please review it and summarize the key points." : "");
            const userMessage: CopilotMessage = {
                id: `m-${Date.now()}`,
                sender: "user",
                text: displayText,
                createdAt: new Date().toISOString(),
                context: { page, section },
                attachments: attachmentsMeta,
            };

            if (!suppressUserMessageAppend) {
                updateState((prev) => ({
                    ...prev,
                    messages: [...prev.messages, userMessage],
                }));
            }
            if (convId) {
                convo.markConversationActivity(convId);
            }

            if (retryModelExpectation) {
                recordChatUnificationMetric({
                    type: "retry_model_continuity",
                    surface: "project",
                    conversationId: convId ?? null,
                    projectId,
                    payload: {
                        requestKey: retryModelExpectation.requestKey,
                        expectedModel: retryModelExpectation.expectedModel,
                        source: retryModelExpectation.source,
                    },
                });
            }

            const reasoningRequest = resolveReasoningRequest({
                preferredMode: reasoningMode,
                modelId: model,
            });

            // Run the stream
            await runStream({
                body: {
                    userMessage: messageForAI,
                    context: conversationContext,
                    options: {
                        conversationId: convId ?? undefined,
                        projectId,
                        studyId: resolvedStudyId,
                        model,
                        reasoningMode: reasoningRequest.reasoningMode,
                        includeReasoning: reasoningRequest.includeReasoning,
                        reasoningBudgetTokens: reasoningRequest.reasoningBudgetTokens,
                        agentMode: agentMode || "general",
                        page,
                        section,
                        continueFromRunId: continueFromRunId ?? undefined,
                        persistUserMessage: suppressUserMessageAppend ? false : undefined,
                        persistedUserMessageContent: suppressUserMessageAppend ? undefined : displayText,
                        userInputResolution: userInputResolution ?? undefined,
                        userMessageAttachments: attachmentsMeta,
                        contextTargets,
                        telemetryRequestKey: retryModelExpectation?.requestKey,
                    },
                },
                page,
                section,
                convId,
                replaceRunId,
            });
        },
        [updateState, projectId, cancelStream, convo, pendingAttachment, pendingUserInput, reasoningMode, runStream, setPendingChoices, setPendingAttachment, setPendingUserInput, isLoadingRef, currentRunId]
    );

    const executePlanAction = useCallback(async (artifactId: string, selectedIndexes: number[]) => {
        const replaceRunId = isLoadingRef.current ? currentRunId : null;
        if (isLoadingRef.current) cancelStream();
        setPendingChoices([]);

        // Optimistic UI: set plan artifact status to "running"
        setArtifacts((prev) => {
            const next = new Map(prev);
            const existing = next.get(artifactId);
            if (existing) {
                next.set(artifactId, { ...existing, status: "running" as ArtifactStatus });
            }
            return next;
        });
        updateState((prev) => ({
            ...prev,
            messages: prev.messages.map((msg) =>
                msg.artifact?.id === artifactId
                    ? { ...msg, artifact: { ...msg.artifact, status: "running" as ArtifactStatus } }
                    : msg
            ),
        }));

        const conversationContext = convo.studyFilterRef.current ? "study" : "project";
        const convId = convo.currentConversationId;
        const planMessage = stateRef.current.messages.find((msg) => msg.artifact?.id === artifactId);
        const executionPage = planMessage?.context?.page ?? "overview";
        const reasoningRequest = resolveReasoningRequest({
            preferredMode: reasoningMode,
        });

        const result = await runStream({
            body: {
                planId: artifactId,
                selectedSteps: selectedIndexes,
                userMessage: "",
                context: conversationContext,
                options: {
                    conversationId: convId ?? undefined,
                    projectId,
                    reasoningMode: reasoningRequest.reasoningMode,
                    includeReasoning: reasoningRequest.includeReasoning,
                    reasoningBudgetTokens: reasoningRequest.reasoningBudgetTokens,
                },
            },
            page: executionPage,
            convId,
            replaceRunId,
            onPlanStepUpdate: (planId, stepIndex, stepStatus) => {
                // Update artifact payload step statuses
                setArtifacts((prev) => {
                    const next = new Map(prev);
                    const existing = next.get(planId);
                    if (existing && existing.payload && typeof existing.payload === "object") {
                        const payload = existing.payload as { steps?: Array<{ label: string; toolName?: string; description?: string; status: string }>; estimatedActions?: number };
                        if (!Array.isArray(payload.steps)) return next;
                        const updatedSteps = payload.steps.map((s, i) =>
                            i === stepIndex ? { ...s, status: stepStatus } : s
                        );
                        next.set(planId, { ...existing, payload: { ...payload, steps: updatedSteps } });
                    }
                    return next;
                });
                // Also update in message-level artifact
                updateState((prev) => ({
                    ...prev,
                    messages: prev.messages.map((msg) => {
                        if (msg.artifact?.id !== planId) return msg;
                        const payload = msg.artifact.payload as { steps?: Array<{ label: string; toolName?: string; description?: string; status: string }>; estimatedActions?: number };
                        if (!Array.isArray(payload.steps)) return msg;
                        const updatedSteps = payload.steps.map((s, i) =>
                            i === stepIndex ? { ...s, status: stepStatus } : s
                        );
                        return { ...msg, artifact: { ...msg.artifact, payload: { ...payload, steps: updatedSteps } } };
                    }),
                }));
            },
        });

        // Finalize local plan status based on stream result
        // Server already finalized — this updates the client-side optimistic state
        const didComplete = result.runStatus === "completed";
        const finalStatus: ArtifactStatus = didComplete ? "accepted" : "proposed";
        setArtifacts((prev) => {
            const next = new Map(prev);
            const existing = next.get(artifactId);
            if (existing) {
                next.set(artifactId, { ...existing, status: finalStatus });
            }
            return next;
        });
        updateState((prev) => ({
            ...prev,
            messages: prev.messages.map((msg) =>
                msg.artifact?.id === artifactId
                    ? { ...msg, artifact: { ...msg.artifact, status: finalStatus } }
                    : msg
            ),
        }));
        if (!didComplete && !result.aborted && result.success) {
            const reason = result.errorMessage
                ?? (result.stopReason ? `Execution stopped: ${result.stopReason}` : "Execution did not complete.");
            const feedback: CopilotMessage = {
                id: `plan-feedback-${Date.now()}`,
                sender: "ai",
                text: `Plan execution failed: ${reason}`,
                createdAt: new Date().toISOString(),
                context: { page: executionPage },
            };
            updateState((prev) => ({
                ...prev,
                messages: [...prev.messages, feedback],
            }));
        }
    }, [cancelStream, convo, currentRunId, projectId, reasoningMode, runStream, updateState, setArtifacts, setPendingChoices, isLoadingRef, stateRef]);

    const reviewArtifactActionLocal = useCallback(async (
        artifactId: string,
        status: "accepted" | "rejected",
        note?: string,
        editedPayload?: Record<string, unknown>,
    ): Promise<boolean> => {
        // Call server action (passes editedPayload for edit-then-accept flow)
        const result = await reviewArtifactAction(artifactId, status, note, editedPayload);
        if (!result.success || !result.artifact) {
            console.error("Failed to review artifact:", result.errorCode ?? result.error);
            appendProjectArtifactActionError({
                message: result.error ?? "Artifact review failed.",
                errorCode: result.errorCode,
            });
            return false;
        }

        const reviewedAt = result.artifact.reviewedAt instanceof Date
            ? result.artifact.reviewedAt.toISOString()
            : typeof result.artifact.reviewedAt === "string"
                ? result.artifact.reviewedAt
                : null;
        const appliedAt = result.artifact.appliedAt instanceof Date
            ? result.artifact.appliedAt.toISOString()
            : typeof result.artifact.appliedAt === "string"
                ? result.artifact.appliedAt
                : null;

        setArtifacts((prev) => {
            const next = new Map(prev);
            const existing = next.get(artifactId);
            if (existing) {
                next.set(artifactId, {
                    ...existing,
                    status: result.artifact.status as ArtifactStatus,
                    reviewedAt: reviewedAt ?? existing.reviewedAt,
                    reviewNote: result.artifact.reviewNote ?? null,
                    payload: result.artifact.payload ?? existing.payload,
                    appliedAt: appliedAt ?? existing.appliedAt,
                });
            }
            return next;
        });

        updateState((prev) => ({
            ...prev,
            messages: prev.messages.map((msg) => {
                if (msg.artifact?.id !== artifactId) return msg;
                const currentArtifact = msg.artifact;
                return {
                    ...msg,
                    artifact: {
                        ...currentArtifact,
                        status: result.artifact.status as ArtifactStatus,
                        payload: (result.artifact.payload ?? currentArtifact.payload) as typeof currentArtifact.payload,
                    },
                };
            }),
        }));

        if (status === "accepted" && result.artifact) {
            const domains = getChangedDomainsForAcceptedArtifact(result.artifact.type, result.artifact.payload);
            if (domains.length > 0) {
                const protocolPatch = isProtocolLiveSyncV1Enabled()
                    ? getProtocolPatchForAcceptedArtifact(result.artifact.type, result.artifact.payload)
                    : null;
                dispatchProjectDataChanged({
                    projectId,
                    domains,
                    reason: "artifact_accept",
                    source: "artifact_review",
                    protocolPatch: protocolPatch ?? undefined,
                });
            }
        }
        return true;
    }, [appendProjectArtifactActionError, projectId, updateState, setArtifacts]);

    const undoArtifactActionLocal = useCallback(async (artifactId: string): Promise<boolean> => {
        const result = await undoArtifactAction(artifactId);
        if (!result.success || !result.artifact) {
            console.error("Failed to undo artifact:", result.error);
            appendProjectArtifactActionError({
                message: result.error ?? "Artifact undo failed.",
                errorCode: result.errorCode,
            });
            return false;
        }

        const reviewedAt = new Date().toISOString();
        setArtifacts((prev) => {
            const next = new Map(prev);
            const existing = next.get(artifactId);
            if (existing) {
                next.set(artifactId, {
                    ...existing,
                    status: result.artifact.status as ArtifactStatus,
                    reviewedAt,
                    reviewNote: result.artifact.reviewNote ?? "Undone by user",
                });
            }
            return next;
        });

        updateState((prev) => ({
            ...prev,
            messages: prev.messages.map((msg) =>
                msg.artifact?.id === artifactId
                    ? {
                        ...msg,
                        artifact: {
                            ...msg.artifact,
                            status: result.artifact?.status as ArtifactStatus,
                        },
                    }
                    : msg
            ),
        }));

        if (result.artifact.projectId) {
            const domains = getChangedDomainsForAcceptedArtifact(result.artifact.type, result.artifact.payload);
            if (domains.length > 0) {
                const protocolPatch = isProtocolLiveSyncV1Enabled()
                    ? getProtocolPatchForAcceptedArtifact(result.artifact.type, result.artifact.payload)
                    : null;
                dispatchProjectDataChanged({
                    projectId: result.artifact.projectId,
                    domains,
                    reason: "server_mutation",
                    source: "artifact_undo",
                    protocolPatch: protocolPatch ?? undefined,
                });
            }
        }
        return true;
    }, [appendProjectArtifactActionError, setArtifacts, updateState]);

    const dispatchArtifactAction = useCallback(async (action: ArtifactActionContract): Promise<void> => {
        if (action.type === "artifact.execute_plan") {
            await executePlanAction(action.artifactId, action.selectedIndexes);
            return;
        }
        if (action.type === "artifact.review") {
            await reviewArtifactActionLocal(
                action.artifactId,
                action.status,
                action.note,
                action.editedPayload,
            );
            return;
        }
        if (action.type === "artifact.undo") {
            await undoArtifactActionLocal(action.artifactId);
        }
    }, [executePlanAction, reviewArtifactActionLocal, undoArtifactActionLocal]);

    const executePlan = useCallback(async (artifactId: string, selectedIndexes: number[]): Promise<void> => {
        await dispatchArtifactAction({
            type: "artifact.execute_plan",
            artifactId,
            selectedIndexes,
        });
    }, [dispatchArtifactAction]);

    const handleReviewArtifact = useCallback(async (
        artifactId: string,
        status: "accepted" | "rejected",
        note?: string,
        editedPayload?: Record<string, unknown>,
    ): Promise<void> => {
        await dispatchArtifactAction({
            type: "artifact.review",
            artifactId,
            status,
            note,
            editedPayload,
        });
    }, [dispatchArtifactAction]);

    const handleUndoArtifact = useCallback(async (artifactId: string): Promise<void> => {
        await dispatchArtifactAction({
            type: "artifact.undo",
            artifactId,
        });
    }, [dispatchArtifactAction]);

    const approveArtifactsBatch = useCallback(async (
        artifactIds: string[],
        options?: {
            shouldStop?: () => boolean;
            onProgress?: (completed: number, total: number) => void;
            conversationId?: string;
        },
    ): Promise<ApproveArtifactsBatchResult> => {
        const uniqueArtifactIds = [...new Set(artifactIds.filter(Boolean))];
        const total = uniqueArtifactIds.length;
        const startConversationId = options?.conversationId ?? convo.currentConversationIdRef.current ?? null;
        let completed = 0;
        let approvedCount = 0;
        const failedArtifactIds: string[] = [];

        for (const artifactId of uniqueArtifactIds) {
            if (options?.shouldStop?.()) {
                return { approvedCount, failedArtifactIds, stopped: true };
            }
            if ((convo.currentConversationIdRef.current ?? null) !== startConversationId) {
                return { approvedCount, failedArtifactIds, stopped: true };
            }

            const success = await reviewArtifactActionLocal(artifactId, "accepted");
            completed += 1;
            options?.onProgress?.(completed, total);
            if (success) approvedCount += 1;
            else failedArtifactIds.push(artifactId);
        }

        return { approvedCount, failedArtifactIds, stopped: false };
    }, [reviewArtifactActionLocal, convo]);

    const reconnectRun = useCallback(async (runId?: string | null) => {
        const conversationId = convo.currentConversationIdRef.current ?? null;
        const activeRunId = runId ?? currentRunId ?? null;
        if (!conversationId || !activeRunId) return;

        const contextMessage = [...stateRef.current.messages]
            .reverse()
            .find((message) => message.context?.page);
        const recoveryPage = contextMessage?.context?.page ?? "overview";
        const recoverySection = contextMessage?.context?.section;

        setIsLoading(true);
        setStreamPhase("streaming");
        setCurrentRunId(activeRunId);
        streamGenRef.current += 1;
        const myGen = streamGenRef.current;

        updateState((prev) => ({
            ...prev,
            messages: interruptRunningProjectToolActivityMessages(
                prev.messages.filter((message) => !message.progress),
                RUN_RECOVERY_INTERRUPTED_TOOL_SUMMARY,
            ),
        }));
        appendProjectRecoveryCheckpoint(recoveryPage, recoverySection, activeRunId, RUN_RECOVERY_RECONNECT_SUMMARY);

        try {
            const recoveryResult = await runProjectRecovery({
                conversationId,
                runId: activeRunId,
                page: recoveryPage,
                section: recoverySection,
            });
            if (recoveryResult.outcome === "recovered") {
                return;
            }
            const recoveryMessage = getRunRecoveryMessage(recoveryResult);
            appendProjectRecoveryError({
                page: recoveryPage,
                section: recoverySection,
                message: recoveryMessage,
                errorMeta: createRecoveryErrorEnvelope({
                    code: recoveryResult.outcome === "timeout"
                        ? "RUN_RECOVERY_TIMEOUT"
                        : recoveryResult.outcome === "needs_user_action"
                            ? "RUN_RECOVERY_REQUIRES_USER_ACTION"
                            : "RUN_RECOVERY_FAILED",
                    message: recoveryMessage,
                    runId: recoveryResult.activeRunId,
                    activeRunId: recoveryResult.activeRunId,
                    lastActivityAt: recoveryResult.lastActivityAt ?? undefined,
                    recoveryRecommendation: recoveryResult.recommendation,
                    retryable: recoveryResult.recommendation === "retry",
                }),
            });
            setCurrentRunId(recoveryResult.recommendation === "retry" ? null : recoveryResult.activeRunId);
        } finally {
            if (streamGenRef.current === myGen) {
                setIsLoading(false);
                setStreamPhase("idle");
            }
        }
    }, [
        appendProjectRecoveryCheckpoint,
        appendProjectRecoveryError,
        convo,
        currentRunId,
        runProjectRecovery,
        setCurrentRunId,
        setIsLoading,
        setStreamPhase,
        stateRef,
        streamGenRef,
        updateState,
    ]);

    return {
        cancelStream,
        runStream,
        sendMessage,
        executePlanAction,
        reviewArtifactActionLocal,
        dispatchArtifactAction,
        executePlan,
        handleReviewArtifact,
        handleUndoArtifact,
        approveArtifactsBatch,
        reconnectRun,
    };
}
