/**
 * Sub-Agent Execution
 * Runs a focused tool-calling loop in a specific agent mode.
 * Used by delegation meta-tools (delegate_search, delegate_screening, delegate_protocol)
 * to route work to mode-specialized sub-agents from general mode.
 *
 * Key design decisions:
 * - Reuses LoopState for budget/doom-loop control
 * - Reuses getToolDefinitions() for mode-scoped tool filtering
 * - Reuses assembleSystemPrompt() for mode-specific system prompts
 * - Does NOT stream — returns a summary when done
 * - Skips autonomy checks (parent already authorized the delegation)
 * - Auto-applies proposal-style tool outputs by creating + applying artifacts
 *   on the parent run (when run/project context is available)
 * - Conservative budgets: 5 iterations, 10 tool calls, 60s wall time
 *
 * (Wave 2 — Improvement 2)
 */

import "server-only";

import type { AIMessage, ToolBlockedReason, ToolCall, ToolResultArtifact, UserInputRequest, ChatOptions } from "@/types/ai";
import type { AgentMode, RunStatus } from "@/types/agent";
import { LoopState, type LoopBudget, type StopReason } from "@/lib/agent/loop-controller";
import { getToolDefinitions } from "./tools/base";
import { buildModelVisibleToolResultForTool, compactToolResult, type ToolResultWithArtifactState } from "@/lib/agent/compaction";
import { assembleSystemPrompt } from "@/lib/ai/prompts/assistant-prompts";
import { getAIService } from "./ai-service";
import {
    endRun,
    getRun,
    isRunOwnershipError,
    markRunFinalizationFailed,
    markRunFinalizationState,
    startRun,
    startRunHeartbeat,
    type RunHeartbeatController,
} from "@/lib/server/agent/run";
import { recordRunEvent } from "@/lib/server/agent/run-event-recorder";
import { deriveRunOutcome, type RunFacts } from "@/lib/ai/run-outcome";
import { dropShadowedInvalidToolCalls, getToolCallRepeatKey } from "./tool-helpers";
import { evaluateToolPrerequisites } from "./tool-prerequisites";
import { executeToolWithAutonomyCore, preRecordToolCallBatchForAutonomy } from "./tool-autonomy";
import { isRunLineageToolBudgetExceededError } from "@/lib/server/agent/events";
import { logServerError, logServerWarn } from "@/lib/server/logging";
import { createDeadlineAbortController, isAbortLikeError } from "@/lib/abort";
import {
    deriveSearchSourcePolicy,
    filterToolDefinitionsBySearchSourcePolicy,
} from "@/lib/agent/search-source-policy";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SubAgentParams {
    /** Agent mode determines tool subset and system prompt */
    mode: AgentMode;
    /** The task description — injected as a user message */
    task: string;
    /** Project ID for tool execution context */
    projectId?: string;
    /** User ID for tool execution context */
    userId?: string;
    /** Study ID for tool execution context (screening mode) */
    studyId?: string;
    /** Parent run ID for tracing lineage */
    parentRunId?: string;
    /** Root run ID for retry/continuation-safe idempotency across the delegated lineage. */
    rootRunId?: string;
    /** Parent conversation ID for delegated artifact visibility */
    conversationId?: string;
    /** Cached autonomy configuration from the parent run. */
    autonomyConfig?: {
        preset: string;
        toolOverrides: Record<string, unknown>;
    };
    /** Pre-assembled context blocks for the system prompt */
    systemContexts?: {
        projectContext?: string;
        protocolContext?: string;
        ledgerContext?: string;
        memoryContext?: string;
        autonomyContext?: string;
        selectedModel?: string;
    };
    /** Override default budget constraints */
    budget?: Partial<LoopBudget>;
    /** AbortSignal for cancellation */
    signal?: AbortSignal;
    /** Optional model ID used for run metadata. */
    model?: string;
    /**
     * Original parent request text used for source-gating search tools.
     * This keeps delegated search PubMed-only unless the parent user explicitly
     * named another source.
     */
    sourcePolicyText?: string;
    /** Explicit source tools already approved by a parent plan or caller. */
    explicitSearchSourceToolNames?: string[];
}

export interface SubAgentResult {
    /** What happened during execution */
    summary: string;
    /** Why the loop stopped */
    stopReason: StopReason;
    /** Total LLM round trips */
    iterations: number;
    /** Total tool calls executed */
    totalToolCalls: number;
    /** Tool call names and their results (for the parent to summarize) */
    toolLog: { name: string; resultPreview: string }[];
    /** Error message if execution failed */
    error?: string;
    /** The child needs user input before it can continue. */
    requiresUserInput?: boolean;
    /** Structured user input request to bubble back to the parent. */
    userInputRequest?: UserInputRequest;
    /** Delegated execution was blocked by autonomy policy. */
    blockedByAutonomy?: boolean;
    /** Why delegated execution was blocked. */
    blockedReason?: ToolBlockedReason;
    /** Parent-visible artifact metadata produced by the child. */
    artifacts?: ToolResultArtifact[];
}

async function resolveToolRepeatKey(
    toolCall: ToolCall,
    context: {
        projectId?: string;
        studyId?: string;
        userId?: string;
        runId?: string;
        parentRunId?: string;
        systemContexts?: SubAgentParams["systemContexts"];
        signal?: AbortSignal;
    },
): Promise<string> {
    const prerequisiteEvaluation = await evaluateToolPrerequisites({
        name: toolCall.name,
        args: toolCall.arguments,
        callId: toolCall.id,
        context,
    });

    if (!prerequisiteEvaluation.allowed) {
        return prerequisiteEvaluation.repeatKey;
    }

    return getToolCallRepeatKey(toolCall);
}

// ── Default Budget ───────────────────────────────────────────────────────────

const SUB_AGENT_DEFAULT_BUDGET: LoopBudget = {
    maxIterations: 5,
    maxToolCalls: 10,
    maxWallTimeMs: 60_000,
};

type ChildTerminalRunStatus = Extract<RunStatus, "completed" | "failed" | "cancelled" | "paused">;

function isChildTerminalRunStatus(status: string | null | undefined): status is ChildTerminalRunStatus {
    return status === "completed"
        || status === "failed"
        || status === "cancelled"
        || status === "paused";
}

function logEventEmissionFailure(eventType: string, runId: string, error: unknown): void {
    const reason = error instanceof Error ? error.message : "unknown error";
    logServerWarn("sub-agent", "failed to emit delegated run event", {
        eventType,
        runId,
        reason,
    });
}

async function recordSubAgentAssistantMessage(runId: string, content: string): Promise<void> {
    if (content.trim().length === 0) return;
    try {
        await recordRunEvent({
            runId,
            type: "message",
            payload: { content },
            extras: { messageRole: "assistant" },
            failureMode: "degrade",
            degradationReason: "sub_agent_assistant_message_persistence_failed",
            logContext: "sub_agent_assistant_message",
        });
    } catch (error) {
        // Event writes are best-effort: telemetry failures should not fail delegated work.
        logEventEmissionFailure("message", runId, error);
    }
}

// ── Execution ────────────────────────────────────────────────────────────────

export async function executeSubAgent(params: SubAgentParams): Promise<SubAgentResult> {
    const {
        mode,
        task,
        projectId,
        userId,
        studyId,
        systemContexts,
        signal,
    } = params;

    const budget = { ...SUB_AGENT_DEFAULT_BUDGET, ...params.budget };
    const loop = new LoopState(budget);
    const toolLog: SubAgentResult["toolLog"] = [];
    const delegatedArtifacts: ToolResultArtifact[] = [];
    let childRunId: string | null = null;
    let childRootRunId: string | null = null;
    let childRunHeartbeat: RunHeartbeatController | null = null;
    let childRunStatus: ChildTerminalRunStatus = "completed";
    let childRunFinalized = false;
    let finalizedChildRunStatus: ChildTerminalRunStatus | null = null;
    let pendingUserInputRequest: UserInputRequest | undefined;
    let blockedReason: ToolBlockedReason | undefined;
    let childHadFinalAssistantAnswer = false;
    let childHadSuccessfulToolOrArtifact = false;

    const stopChildRunHeartbeat = () => {
        childRunHeartbeat?.stop();
        childRunHeartbeat = null;
    };
    const adoptChildTerminalStatus = (
        requestedStatus: ChildTerminalRunStatus,
        terminalStatus: ChildTerminalRunStatus,
    ) => {
        childRunFinalized = true;
        finalizedChildRunStatus = terminalStatus;
        if (terminalStatus !== requestedStatus) {
            throw new Error(
                `Child run finalized as ${terminalStatus} instead of ${requestedStatus}.`,
            );
        }
    };
    const inspectChildTerminalStatus = async (runId: string): Promise<ChildTerminalRunStatus | null> => {
        try {
            const persistedRun = await getRun(runId);
            return isChildTerminalRunStatus(persistedRun?.status) ? persistedRun.status : null;
        } catch (error) {
            logServerWarn("sub-agent", "failed to inspect child run after finalization race", {
                runId,
                error: error instanceof Error ? error.message : String(error),
            });
            return null;
        }
    };
    const finalizeChildRunOnce = async (requestedStatus: ChildTerminalRunStatus): Promise<void> => {
        if (!childRunId) return;
        if (childRunFinalized) {
            if (finalizedChildRunStatus !== requestedStatus) {
                throw new Error(
                    `Child run was already finalized as ${finalizedChildRunStatus ?? "unknown"} instead of ${requestedStatus}.`,
                );
            }
            return;
        }

        stopChildRunHeartbeat();
        const activeChildRunId = childRunId;
        let startedFinalization: number;
        try {
            startedFinalization = await markRunFinalizationState(activeChildRunId, "in_progress");
        } catch (error) {
            if (isRunOwnershipError(error)) {
                if (isChildTerminalRunStatus(error.status)) {
                    adoptChildTerminalStatus(requestedStatus, error.status);
                    return;
                }
                const terminalStatus = await inspectChildTerminalStatus(error.runId);
                if (terminalStatus) {
                    adoptChildTerminalStatus(requestedStatus, terminalStatus);
                    return;
                }
            }
            throw error;
        }

        if (startedFinalization === 0) {
            const terminalStatus = await inspectChildTerminalStatus(activeChildRunId);
            if (terminalStatus) {
                adoptChildTerminalStatus(requestedStatus, terminalStatus);
                return;
            }
            throw new Error(
                `Child run ${activeChildRunId} could not start durable finalization.`,
            );
        }

        try {
            await endRun(activeChildRunId, requestedStatus);
        } catch (error) {
            if (isRunOwnershipError(error)) {
                if (isChildTerminalRunStatus(error.status)) {
                    adoptChildTerminalStatus(requestedStatus, error.status);
                    return;
                }
                const terminalStatus = await inspectChildTerminalStatus(error.runId);
                if (terminalStatus) {
                    adoptChildTerminalStatus(requestedStatus, terminalStatus);
                    return;
                }
            } else {
                await markRunFinalizationFailed(activeChildRunId).catch((markError) => {
                    logServerError("sub-agent", "failed to persist child finalization failure", {
                        runId: activeChildRunId,
                    }, markError);
                });
            }
            throw error;
        }

        childRunFinalized = true;
        finalizedChildRunStatus = requestedStatus;
    };

    // 1. Build system prompt for this mode
    const systemPrompt = assembleSystemPrompt({
        agentMode: mode,
        projectContext: systemContexts?.projectContext,
        protocolContext: systemContexts?.protocolContext,
        ledgerContext: systemContexts?.ledgerContext,
        memoryContext: systemContexts?.memoryContext,
        autonomyContext: systemContexts?.autonomyContext,
    });

    // 2. Get mode-scoped tool definitions
    const scope = projectId ? "project" as const : "global" as const;
    const sourcePolicy = deriveSearchSourcePolicy({
        text: params.sourcePolicyText ?? task,
        explicitToolNames: params.explicitSearchSourceToolNames,
    });
    const toolDefs = filterToolDefinitionsBySearchSourcePolicy(
        getToolDefinitions(mode, scope),
        sourcePolicy,
    );
    const allowedToolNames = toolDefs.map((tool) => tool.name);

    if (toolDefs.length === 0) {
        return {
            summary: `No tools available for ${mode} mode.`,
            stopReason: "error",
            iterations: 0,
            totalToolCalls: 0,
            toolLog: [],
            error: `No tools registered for mode: ${mode}`,
        };
    }

    const loopDeadline = createDeadlineAbortController(loop.budget.maxWallTimeMs, [signal]);
    const loopSignal = loopDeadline.signal;

    try {
        const childRun = await startRun({
            projectId: projectId ?? null,
            conversationId: params.conversationId,
            userId,
            parentRunId: params.parentRunId,
            rootRunId: params.rootRunId,
            trigger: "event",
            agentMode: mode,
            model: params.model,
        });
        childRunId = childRun.id;
        childRootRunId = childRun.rootRunId ?? params.rootRunId ?? childRun.id;
        childRunHeartbeat = startRunHeartbeat(childRun.id, {
            onError: (error) => {
                logServerWarn("sub-agent", "run heartbeat failed", {
                    runId: childRun.id,
                    error: error instanceof Error ? error.message : String(error),
                });
            },
        });
        await recordRunEvent({
            runId: childRun.id,
            type: "message",
            payload: { content: task },
            extras: { messageRole: "user" },
            durabilityClass: "observability_only",
            logContext: "sub_agent_user_message",
        });
    } catch (error) {
        loopDeadline.dispose();
        stopChildRunHeartbeat();
        if (childRunId) {
            try {
                await finalizeChildRunOnce("failed");
            } catch (finalizationError) {
                logServerError("sub-agent", "failed to finalize child run after initialization error", {
                    runId: childRunId,
                }, finalizationError);
            }
        }
        return {
            summary: "Sub-agent failed to initialize run state.",
            stopReason: "error",
            iterations: 0,
            totalToolCalls: 0,
            toolLog: [],
            error: error instanceof Error ? error.message : "Failed to initialize sub-agent run",
        };
    }

    try {
        // 3. Initialize message history with system prompt + task
        const currentMessages: AIMessage[] = [
            {
                id: "sub-agent-system",
                role: "system",
                content: systemPrompt,
                createdAt: new Date().toISOString(),
            },
            {
                id: "sub-agent-task",
                role: "user",
                content: task,
                createdAt: new Date().toISOString(),
            },
        ];

        const chatOptions: ChatOptions = {
            tools: toolDefs,
            projectId,
            userId,
            signal: loopSignal,
            model: params.model,
        };

        // 4. Run the tool-calling loop
        const aiService = getAIService();
        let lastContent = "";

        while (true) {
            if (loopDeadline.timedOut()) loop.markStopped("wall_time");
            const check = loop.shouldContinue(loopSignal);
            if (!check.continue) {
                break;
            }

            // Stream from AI, collect tool calls and content
            const collectedToolCalls: ToolCall[] = [];
            let contentSoFar = "";

            for await (const chunk of aiService.streamChat(currentMessages, chatOptions)) {
                if (chunk.type === "tool_call" && chunk.toolCall) {
                    collectedToolCalls.push(chunk.toolCall);
                } else if (chunk.type === "content") {
                    contentSoFar += chunk.content || "";
                } else if (chunk.type === "error") {
                    if (loopSignal.aborted) {
                        const timedOut = loopDeadline.timedOut();
                        childRunStatus = timedOut ? "failed" : "cancelled";
                        loop.markStopped(timedOut ? "wall_time" : "cancelled");
                        return {
                            summary: contentSoFar || (timedOut ? "Sub-agent wall-time budget reached." : "Sub-agent cancelled."),
                            stopReason: timedOut ? "wall_time" : "cancelled",
                            iterations: loop.iterations,
                            totalToolCalls: loop.totalToolCalls,
                            toolLog,
                            artifacts: delegatedArtifacts,
                        };
                    }
                    childRunStatus = "failed";
                    // Sub-agent doesn't retry — fail fast back to parent
                    return {
                        summary: contentSoFar || "Sub-agent encountered an error.",
                        stopReason: "error",
                        iterations: loop.iterations,
                        totalToolCalls: loop.totalToolCalls,
                        toolLog,
                        error: chunk.error || "Unknown streaming error",
                    };
                }
            }

            // No tool calls = AI is done, natural end
            if (collectedToolCalls.length === 0) {
                lastContent = contentSoFar;
                childHadFinalAssistantAnswer = contentSoFar.trim().length > 0;
                if (childRunId) {
                    await recordSubAgentAssistantMessage(childRunId, contentSoFar);
                }
                loop.markStopped("natural");
                break;
            }

            const sanitizedToolCalls = dropShadowedInvalidToolCalls(collectedToolCalls);
            if (sanitizedToolCalls.dropped.length > 0) {
                logServerWarn("sub-agent", "dropped malformed shadowed tool calls", {
                    droppedToolCalls: sanitizedToolCalls.dropped.map((toolCall) => ({
                        id: toolCall.id,
                        name: toolCall.name,
                        reason: toolCall.reason,
                    })),
                });
                collectedToolCalls.length = 0;
                collectedToolCalls.push(...sanitizedToolCalls.toolCalls);
            }

            if (collectedToolCalls.length === 0) {
                lastContent = contentSoFar;
                childHadFinalAssistantAnswer = contentSoFar.trim().length > 0;
                loop.markStopped("natural");
                break;
            }

            const repeatKeyedToolCalls = await Promise.all(collectedToolCalls.map(async (toolCall) => ({
                ...toolCall,
                repeatKey: await resolveToolRepeatKey(toolCall, {
                    projectId: params.projectId,
                    studyId: params.studyId,
                    userId: params.userId,
                    runId: childRunId ?? params.parentRunId,
                    parentRunId: params.parentRunId,
                    systemContexts: params.systemContexts,
                    signal: loopSignal,
                }),
            })));

            // Reserve capacity before any executor can observe this batch.
            const repeatDetected = loop.recordToolCalls(repeatKeyedToolCalls);
            if (loop.stopReason === "max_tool_calls") {
                lastContent = contentSoFar || "Tool-call budget reached — stopping.";
                break;
            }
            if (repeatDetected) {
                lastContent = contentSoFar || "Repeat detected — stopping.";
                break;
            }

            const durableRunId = childRunId ?? params.parentRunId;
            let preRecordedAutonomyLevels: ReadonlyMap<string, number> | undefined;
            if (durableRunId) {
                try {
                    preRecordedAutonomyLevels = await preRecordToolCallBatchForAutonomy({
                        runId: durableRunId,
                        toolCalls: collectedToolCalls,
                        projectId,
                        userId,
                        agentMode: mode,
                        allowedToolNames,
                        cachedAutonomyConfig: params.autonomyConfig,
                    });
                } catch (error) {
                    if (isRunLineageToolBudgetExceededError(error)) {
                        loop.markStopped("max_tool_calls");
                        lastContent = contentSoFar || "Tool-call budget reached — stopping.";
                        break;
                    }
                    throw error;
                }
            }

            // Build assistant message
            const assistantMsg: AIMessage = {
                id: `sub-agent-assistant-${loop.iterations}`,
                role: "assistant",
                content: contentSoFar,
                toolCalls: collectedToolCalls,
                createdAt: new Date().toISOString(),
            };
            currentMessages.push(assistantMsg);
            if (childRunId) {
                await recordSubAgentAssistantMessage(childRunId, contentSoFar);
            }

            // Execute each tool call
            for (const tc of collectedToolCalls) {
                const result = await executeToolWithAutonomyCore({
                    service: aiService,
                    toolCall: tc,
                    runId: childRunId ?? params.parentRunId ?? "delegated-run",
                    parentRunId: params.parentRunId,
                    projectId,
                    conversationId: params.conversationId,
                    userId,
                    agentMode: mode,
                    studyId,
                    cachedAutonomyConfig: params.autonomyConfig,
                    runtimeContext: {
                        signal: loopSignal,
                        rootRunId: childRootRunId,
                        protocolData: null,
                        autonomyConfig: params.autonomyConfig,
                        systemContexts,
                        allowedToolNames,
                        preRecordedAutonomyLevels,
                    },
                    levelOneBehavior: "block",
                    artifactRunId: params.parentRunId ?? childRunId ?? undefined,
                });
                const resultForModel: ToolResultWithArtifactState = result;
                if (result.artifacts?.length) {
                    delegatedArtifacts.push(...result.artifacts);
                }

                // If a tool requires user input, sub-agent can't handle that — stop
                if (result.requiresUserInput && result.userInputRequest) {
                    lastContent = "Sub-agent paused: a tool requested user input.";
                    pendingUserInputRequest = result.userInputRequest;
                    loop.markStopped("paused_for_input");
                    childRunStatus = "paused";
                    break;
                }

                if (result.blockedByAutonomy) {
                    lastContent = `Sub-agent blocked by autonomy while attempting ${tc.name}.`;
                    blockedReason = result.blockedReason;
                    loop.markStopped("error");
                    childRunStatus = "failed";
                    toolLog.push({
                        name: `${tc.name}:blocked`,
                        resultPreview: result.error ?? "Blocked by autonomy policy",
                    });
                    return {
                        summary: lastContent,
                        stopReason: "error",
                        iterations: loop.iterations,
                        totalToolCalls: loop.totalToolCalls,
                        toolLog,
                        error: result.error,
                        blockedByAutonomy: true,
                        blockedReason,
                        artifacts: delegatedArtifacts,
                    };
                }

                if (!result.error) {
                    childHadSuccessfulToolOrArtifact = true;
                }

                const preview = compactToolResult(
                    tc.name,
                    buildModelVisibleToolResultForTool(tc.name, resultForModel),
                    500, // shorter preview for sub-agent log
                );
                toolLog.push({ name: tc.name, resultPreview: preview });

                const toolMsg: AIMessage = {
                    id: `sub-agent-tool-${tc.id}`,
                    role: "tool",
                    content: compactToolResult(tc.name, buildModelVisibleToolResultForTool(tc.name, resultForModel)),
                    toolResultId: tc.id,
                    createdAt: new Date().toISOString(),
                };
                currentMessages.push(toolMsg);

                if (loopSignal.aborted) {
                    const timedOut = loopDeadline.timedOut();
                    lastContent = contentSoFar || (timedOut ? "Sub-agent wall-time budget reached." : "Sub-agent cancelled.");
                    loop.markStopped(timedOut ? "wall_time" : "cancelled");
                    childRunStatus = timedOut ? "failed" : "cancelled";
                    break;
                }
            }

            // If loop was stopped by ask_user inside the tool execution
            if (loop.stopReason) break;

            lastContent = contentSoFar;
        }
        // 5. Build summary
        const toolSummary = toolLog.length > 0
            ? toolLog.map(t => `- ${t.name}: ${t.resultPreview}`).join("\n")
            : "No tools were called.";

        const summary = lastContent
            ? `${lastContent}\n\n---\nTool activity (${toolLog.length} calls):\n${toolSummary}`
            : `Sub-agent completed with ${toolLog.length} tool calls.\n\nTool activity:\n${toolSummary}`;

        return {
            summary,
            stopReason: loop.stopReason ?? "natural",
            iterations: loop.iterations,
            totalToolCalls: loop.totalToolCalls,
            toolLog,
            requiresUserInput: Boolean(pendingUserInputRequest),
            userInputRequest: pendingUserInputRequest,
            blockedByAutonomy: Boolean(blockedReason),
            blockedReason,
            artifacts: delegatedArtifacts,
        };
    } catch (error) {
        const timedOut = loopDeadline.timedOut();
        const cancelled = !timedOut && (loopSignal.aborted || isAbortLikeError(error));
        childRunStatus = cancelled ? "cancelled" : "failed";
        if (timedOut) {
            loop.markStopped("wall_time");
            return {
                summary: "Sub-agent wall-time budget reached.",
                stopReason: "wall_time",
                iterations: loop.iterations,
                totalToolCalls: loop.totalToolCalls,
                toolLog,
                artifacts: delegatedArtifacts,
            };
        }
        if (cancelled) {
            loop.markStopped("cancelled");
            return {
                summary: "Sub-agent cancelled.",
                stopReason: "cancelled",
                iterations: loop.iterations,
                totalToolCalls: loop.totalToolCalls,
                toolLog,
                artifacts: delegatedArtifacts,
            };
        }
        return {
            summary: "Sub-agent failed unexpectedly.",
            stopReason: "error",
            iterations: loop.iterations,
            totalToolCalls: loop.totalToolCalls,
            toolLog,
            error: error instanceof Error ? error.message : "Unknown error",
            artifacts: delegatedArtifacts,
        };
    } finally {
        loopDeadline.dispose();
        stopChildRunHeartbeat();
        if (childRunId) {
            const stopReason = loop.stopReason;
            const runFacts: RunFacts = {
                hadFinalAssistantAnswer: childHadFinalAssistantAnswer,
                hadSuccessfulToolOrArtifact: childHadSuccessfulToolOrArtifact,
                hadDeterministicNonRetryableFailure: false,
                pausedForUserInput: false,
                cancelledByUser: false,
            };
            const resolvedStatus = childRunStatus === "completed"
                ? deriveRunOutcome({
                    facts: runFacts,
                    stopReason: stopReason ?? "natural",
                }).runStatus
                : childRunStatus;
            await finalizeChildRunOnce(resolvedStatus);
        }
    }
}
