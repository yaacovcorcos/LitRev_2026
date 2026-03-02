/**
 * Custom hook encapsulating all stream and artifact action logic
 * extracted from ProjectCopilotContext.tsx for maintainability.
 * Combines C-3 (stream) and C-4 (artifacts) extractions.
 */
import { useCallback } from "react";
import type {
    CopilotMessage,
    CopilotMessageAttachment,
    ProjectCopilotState,
} from "@/lib/projectCopilotStorage";
import { processAIStream } from "@/lib/ai/stream-processor";
import { dispatchProjectDataChanged, getChangedDomainsForAcceptedArtifact } from "@/lib/project-data-events";
import { createConversation } from "@/app/actions/conversations";
import { reviewArtifactAction } from "@/app/actions/agent";
import type { ArtifactData, ArtifactStatus } from "@/types/artifacts";
import type { AgentMode, AutonomyPreset, AutonomyLevel } from "@/types/agent";
import type { ChoiceOption, CopilotPage, ReasoningMode, StreamPhase, UserInputRequest } from "@/types/ai";
import { handleProjectCopilotStreamChunk } from "@/contexts/project-copilot-stream-events";
import type { ArtifactActionContract } from "@/lib/artifacts/action-contract";
import { shouldRequestReasoning } from "@/lib/ai/reasoning-visibility";
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
        setArtifacts,
        pendingAttachment,
        setPendingAttachment,
        reasoningMode,
        convo,
        onNavigate,
    } = deps;

    const cancelStream = useCallback(() => {
        streamGenRef.current++;
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsLoading(false);
        setPendingChoices([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    /**
     * Core stream lifecycle: fetch → parse → dispatch chunks.
     * Shared by sendMessage and executePlan. Manages abortController, streamGen, isLoading.
     */
    const runStream = useCallback(async (params: {
        body: Record<string, unknown>;
        page: CopilotPage;
        section?: string;
        convId: string | null;
        onPlanStepUpdate?: (planId: string, stepIndex: number, stepStatus: string) => void;
    }): Promise<{ success: boolean; aborted: boolean; runStatus: string | null; stopReason: string | null; errorMessage: string | null }> => {
        const { body, page, section, convId, onPlanStepUpdate } = params;
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
        let localRunId = "";
        let runStatus: string | null = null;
        let stopReason: string | null = null;
        let streamErrorMessage: string | null = null;

        // Cancel any in-flight stream
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
        const controller = new AbortController();
        abortControllerRef.current = controller;

        try {
            const response = await fetch("/api/ai/stream", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
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

            const summary = await processAIStream({
                reader,
                signal: controller.signal,
                shouldContinue: () => streamGenRef.current === myGen,
                throwOnErrorChunk: true,
                onChunk: (data) => {
                    const nextState = handleProjectCopilotStreamChunk(
                        data,
                        {
                            aiMessageCreated,
                            fullContent,
                            reasoningContent,
                            reasoningState,
                            reasoningTruncated,
                            activeReasoningId,
                            localRunId,
                            effectiveConvId,
                        },
                        {
                            aiMessageId,
                            page,
                            section,
                            projectId,
                            myGen,
                            getCurrentGen: () => streamGenRef.current,
                            setCurrentRunId,
                            syncConversationId: (conversationId) => {
                                if (convo.currentConversationIdRef.current !== conversationId) {
                                    convo.setCurrentConversationId(conversationId);
                                }
                            },
                            upsertConversationTitle,
                            upsertArtifact,
                            updateMessages,
                            emitLedgerChanged: () => {
                                dispatchProjectDataChanged({
                                    projectId,
                                    domains: ["ledger"],
                                    source: "stream_tool_result",
                                });
                            },
                            setPendingChoices,
                            setPendingUserInput,
                            onPlanStepUpdate,
                            onNavigate,
                        }
                    );
                    aiMessageCreated = nextState.aiMessageCreated;
                    fullContent = nextState.fullContent;
                    reasoningContent = nextState.reasoningContent;
                    reasoningState = nextState.reasoningState;
                    reasoningTruncated = nextState.reasoningTruncated;
                    activeReasoningId = nextState.activeReasoningId;
                    localRunId = nextState.localRunId;
                    effectiveConvId = nextState.effectiveConvId;

                    // Update stream phase based on chunk type
                    if (data.type === "tool_call") {
                        setStreamPhase("tool_running");
                    } else if (data.type === "content" || data.type === "reasoning_start" || data.type === "reasoning_delta") {
                        setStreamPhase("streaming");
                    } else if (data.type === "run_end") {
                        setStreamPhase("completing");
                    }
                },
            });
            runStatus = summary.runStatus;
            stopReason = summary.stopReason;
            streamErrorMessage = summary.errorMessage;

            // Stale generation — skip refresh
            if (streamGenRef.current !== myGen) {
                return { success: false, aborted: true, runStatus, stopReason, errorMessage: streamErrorMessage };
            }

            // Refresh conversation list to update titles/counts
            convo.loadConversations();
            return { success: true, aborted: false, runStatus, stopReason, errorMessage: streamErrorMessage };
        } catch (error) {
            // Silently ignore aborted requests
            if (error instanceof DOMException && error.name === "AbortError") {
                return { success: false, aborted: true, runStatus, stopReason, errorMessage: streamErrorMessage };
            }

            console.error("AI chat error:", error);
            setPendingChoices([]);
            setPendingUserInput(null);
            const errorText = `Sorry, I encountered an error: ${error instanceof Error ? error.message : "Unknown error"}. Please try again.`;

            if (!aiMessageCreated) {
                const aiMessage: CopilotMessage = {
                    id: aiMessageId,
                    sender: "ai",
                    text: errorText,
                    createdAt: new Date().toISOString(),
                    context: { page, section },
                };
                updateState((prev) => ({
                    ...prev,
                    messages: [...prev.messages, aiMessage],
                }));
            } else {
                updateState((prev) => ({
                    ...prev,
                    messages: prev.messages.map((msg) =>
                        msg.id === aiMessageId
                            ? { ...msg, text: fullContent + "\n\n" + errorText }
                            : msg
                    ),
                }));
            }
            return {
                success: false,
                aborted: false,
                runStatus,
                stopReason,
                errorMessage: error instanceof Error ? error.message : streamErrorMessage,
            };
        } finally {
            if (streamGenRef.current === myGen) {
                setIsLoading(false);
                setStreamPhase("idle");
            }
            if (abortControllerRef.current === controller) {
                abortControllerRef.current = null;
            }
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [updateState, projectId, convo]);

    const sendMessage = useCallback(
        async (text: string, page: CopilotPage, section?: string, model?: string, agentMode?: AgentMode, studyId?: string) => {
            const trimmed = text.trim();
            const attachment = pendingAttachment;
            if (!trimmed && !attachment) return;
            if (isLoadingRef.current) cancelStream();
            setPendingChoices([]);
            setPendingUserInput(null);

            // Determine conversation context based on page
            const conversationContext = studyId ? "study" : "project";

            // Create conversation if needed
            let convId = convo.currentConversationId;
            if (!convId) {
                try {
                    const convResult = await createConversation({
                        projectId,
                        studyId,
                        page,
                        context: conversationContext,
                    });
                    if (convResult.success) {
                        convId = convResult.data.id;
                        convo.setCurrentConversationId(convResult.data.id);
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

            updateState((prev) => ({
                ...prev,
                messages: [...prev.messages, userMessage],
            }));

            // Run the stream
            await runStream({
                body: {
                    userMessage: messageForAI,
                    context: conversationContext,
                    options: {
                        conversationId: convId ?? undefined,
                        projectId,
                        studyId,
                        model,
                        reasoningMode,
                        includeReasoning: shouldRequestReasoning(reasoningMode),
                        reasoningBudgetTokens: shouldRequestReasoning(reasoningMode) ? 4096 : undefined,
                        agentMode: agentMode || "general",
                        page,
                        section,
                        persistedUserMessageContent: displayText,
                        userMessageAttachments: attachmentsMeta,
                    },
                },
                page,
                section,
                convId,
            });
        },
        [updateState, projectId, cancelStream, convo, pendingAttachment, reasoningMode, runStream, setPendingChoices, setPendingAttachment, isLoadingRef]
    );

    const executePlanAction = useCallback(async (artifactId: string, selectedIndexes: number[]) => {
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

        const result = await runStream({
            body: {
                planId: artifactId,
                selectedSteps: selectedIndexes,
                userMessage: "",
                context: conversationContext,
                options: {
                    conversationId: convId ?? undefined,
                    projectId,
                    reasoningMode,
                    includeReasoning: shouldRequestReasoning(reasoningMode),
                    reasoningBudgetTokens: shouldRequestReasoning(reasoningMode) ? 4096 : undefined,
                    agentMode: "general",
                },
            },
            page: executionPage,
            convId,
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
    }, [cancelStream, convo, projectId, reasoningMode, runStream, updateState, setArtifacts, setPendingChoices, isLoadingRef, stateRef]);

    const reviewArtifactActionLocal = useCallback(async (
        artifactId: string,
        status: "accepted" | "rejected",
        note?: string,
        editedPayload?: Record<string, unknown>,
    ): Promise<boolean> => {
        // Optimistic update — artifacts map
        setArtifacts((prev) => {
            const next = new Map(prev);
            const existing = next.get(artifactId);
            if (existing) {
                next.set(artifactId, { ...existing, status, reviewedAt: new Date().toISOString(), reviewNote: note ?? null });
            }
            return next;
        });

        // Optimistic update — message-level artifact status (drives TimelineRenderer)
        updateState((prev) => ({
            ...prev,
            messages: prev.messages.map((msg) =>
                msg.artifact?.id === artifactId
                    ? { ...msg, artifact: { ...msg.artifact, status } }
                    : msg
            ),
        }));

        // Call server action (passes editedPayload for edit-then-accept flow)
        const result = await reviewArtifactAction(artifactId, status, note, editedPayload);
        if (!result.success) {
            console.error("Failed to review artifact:", result.error);
            // Revert optimistic update on failure
            setArtifacts((prev) => {
                const next = new Map(prev);
                const existing = next.get(artifactId);
                if (existing) {
                    next.set(artifactId, { ...existing, status: "proposed", reviewedAt: null, reviewNote: null });
                }
                return next;
            });
            updateState((prev) => ({
                ...prev,
                messages: prev.messages.map((msg) =>
                    msg.artifact?.id === artifactId
                        ? { ...msg, artifact: { ...msg.artifact, status: "proposed" } }
                        : msg
                ),
            }));
            return false;
        }

        if (status === "accepted" && result.artifact) {
            const domains = getChangedDomainsForAcceptedArtifact(result.artifact.type, result.artifact.payload);
            if (domains.length > 0) {
                dispatchProjectDataChanged({
                    projectId,
                    domains,
                    source: "artifact_review",
                });
            }
        }
        return true;
    }, [projectId, updateState, setArtifacts]);

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
        }
    }, [executePlanAction, reviewArtifactActionLocal]);

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

    return {
        cancelStream,
        runStream,
        sendMessage,
        executePlanAction,
        reviewArtifactActionLocal,
        dispatchArtifactAction,
        executePlan,
        handleReviewArtifact,
        approveArtifactsBatch,
    };
}
