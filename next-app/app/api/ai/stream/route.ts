/**
 * AI Chat Streaming API Route
 * Handles streaming chat responses
 * Uses Node runtime for Prisma compatibility
 */

import { NextRequest } from "next/server";
import { buildDecisionResolutionFromUserInput } from "@/lib/ai/decision-requests";
import { resolveUserInputQuestionId } from "@/lib/ai/user-input";
import { createAIService, getAIService } from "@/lib/server/ai";
import type { AIMessage, ChatOptions, ConversationContext } from "@/types/ai";
import type { AgentMode } from "@/types/agent";
import type { ChatUnificationMetricType, ClarificationRuntimePayload } from "@/types/chat-unification";
import { normalizeStreamChunk, toWireChunk, type RuntimeStreamEvent } from "@/lib/server/chat-runtime/events";
import { ChatRuntime } from "@/lib/server/chat-runtime/runtime";
import { RuntimeThreadContext } from "@/lib/server/chat-runtime/thread";
import { StreamCoalescer } from "@/lib/server/ai/stream-coalescer";
import { getProgressiveAnswerStreamingConfig } from "@/lib/feature-flags";
import { runWithActorContext } from "@/lib/server/actor";
import { requireApiSession } from "@/lib/server/auth/session";
import { assertProjectAccess, assertStudyAccess } from "@/lib/server/access";
import {
    buildStreamErrorChunk,
    extractAIErrorEnvelope,
} from "@/lib/ai/error-envelope";
import type { PopupChatContext } from "@/types/popup-chat";
import { buildPopupSystemPrompt } from "@/lib/server/ai/popup-context";
import { createPopupToolGuard, getAllowedPopupToolNames } from "@/lib/server/ai/popup-tool-contract";
import { getToolDefinitions } from "@/lib/server/ai/tools";
import { isPopupToolsEnabled } from "@/lib/ai/popup-feature-flags";
import { ingestChatUnificationMetric } from "@/lib/server/chat-unification-metrics";
import {
    buildRunEndObservedPayload,
    deriveChatUnificationStreamPhase,
    deriveChatUnificationSurface,
} from "@/lib/server/ai/chat-unification-runtime-metrics";
import type { ContextCaptureTarget } from "@/types/context-capture";
import { buildContextCapturePromptBlock } from "@/lib/server/ai/context-capture";
import { logServerError, logServerWarn } from "@/lib/server/logging";
import { resolveRequestedContinuation } from "@/lib/server/agent/requested-continuation";
import { settleClarificationDismissedRun } from "@/lib/server/agent/run";
import {
    buildClarificationResolutionUserMessage,
    buildUserInputResolutionContinuationContext,
    hydrateClarificationControllerState,
    persistUserInputResolution,
    resolvePendingUserInputSource,
    resolveDecisionBoundaryKey,
} from "@/lib/server/ai/clarification-controller";

// Force Node runtime for Prisma compatibility
export const runtime = "nodejs";

const STREAM_EVENT_TYPES: RuntimeStreamEvent["type"][] = [
    "content",
    "reasoning_start",
    "reasoning_delta",
    "reasoning_end",
    "tool_call",
    "tool_result",
    "done",
    "error",
    "artifact",
    "progress",
    "checkpoint",
    "run_start",
    "run_end",
    "conversation_title",
    "choices",
    "plan_step_update",
    "navigate",
    "user_input_required",
    "user_input_resolved",
];

function normalizeOptionalRunId(value: string | undefined): string | undefined {
    const normalized = value?.trim();
    return normalized ? normalized : undefined;
}

export async function POST(request: NextRequest) {
    try {
        const progressiveStreaming = getProgressiveAnswerStreamingConfig();
        const authResult = await requireApiSession(request);
        if (!authResult.ok) return authResult.response;

        type StreamRouteOptions = ChatOptions & {
            projectId?: string;
            studyId?: string;
            agentMode?: AgentMode;
            page?: string;
            section?: string;
            planId?: string;
            popupMode?: boolean;
            continuationContext?: string;
        };

        const body = await request.json();
        const { messages, userMessage, context, options, planId, selectedSteps } = body as {
            messages?: AIMessage[];
            userMessage?: string;
            context?: ConversationContext;
            options?: StreamRouteOptions;
            planId?: string;
            selectedSteps?: number[];
            popupContext?: PopupChatContext;
        };

        if (options?.replaceRunId !== undefined && typeof options.replaceRunId !== "string") {
            return new Response(
                JSON.stringify({ error: "replaceRunId must be a string when provided" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
            );
        }

        if (options?.continueFromRunId !== undefined && typeof options.continueFromRunId !== "string") {
            return new Response(
                JSON.stringify({ error: "continueFromRunId must be a string when provided" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
            );
        }

        if (options?.preferContinueFromRunId !== undefined && typeof options.preferContinueFromRunId !== "string") {
            return new Response(
                JSON.stringify({ error: "preferContinueFromRunId must be a string when provided" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
            );
        }

        const normalizedReplaceRunId = normalizeOptionalRunId(options?.replaceRunId);
        const normalizedContinueFromRunId = normalizeOptionalRunId(options?.continueFromRunId);
        const normalizedPreferContinueFromRunId = normalizeOptionalRunId(options?.preferContinueFromRunId);

        if (normalizedContinueFromRunId && !options?.conversationId) {
            return new Response(
                JSON.stringify({ error: "continueFromRunId requires conversationId" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
            );
        }

        if (normalizedPreferContinueFromRunId && !options?.conversationId) {
            return new Response(
                JSON.stringify({ error: "preferContinueFromRunId requires conversationId" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
            );
        }

        if (
            normalizedContinueFromRunId
            && normalizedPreferContinueFromRunId
            && normalizedContinueFromRunId !== normalizedPreferContinueFromRunId
        ) {
            return new Response(
                JSON.stringify({ error: "continueFromRunId and preferContinueFromRunId must match when both are provided" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
            );
        }

        if (
            normalizedReplaceRunId
            && normalizedContinueFromRunId
            && normalizedReplaceRunId !== normalizedContinueFromRunId
        ) {
            return new Response(
                JSON.stringify({ error: "replaceRunId and continueFromRunId must match when both are provided" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
            );
        }

        if (
            normalizedReplaceRunId
            && normalizedPreferContinueFromRunId
            && normalizedReplaceRunId !== normalizedPreferContinueFromRunId
        ) {
            return new Response(
                JSON.stringify({ error: "replaceRunId and preferContinueFromRunId must match when both are provided" }),
                { status: 400, headers: { "Content-Type": "application/json" } },
            );
        }

        let scopedProjectId = options?.projectId;
        let scopedStudyId = options?.studyId;

        // Validate project ownership before allowing any tool execution
        if (scopedProjectId) {
            try {
                await assertProjectAccess(
                    { ownerId: authResult.context.userId, workspaceId: authResult.context.workspaceId },
                    scopedProjectId,
                );
            } catch {
                return new Response(
                    JSON.stringify({ error: "Project not found or access denied" }),
                    { status: 403, headers: { "Content-Type": "application/json" } },
                );
            }
        }

        if (scopedStudyId) {
            try {
                const scope = await assertStudyAccess(
                    { ownerId: authResult.context.userId, workspaceId: authResult.context.workspaceId },
                    scopedStudyId,
                    scopedProjectId,
                );
                scopedProjectId = scope.projectId;
                scopedStudyId = scope.studyId;
            } catch {
                return new Response(
                    JSON.stringify({ error: "Study not found or access denied" }),
                    { status: 403, headers: { "Content-Type": "application/json" } },
                );
            }
        }

        if (body.popupContext && body.options?.popupMode) {
            const popupContext = body.popupContext as PopupChatContext;
            if (!scopedProjectId || popupContext.projectId !== scopedProjectId) {
                return new Response(
                    JSON.stringify({ error: "Popup context project mismatch" }),
                    { status: 400, headers: { "Content-Type": "application/json" } },
                );
            }
        }

        const contextTargets = Array.isArray(options?.contextTargets)
            ? options.contextTargets as ContextCaptureTarget[]
            : [];

        if (contextTargets.length > 0) {
            if (!scopedProjectId) {
                return new Response(
                    JSON.stringify({ error: "Context capture targets require a project scope" }),
                    { status: 400, headers: { "Content-Type": "application/json" } },
                );
            }
            const hasMismatch = contextTargets.some((target) => target.projectId !== scopedProjectId);
            if (hasMismatch) {
                return new Response(
                    JSON.stringify({ error: "Context capture target project mismatch" }),
                    { status: 400, headers: { "Content-Type": "application/json" } },
                );
            }
        }

        const contextCapturePrompt = contextTargets.length > 0
            ? buildContextCapturePromptBlock(contextTargets)
            : "";

        const service = getAIService();
        const scopedOptions: StreamRouteOptions = {
            ...options,
            projectId: scopedProjectId,
            studyId: scopedStudyId,
            replaceRunId: normalizedReplaceRunId,
            continueFromRunId: normalizedContinueFromRunId,
            preferContinueFromRunId: normalizedPreferContinueFromRunId,
            additionalContext: [options?.additionalContext, contextCapturePrompt].filter(Boolean).join("\n\n") || undefined,
            userId: authResult.context.userId,
            workspaceId: authResult.context.workspaceId,
        };

        // Create a readable stream
        const encoder = new TextEncoder();
        let streamClosed = false;
        let coalescer: StreamCoalescer | null = null;
        const writeRuntimeEvent = (controller: ReadableStreamDefaultController<Uint8Array>, event: RuntimeStreamEvent) => {
            if (streamClosed) return;
            const data = JSON.stringify(toWireChunk(event)) + "\n";
            try {
                controller.enqueue(encoder.encode(data));
            } catch (error) {
                streamClosed = true;
                logServerWarn("ai-stream-route", "client stream closed before runtime emission", {
                    eventType: event.type,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        };
        const stream = new ReadableStream({
            async start(controller) {
                await runWithActorContext(authResult.context, async () => {
                    const isPopupRequest = Boolean(body.popupContext && body.options?.popupMode);
                    const popupContext = body.popupContext as PopupChatContext | undefined;
                    const runtimeRouter = new ChatRuntime();
                    const thread = new RuntimeThreadContext((event) => {
                        writeRuntimeEvent(controller, event);
                    });
                    coalescer = new StreamCoalescer({
                        contentCadence: progressiveStreaming.enabled
                            ? {
                                firstFlushMinChars: progressiveStreaming.contentFirstFlushMinChars,
                                firstFlushIdleMs: progressiveStreaming.contentFirstFlushIdleMs,
                                minChars: progressiveStreaming.contentMinChars,
                                maxChars: progressiveStreaming.contentMaxChars,
                                idleMs: progressiveStreaming.contentIdleMs,
                            }
                            : undefined,
                        reasoningCadence: progressiveStreaming.enabled
                            ? {
                                minChars: progressiveStreaming.reasoningMinChars,
                                maxChars: progressiveStreaming.reasoningMaxChars,
                                idleMs: progressiveStreaming.reasoningIdleMs,
                            }
                            : undefined,
                        onEmit: async (event) => {
                            await runtimeRouter.dispatch(event, thread);
                        },
                    });
                    const mergedPlanId = planId ?? options?.planId;
                    let runtimeOptions: StreamRouteOptions = {
                        ...scopedOptions,
                        replaceRunId: scopedOptions.replaceRunId ?? scopedOptions.continueFromRunId,
                    };
                    let surface = deriveChatUnificationSurface(runtimeOptions);
                    let streamPhase = deriveChatUnificationStreamPhase({
                        options: runtimeOptions,
                        isPlanExecution: Boolean(mergedPlanId),
                    });
                    const streamStartedAtMs = Date.now();
                    let firstProviderContentMs: number | null = null;
                    let lastRunEnd: RuntimeStreamEvent | null = null;
                    let effectiveUserMessage = userMessage ?? "";
                    let clarificationResumeMetricPayload: ClarificationRuntimePayload | null = null;
                    let clarificationResumeRunId: string | null = null;
                    let clarificationResumeConversationId: string | null = runtimeOptions.conversationId ?? null;
                    let clarificationResumeStarted = false;
                    let clarificationResumeFailureRecorded = false;
                    let handledClarificationResolutionWithoutStream = false;
                    const maybeRecordRunEndMetric = async () => {
                        if (!lastRunEnd || lastRunEnd.type !== "run_end") return;
                        if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") return;
                        try {
                            await ingestChatUnificationMetric(authResult.context, {
                                eventId: crypto.randomUUID(),
                                type: "run_end_observed",
                                surface,
                                runId: lastRunEnd.runId ?? null,
                                conversationId: lastRunEnd.conversationId ?? null,
                                projectId: runtimeOptions.projectId ?? null,
                                payload: buildRunEndObservedPayload({
                                    requestKey: runtimeOptions.telemetryRequestKey ?? null,
                                    runStatus: lastRunEnd.runStatus ?? null,
                                    streamPhase,
                                    actualModel: lastRunEnd.actualModel ?? null,
                                    actualModelSource: lastRunEnd.actualModelSource ?? "unknown",
                                    firstProviderContentMs,
                                }),
                            });
                        } catch (error) {
                            logServerError("ai-stream-route", "failed to ingest run end observed metric", {
                                surface,
                                runId: lastRunEnd.runId ?? null,
                                conversationId: lastRunEnd.conversationId ?? null,
                            }, error);
                        }
                    };
                    const emitClarificationRuntimeMetric = async (
                        type: ChatUnificationMetricType,
                        payload: ClarificationRuntimePayload,
                        runId?: string | null,
                        conversationId?: string | null,
                    ) => {
                        if (typeof crypto === "undefined" || typeof crypto.randomUUID !== "function") return;
                        try {
                            await ingestChatUnificationMetric(authResult.context, {
                                eventId: crypto.randomUUID(),
                                type,
                                surface,
                                runId: runId ?? null,
                                conversationId: conversationId ?? runtimeOptions.conversationId ?? null,
                                projectId: runtimeOptions.projectId ?? null,
                                payload,
                            });
                        } catch (error) {
                            logServerError("ai-stream-route", "failed to ingest clarification runtime metric", {
                                type,
                                surface,
                                runId: runId ?? null,
                                conversationId: conversationId ?? runtimeOptions.conversationId ?? null,
                                projectId: runtimeOptions.projectId ?? null,
                            }, error);
                        }
                    };
                    runtimeRouter.use(async ({ event, thread: runtimeThread }, next) => {
                        if (event.conversationId) runtimeThread.bindConversation(event.conversationId);
                        if (event.type === "run_start" && event.runId) runtimeThread.bindRun(event.runId);
                        await next();
                        if (event.type === "run_end") runtimeThread.bindRun(undefined);
                    });
                    for (const eventType of STREAM_EVENT_TYPES) {
                        runtimeRouter.on(eventType, async ({ event, thread: runtimeThread }) => {
                            await runtimeThread.emit(event);
                        });
                    }

                    try {
                        let resolutionContinuationContext: string | undefined;
                        if (runtimeOptions.userInputResolution) {
                            clarificationResumeMetricPayload = {
                                resolution: runtimeOptions.userInputResolution.resolution,
                                decisionBoundaryKey: runtimeOptions.userInputResolution.decisionBoundaryKey ?? null,
                                fallbackAction: null,
                                reason: null,
                            };
                            clarificationResumeRunId = runtimeOptions.userInputResolution.sourceRunId;
                            clarificationResumeConversationId = runtimeOptions.conversationId ?? null;
                            await emitClarificationRuntimeMetric(
                                "ask_user_answer_submitted",
                                clarificationResumeMetricPayload,
                                clarificationResumeRunId,
                                clarificationResumeConversationId,
                            );
                            let pendingUserInputSource;
                            try {
                                pendingUserInputSource = await resolvePendingUserInputSource({
                                    sourceRunId: runtimeOptions.userInputResolution.sourceRunId,
                                    conversationId: runtimeOptions.conversationId ?? null,
                                    callId: runtimeOptions.userInputResolution.callId,
                                });
                            } catch (error) {
                                await emitClarificationRuntimeMetric(
                                    "ask_user_unknown_call_id",
                                    clarificationResumeMetricPayload,
                                    clarificationResumeRunId,
                                    clarificationResumeConversationId,
                                );
                                clarificationResumeFailureRecorded = true;
                                throw error;
                            }
                            const resolvedUserInputBase = {
                                ...runtimeOptions.userInputResolution,
                                sourceRunId: pendingUserInputSource.sourceRunId,
                                callId: pendingUserInputSource.request.callId,
                                questionId: resolveUserInputQuestionId(
                                    runtimeOptions.userInputResolution.questionId
                                        ?? pendingUserInputSource.request.questionId,
                                    pendingUserInputSource.request.callId,
                                ),
                                decisionBoundaryKey: runtimeOptions.userInputResolution.decisionBoundaryKey
                                    ?? resolveDecisionBoundaryKey({
                                        decisionBoundaryKey: pendingUserInputSource.request.decisionBoundaryKey ?? null,
                                        question: pendingUserInputSource.request.question,
                                    }),
                            };
                            const resolvedUserInput = {
                                ...resolvedUserInputBase,
                                decisionResolution: buildDecisionResolutionFromUserInput({
                                    request: pendingUserInputSource.request,
                                    resolution: resolvedUserInputBase,
                                }),
                            };
                            clarificationResumeMetricPayload = {
                                resolution: resolvedUserInput.resolution,
                                decisionBoundaryKey: resolvedUserInput.decisionBoundaryKey ?? null,
                                fallbackAction: null,
                                reason: null,
                            };
                            clarificationResumeRunId = resolvedUserInput.sourceRunId;
                            clarificationResumeConversationId =
                                pendingUserInputSource.conversationId ?? runtimeOptions.conversationId ?? null;

                            if (
                                runtimeOptions.continueFromRunId
                                && runtimeOptions.continueFromRunId !== pendingUserInputSource.sourceRunId
                            ) {
                                await emitClarificationRuntimeMetric(
                                    "ask_user_answer_resume_failed",
                                    clarificationResumeMetricPayload,
                                    clarificationResumeRunId,
                                    clarificationResumeConversationId,
                                );
                                clarificationResumeFailureRecorded = true;
                                throw new Error("continueFromRunId must match the blocked clarification source run.");
                            }

                            await persistUserInputResolution({
                                resolution: resolvedUserInput,
                                request: pendingUserInputSource.request,
                            });
                            await coalescer.push({
                                type: "user_input_resolved",
                                userInputResolution: resolvedUserInput,
                                conversationId: pendingUserInputSource.conversationId ?? runtimeOptions.conversationId,
                            });
                            const explicitUserMessage = userMessage?.trim() ?? "";
                            const isCancelledResolution = resolvedUserInput.resolution === "cancelled";
                            const startsFreshRun = isCancelledResolution && explicitUserMessage.length > 0;
                            const isTerminalDismissal = isCancelledResolution && explicitUserMessage.length === 0;

                            if (isTerminalDismissal) {
                                await settleClarificationDismissedRun(
                                    pendingUserInputSource.sourceRunId,
                                    { requireActive: true },
                                );
                                runtimeOptions = {
                                    ...runtimeOptions,
                                    continueFromRunId: undefined,
                                    preferContinueFromRunId: undefined,
                                    replaceRunId: undefined,
                                    parentRunId: undefined,
                                    userInputResolution: undefined,
                                };
                                resolutionContinuationContext = undefined;
                                lastRunEnd = {
                                    type: "run_end",
                                    runId: pendingUserInputSource.sourceRunId,
                                    runStatus: "cancelled",
                                    stopReason: "cancelled",
                                    conversationId: pendingUserInputSource.conversationId ?? runtimeOptions.conversationId ?? undefined,
                                };
                                await coalescer.push(lastRunEnd);
                                handledClarificationResolutionWithoutStream = true;
                                await emitClarificationRuntimeMetric(
                                    "ask_user_cancelled",
                                    clarificationResumeMetricPayload,
                                    clarificationResumeRunId,
                                    clarificationResumeConversationId,
                                );
                            } else if (startsFreshRun) {
                                await settleClarificationDismissedRun(
                                    pendingUserInputSource.sourceRunId,
                                    { requireActive: true },
                                );
                                runtimeOptions = {
                                    ...runtimeOptions,
                                    continueFromRunId: undefined,
                                    preferContinueFromRunId: undefined,
                                    replaceRunId: undefined,
                                    parentRunId: undefined,
                                    userInputResolution: undefined,
                                };
                                effectiveUserMessage = explicitUserMessage;
                                await emitClarificationRuntimeMetric(
                                    "ask_user_cancelled",
                                    clarificationResumeMetricPayload,
                                    clarificationResumeRunId,
                                    clarificationResumeConversationId,
                                );
                            } else {
                                runtimeOptions = {
                                    ...runtimeOptions,
                                    continueFromRunId: runtimeOptions.continueFromRunId ?? pendingUserInputSource.sourceRunId,
                                    replaceRunId: runtimeOptions.replaceRunId ?? pendingUserInputSource.sourceRunId,
                                    persistUserMessage: false,
                                    persistedUserMessageContent: undefined,
                                    persistedUserMessageId: undefined,
                                    userInputResolution: resolvedUserInput,
                                };
                                effectiveUserMessage = buildClarificationResolutionUserMessage({
                                    userMessage,
                                    request: pendingUserInputSource.request,
                                    resolution: resolvedUserInput,
                                });
                                const clarificationControllerState = await hydrateClarificationControllerState({
                                    sourceRunId: pendingUserInputSource.sourceRunId,
                                });
                                resolutionContinuationContext = buildUserInputResolutionContinuationContext({
                                    request: pendingUserInputSource.request,
                                    resolution: resolvedUserInput,
                                    controllerState: clarificationControllerState,
                                });
                                runtimeOptions = {
                                    ...runtimeOptions,
                                    parentRunId: pendingUserInputSource.sourceRunId,
                                };
                                clarificationResumeStarted = true;
                                await emitClarificationRuntimeMetric(
                                    "ask_user_answer_resume_started",
                                    clarificationResumeMetricPayload,
                                    clarificationResumeRunId,
                                    clarificationResumeConversationId,
                                );
                                if (resolvedUserInput.resolution === "accept_recommended") {
                                    await emitClarificationRuntimeMetric(
                                        "ask_user_recommended_default_used",
                                        clarificationResumeMetricPayload,
                                        clarificationResumeRunId,
                                        clarificationResumeConversationId,
                                    );
                                }
                            }
                        }

                        if (!handledClarificationResolutionWithoutStream) {
                            const resolvedRequestedContinuation = resolutionContinuationContext
                                ? {
                                    sourceRunId: runtimeOptions.continueFromRunId ?? scopedOptions.continueFromRunId ?? null,
                                    continuationContext: resolutionContinuationContext,
                                  }
                                : await resolveRequestedContinuation({
                                    conversationId: scopedOptions.conversationId ?? null,
                                    continueFromRunId:
                                        runtimeOptions.continueFromRunId ?? scopedOptions.continueFromRunId,
                                    preferContinueFromRunId:
                                        runtimeOptions.preferContinueFromRunId ?? scopedOptions.preferContinueFromRunId,
                                  });
                            runtimeOptions = {
                                ...runtimeOptions,
                                continueFromRunId: resolvedRequestedContinuation.sourceRunId ?? undefined,
                                preferContinueFromRunId: undefined,
                                continuationContext: resolvedRequestedContinuation.continuationContext,
                            };
                        }
                        surface = deriveChatUnificationSurface(runtimeOptions);
                        streamPhase = deriveChatUnificationStreamPhase({
                            options: runtimeOptions,
                            isPlanExecution: Boolean(mergedPlanId),
                        });

                        if (handledClarificationResolutionWithoutStream) {
                            // Structured blocked-card cancel is terminal: the request is resolved and the
                            // client receives a synthetic cancelled run_end without starting a new run.
                        }
                        // If using conversation memory — use artifact-aware streaming
                        else if ((effectiveUserMessage || planId || runtimeOptions.userInputResolution) && context) {
                            for await (const chunk of service.streamChatWithArtifacts(
                                effectiveUserMessage || "", context, {
                                    ...runtimeOptions,
                                    planId: mergedPlanId,
                                    selectedSteps,
                                    signal: request.signal,
                                }
                            )) {
                                const normalized = normalizeStreamChunk(chunk);
                                if (!normalized) continue;
                                if (firstProviderContentMs === null && normalized.type === "content" && normalized.content) {
                                    firstProviderContentMs = Math.max(0, Date.now() - streamStartedAtMs);
                                }
                                if (normalized.type === "run_end") {
                                    lastRunEnd = normalized;
                                }
                                await coalescer.push(normalized);
                            }
                        }
                        // Direct message streaming
                        else if (messages && messages.length > 0) {
                            if (isPopupRequest && popupContext && runtimeOptions.projectId && popupContext.projectId === runtimeOptions.projectId) {
                                const latestUserMessage = [...messages].reverse().find((msg) => msg.role === "user")?.content ?? "";
                                const popupSystemPrompt = await buildPopupSystemPrompt({
                                    popupContext,
                                    userId: authResult.context.userId,
                                    workspaceId: authResult.context.workspaceId,
                                    userQuery: latestUserMessage,
                                    page: runtimeOptions.page,
                                    section: runtimeOptions.section,
                                });
                                const popupMessages: AIMessage[] = [
                                    {
                                        id: `popup-system-${Date.now()}`,
                                        role: "system",
                                        content: popupSystemPrompt,
                                        createdAt: new Date().toISOString(),
                                    },
                                    ...messages.filter((msg) => msg.role !== "system"),
                                ];

                                if (isPopupToolsEnabled()) {
                                    const allowedToolNames = new Set(getAllowedPopupToolNames());
                                    const popupToolDefinitions = getToolDefinitions(undefined, "project")
                                        .filter((tool) => allowedToolNames.has(tool.name));
                                    const popupService = createAIService({
                                        toolMiddlewares: [
                                            createPopupToolGuard({ popupContext, projectId: runtimeOptions.projectId }),
                                        ],
                                    });

                                    for await (const chunk of popupService.streamChatWithTools(
                                        popupMessages,
                                        {
                                            ...runtimeOptions,
                                            tools: popupToolDefinitions,
                                            signal: request.signal,
                                        },
                                    )) {
                                        const normalized = normalizeStreamChunk(chunk);
                                        if (!normalized) continue;
                                        if (firstProviderContentMs === null && normalized.type === "content" && normalized.content) {
                                            firstProviderContentMs = Math.max(0, Date.now() - streamStartedAtMs);
                                        }
                                        if (normalized.type === "run_end") {
                                            lastRunEnd = normalized;
                                        }
                                        await coalescer.push(normalized);
                                    }
                                } else {
                                    for await (const chunk of service.streamChat(popupMessages, { ...runtimeOptions, signal: request.signal })) {
                                        const normalized = normalizeStreamChunk(chunk);
                                        if (!normalized) continue;
                                        if (firstProviderContentMs === null && normalized.type === "content" && normalized.content) {
                                            firstProviderContentMs = Math.max(0, Date.now() - streamStartedAtMs);
                                        }
                                        if (normalized.type === "run_end") {
                                            lastRunEnd = normalized;
                                        }
                                        await coalescer.push(normalized);
                                    }
                                }
                            } else {
                                for await (const chunk of service.streamChat(messages, { ...runtimeOptions, signal: request.signal })) {
                                    const normalized = normalizeStreamChunk(chunk);
                                    if (!normalized) continue;
                                    if (firstProviderContentMs === null && normalized.type === "content" && normalized.content) {
                                        firstProviderContentMs = Math.max(0, Date.now() - streamStartedAtMs);
                                    }
                                    if (normalized.type === "run_end") {
                                        lastRunEnd = normalized;
                                    }
                                    await coalescer.push(normalized);
                                }
                            }
                        } else {
                            await coalescer.push({ type: "error", error: "No messages provided" });
                        }
                    } catch (error) {
                        if (clarificationResumeStarted && clarificationResumeMetricPayload && !clarificationResumeFailureRecorded) {
                            await emitClarificationRuntimeMetric(
                                "ask_user_answer_resume_failed",
                                clarificationResumeMetricPayload,
                                clarificationResumeRunId,
                                clarificationResumeConversationId,
                            );
                            clarificationResumeFailureRecorded = true;
                        }
                        const envelope = extractAIErrorEnvelope(error);
                        if (envelope) {
                            const normalized = normalizeStreamChunk(buildStreamErrorChunk(envelope));
                            if (normalized) {
                                await coalescer.push(normalized);
                            }
                        } else {
                            const errorMessage = error instanceof Error ? error.message : "Unknown error";
                            await coalescer.push({ type: "error", error: errorMessage });
                        }
                    } finally {
                        await coalescer?.flushAll();
                        await maybeRecordRunEndMetric();
                        await coalescer?.stop();
                        if (!streamClosed) {
                            try {
                                controller.close();
                            } catch {
                                streamClosed = true;
                            }
                        }
                    }
                });
            },
            cancel() {
                streamClosed = true;
                void coalescer?.stop();
            },
        });

        return new Response(stream, {
            headers: {
                "Content-Type": "application/x-ndjson; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        });
    } catch (error) {
        logServerError("ai-stream-route", "route failed", undefined, error);
        return new Response(
            JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
        );
    }
}
