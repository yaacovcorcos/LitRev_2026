"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import {
    CopilotMessage,
    CopilotMessageAttachment,
    ProjectCopilotState,
    loadProjectCopilotState,
    saveProjectCopilotState,
    createDefaultProjectCopilotState,
} from "@/lib/projectCopilotStorage";
import { processAIStream } from "@/lib/ai/stream-processor";
import { dispatchProjectDataChanged, getChangedDomainsForAcceptedArtifact } from "@/lib/project-data-events";
import { createConversation } from "@/app/actions/conversations";
import {
    uploadChatAttachmentAction,
    extractTextFromExistingFileAction,
} from "@/app/actions/files";
import { reviewArtifactAction, getAutonomyConfigAction, updateAutonomyAction } from "@/app/actions/agent";
import { useCopilotConversations } from "@/hooks/useCopilotConversations";
import type { ArtifactData, ArtifactStatus, ArtifactType } from "@/types/artifacts";
import type { AgentMode, AutonomyPreset, AutonomyLevel } from "@/types/agent";
import type { ChoiceOption, CopilotPage, ReasoningMode, StreamPhase } from "@/types/ai";
import { useRouter } from "next/navigation";
import { handleProjectCopilotStreamChunk } from "@/contexts/project-copilot-stream-events";
import type { ArtifactActionContract } from "@/lib/artifacts/action-contract";
import {
    getReasoningModePreference,
    setReasoningModePreference,
    shouldRequestReasoning,
} from "@/lib/ai/reasoning-visibility";
import type {
    PendingAttachment,
    ApproveArtifactsBatchResult,
    ProjectCopilotContextValue,
} from "@/types/copilot-context";

export type { PendingAttachment } from "@/types/copilot-context";


const ProjectCopilotContext = createContext<ProjectCopilotContextValue | undefined>(undefined);

type ProjectCopilotProviderProps = {
    projectId: string;
    children: ReactNode;
};

export function ProjectCopilotProvider({ projectId, children }: ProjectCopilotProviderProps) {
    const router = useRouter();
    const [state, setState] = useState<ProjectCopilotState>(createDefaultProjectCopilotState());
    const stateRef = useRef<ProjectCopilotState>(createDefaultProjectCopilotState());
    const [isLoading, setIsLoading] = useState(false);
    const [streamPhase, setStreamPhase] = useState<StreamPhase>("idle");
    const [reasoningMode, setReasoningModeState] = useState<ReasoningMode>(() => getReasoningModePreference());
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const abortControllerRef = useRef<AbortController | null>(null);
    const streamGenRef = useRef(0);
    const isLoadingRef = useRef(false);

    // Attachment state
    const [pendingAttachment, setPendingAttachment] = useState<PendingAttachment | null>(null);
    const [isAttaching, setIsAttaching] = useState(false);

    // Agent run state (Phase 2)
    const [currentRunId, setCurrentRunId] = useState<string | null>(null);
    const [artifacts, setArtifacts] = useState<Map<string, ArtifactData>>(new Map());

    const shouldOfferSummary = state.messages.length > 20;

    // AI-generated clickable choices
    const [pendingChoices, setPendingChoices] = useState<ChoiceOption[]>([]);

    // Autonomy configuration state (Phase 7)
    const [autonomyPreset, setAutonomyPreset] = useState<AutonomyPreset>("assisted");
    const [autonomyToolOverrides, setAutonomyToolOverrides] = useState<Record<string, AutonomyLevel>>({});
    const [showAutonomySettings, setShowAutonomySettings] = useState(false);

    // Load panel state from localStorage on mount (not messages - those come from conversations)
    useEffect(() => {
        if (projectId) {
            // Only load panel state (width, collapsed), not messages
            const local = loadProjectCopilotState(projectId);
            setState(prev => ({
                ...prev,
                panel: local.panel,
                // Messages will be loaded from the conversation system
                messages: [],
            }));
        }
    }, [projectId]);

    const setReasoningMode = useCallback((mode: ReasoningMode) => {
        setReasoningModeState(mode);
        setReasoningModePreference(mode);
    }, []);

    // Load autonomy config on mount (Phase 7)
    useEffect(() => {
        getAutonomyConfigAction(projectId)
            .then((result) => {
                if (result.success && result.config) {
                    setAutonomyPreset(result.config.preset as AutonomyPreset);
                    setAutonomyToolOverrides(
                        (result.config.toolOverrides ?? {}) as Record<string, AutonomyLevel>,
                    );
                }
            })
            .catch(console.error);
    }, [projectId]);

    // Mirror isLoading to ref so sendMessage can read it without stale closures
    useEffect(() => { isLoadingRef.current = isLoading; }, [isLoading]);
    useEffect(() => { stateRef.current = state; }, [state]);

    const updateAutonomyPreset = useCallback(async (preset: AutonomyPreset) => {
        setAutonomyPreset(preset);
        setAutonomyToolOverrides({});
        await updateAutonomyAction(preset, undefined, projectId).catch(console.error);
    }, [projectId]);

    const updateAutonomyOverrides = useCallback(async (overrides: Record<string, AutonomyLevel>) => {
        setAutonomyToolOverrides(overrides);
        setAutonomyPreset("custom");
        await updateAutonomyAction("custom", overrides, projectId).catch(console.error);
    }, [projectId]);

    const resetToPreset = useCallback(async (preset: AutonomyPreset) => {
        setAutonomyPreset(preset);
        setAutonomyToolOverrides({});
        await updateAutonomyAction(preset, undefined, projectId).catch(console.error);
    }, [projectId]);

    // Save panel state with debounce (messages are saved via conversation system)
    const scheduleSave = useCallback(
        (next: ProjectCopilotState) => {
            if (!projectId) return;
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
            saveTimerRef.current = setTimeout(() => {
                // Only save panel state to localStorage, not messages
                const panelOnlyState: ProjectCopilotState = {
                    ...next,
                    messages: [], // Don't persist messages to localStorage
                };
                saveProjectCopilotState(projectId, panelOnlyState);
            }, 400);
        },
        [projectId]
    );

    const updateState = useCallback(
        (updater: (prev: ProjectCopilotState) => ProjectCopilotState) => {
            setState((prev) => {
                const next = updater(prev);
                if (next === prev) return prev;
                scheduleSave(next);
                return next;
            });
        },
        [scheduleSave]
    );

    useEffect(() => {
        return () => {
            if (saveTimerRef.current) {
                clearTimeout(saveTimerRef.current);
            }
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
        };
    }, []);

    const toggleCollapsed = useCallback(() => {
        updateState((prev) => ({
            ...prev,
            panel: { ...prev.panel, collapsed: !prev.panel.collapsed },
        }));
    }, [updateState]);

    const setCollapsed = useCallback(
        (collapsed: boolean) => {
            updateState((prev) => ({
                ...prev,
                panel: { ...prev.panel, collapsed },
            }));
        },
        [updateState]
    );

    const setPanelWidth = useCallback(
        (width: number) => {
            updateState((prev) => ({
                ...prev,
                panel: { ...prev.panel, width, collapsed: false },
            }));
        },
        [updateState]
    );

    // Conversation management (extracted hook)
    const convo = useCopilotConversations({
        projectId,
        updateState,
        setState,
        stateRef,
        artifacts,
        setArtifacts,
        streamGenRef,
        abortControllerRef,
        setIsLoading,
        setCurrentRunId,
        setPendingChoices,
    });

    const attachFile = useCallback(async (file: File) => {
        if (!projectId) return;
        setIsAttaching(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const result = await uploadChatAttachmentAction(projectId, formData);
            if (!result.success) {
                console.error("Failed to upload attachment:", result.error);
                return;
            }
            setPendingAttachment({
                fileAssetId: result.data.fileAssetId,
                filename: result.data.filename,
                size: result.data.size,
                mimeType: result.data.mimeType,
                extractedText: result.data.extractedText,
                isExisting: false,
            });
        } catch (err) {
            console.error("Failed to upload attachment:", err);
        } finally {
            setIsAttaching(false);
        }
    }, [projectId]);

    const attachExistingFile = useCallback(async (fileAssetId: string) => {
        if (!projectId) return;
        setIsAttaching(true);
        try {
            const result = await extractTextFromExistingFileAction(projectId, fileAssetId);
            if (!result.success) {
                console.error("Failed to attach existing file:", result.error);
                return;
            }
            setPendingAttachment({
                fileAssetId: result.data.fileAssetId,
                filename: result.data.filename,
                size: result.data.size,
                mimeType: result.data.mimeType,
                extractedText: result.data.extractedText,
                isExisting: true,
            });
        } catch (err) {
            console.error("Failed to attach existing file:", err);
        } finally {
            setIsAttaching(false);
        }
    }, [projectId]);

    const clearAttachment = useCallback(() => {
        setPendingAttachment(null);
    }, []);

    const cancelStream = useCallback(() => {
        streamGenRef.current++;
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
        setIsLoading(false);
        setPendingChoices([]);
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
                                window.dispatchEvent(
                                    new CustomEvent("litrev:ledger-changed", { detail: { projectId } })
                                );
                            },
                            setPendingChoices,
                            onPlanStepUpdate,
                            onNavigate: (url) => router.push(url),
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
    }, [updateState, projectId, convo]);

    const sendMessage = useCallback(
        async (text: string, page: CopilotPage, section?: string, model?: string, agentMode?: AgentMode, studyId?: string) => {
            const trimmed = text.trim();
            const attachment = pendingAttachment;
            if (!trimmed && !attachment) return;
            if (isLoadingRef.current) cancelStream();
            setPendingChoices([]);

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
        [updateState, projectId, cancelStream, convo, pendingAttachment, reasoningMode, runStream]
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
    }, [cancelStream, convo, projectId, reasoningMode, runStream, updateState]);

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
    }, [projectId, updateState]);

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
    }, [reviewArtifactActionLocal]);

    const clearMessages = useCallback(() => {
        updateState((prev) => ({
            ...prev,
            messages: [],
        }));
        convo.setCurrentConversationId(null);
        setPendingChoices([]);
    }, [updateState, convo]);

    const clearChoices = useCallback(() => setPendingChoices([]), []);

    const value = useMemo(
        () => ({
            state,
            messages: state.messages,
            isCollapsed: state.panel.collapsed,
            panelWidth: state.panel.width,
            isLoading,
            streamPhase,
            canAct: !isLoading,
            reasoningMode,
            toggleCollapsed,
            setCollapsed,
            setPanelWidth,
            sendMessage,
            setReasoningMode,
            cancelStream,
            clearMessages,
            // Conversation management (from hook)
            conversations: convo.conversations,
            currentConversationId: convo.currentConversationId,
            isLoadingConversations: convo.isLoadingConversations,
            showConversationList: convo.showConversationList,
            toggleConversationList: convo.toggleConversationList,
            selectConversation: convo.selectConversation,
            newConversation: convo.newConversation,
            renameConversation: convo.renameConversation,
            deleteConversation: convo.deleteConversation,
            branchConversation: convo.branchConversation,
            refreshConversations: convo.loadConversations,
            setStudyFilter: convo.setStudyFilter,
            // Attachment support
            pendingAttachment,
            isAttaching,
            attachFile,
            attachExistingFile,
            clearAttachment,
            projectId,
            // Agent run state (Phase 2)
            currentRunId,
            artifacts,
            handleReviewArtifact,
            approveArtifactsBatch,
            executePlan,
            // Summarize & fresh
            shouldOfferSummary,
            summarizeAndRefresh: convo.summarizeAndRefresh,
            isSummarizing: convo.isSummarizing,
            isConversationLoading: convo.isConversationLoading,
            // Autonomy configuration (Phase 7)
            autonomyPreset,
            autonomyToolOverrides,
            showAutonomySettings,
            setShowAutonomySettings,
            updateAutonomyPreset,
            updateAutonomyOverrides,
            resetToPreset,
            // AI-generated clickable choices
            pendingChoices,
            clearChoices,
            // Message pagination
            hasMore: convo.hasMore,
            isLoadingOlder: convo.isLoadingOlder,
            loadOlderMessages: convo.loadOlderMessages,
        }),
        [
            state,
            isLoading,
            streamPhase,
            reasoningMode,
            toggleCollapsed,
            setCollapsed,
            setPanelWidth,
            sendMessage,
            setReasoningMode,
            cancelStream,
            clearMessages,
            convo,
            pendingAttachment,
            isAttaching,
            attachFile,
            attachExistingFile,
            clearAttachment,
            currentRunId,
            artifacts,
            handleReviewArtifact,
            approveArtifactsBatch,
            executePlan,
            shouldOfferSummary,
            autonomyPreset,
            autonomyToolOverrides,
            showAutonomySettings,
            updateAutonomyPreset,
            updateAutonomyOverrides,
            resetToPreset,
            pendingChoices,
            clearChoices,
        ]
    );

    return (
        <ProjectCopilotContext.Provider value={value}>
            {children}
        </ProjectCopilotContext.Provider>
    );
}

export function useProjectCopilot() {
    const ctx = useContext(ProjectCopilotContext);
    if (!ctx) {
        throw new Error("useProjectCopilot must be used within ProjectCopilotProvider");
    }
    return ctx;
}

/** Safe accessor — returns undefined outside ProjectCopilotProvider (no throw) */
export function useProjectCopilotSafe() {
    return useContext(ProjectCopilotContext);
}

/** Streaming gate hook — returns whether the user can interact with artifact actions. */
export function useStreamingGate() {
    const { isLoading, streamPhase, canAct } = useProjectCopilot();
    return { isStreaming: isLoading, streamPhase, canAct };
}
