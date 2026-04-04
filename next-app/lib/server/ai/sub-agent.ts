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
import { startRun, endRun, startRunHeartbeat, type RunHeartbeatController } from "@/lib/server/agent/run";
import { recordRunEvent } from "@/lib/server/agent/run-event-recorder";
import { dropShadowedInvalidToolCalls, getToolCallRepeatKey } from "./tool-helpers";
import { evaluateToolPrerequisites } from "./tool-prerequisites";
import { executeToolWithAutonomyCore } from "./tool-autonomy";
import { logServerError, logServerWarn } from "@/lib/server/logging";

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
    };
    /** Override default budget constraints */
    budget?: Partial<LoopBudget>;
    /** AbortSignal for cancellation */
    signal?: AbortSignal;
    /** Optional model ID used for run metadata. */
    model?: string;
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

function mapStopReasonToRunStatus(reason: StopReason | null): Extract<RunStatus, "completed" | "failed" | "cancelled" | "paused"> {
    if (reason === "error") return "failed";
    if (reason === "cancelled") return "cancelled";
    if (reason === "paused_for_input") return "paused";
    return "completed";
}

function logEventEmissionFailure(eventType: string, runId: string, error: unknown): void {
    const reason = error instanceof Error ? error.message : "unknown error";
    logServerWarn("sub-agent", "failed to emit delegated run event", {
        eventType,
        runId,
        reason,
    });
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
    let childRunHeartbeat: RunHeartbeatController | null = null;
    let childRunStatus: Extract<RunStatus, "completed" | "failed" | "cancelled" | "paused"> = "completed";
    let pendingUserInputRequest: UserInputRequest | undefined;
    let blockedReason: ToolBlockedReason | undefined;

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
    const toolDefs = getToolDefinitions(mode, scope);

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

    try {
        const childRun = await startRun({
            projectId: projectId ?? null,
            userId,
            parentRunId: params.parentRunId,
            trigger: "event",
            agentMode: mode,
            model: params.model,
        });
        childRunId = childRun.id;
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
            signal,
        };

        // 4. Run the tool-calling loop
        const aiService = getAIService();
        let lastContent = "";

        while (true) {
            const check = loop.shouldContinue(signal);
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
                    signal: params.signal,
                }),
            })));

            // Check for doom loops
            if (loop.recordToolCalls(repeatKeyedToolCalls)) {
                lastContent = contentSoFar || "Repeat detected — stopping.";
                break;
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
            if (childRunId && contentSoFar.trim().length > 0) {
                try {
                    await recordRunEvent({
                        runId: childRunId,
                        type: "message",
                        payload: { content: contentSoFar },
                        extras: { messageRole: "assistant" },
                        failureMode: "degrade",
                        degradationReason: "sub_agent_assistant_message_persistence_failed",
                        logContext: "sub_agent_assistant_message",
                    });
                } catch (error) {
                    // Event writes are best-effort: telemetry failures should not fail delegated work.
                    logEventEmissionFailure("message", childRunId, error);
                }
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
                        signal,
                        protocolData: null,
                        autonomyConfig: params.autonomyConfig,
                        systemContexts,
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

                if (signal?.aborted) {
                    lastContent = contentSoFar || "Sub-agent cancelled.";
                    loop.markStopped("cancelled");
                    childRunStatus = "cancelled";
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
        childRunStatus = "failed";
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
        childRunHeartbeat?.stop();
        childRunHeartbeat = null;
        if (childRunId) {
            try {
                const stopReason = loop.stopReason;
                const resolvedStatus = childRunStatus === "completed"
                    ? mapStopReasonToRunStatus(stopReason)
                    : childRunStatus;
                await endRun(childRunId, resolvedStatus);
            } catch (error) {
                logServerError("sub-agent", "failed to finalize child run", {
                    runId: childRunId,
                }, error);
            }
        }
    }
}
