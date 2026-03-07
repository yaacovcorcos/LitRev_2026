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

import type { AIMessage, ToolCall, ChatOptions } from "@/types/ai";
import type { AgentMode, RunStatus } from "@/types/agent";
import type { ArtifactType } from "@/types/artifacts";
import { LoopState, type LoopBudget, type StopReason } from "@/lib/agent/loop-controller";
import { getToolDefinitions, executeTool } from "./tools/base";
import { buildModelVisibleToolResult, compactToolResult, type ToolResultWithArtifactState } from "@/lib/agent/compaction";
import { assembleSystemPrompt } from "@/lib/ai/prompts/copilot-prompts";
import { getAIService } from "./ai-service";
import { createArtifact, applyArtifact } from "@/lib/server/agent/artifacts";
import { startRun, endRun } from "@/lib/server/agent/run";
import { emitEvent } from "@/lib/server/agent/events";
import { dropShadowedInvalidToolCalls, getToolCallRepeatKey } from "./tool-helpers";

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
}

function mapToolToArtifactType(toolName: string): ArtifactType | null {
    const mapping: Record<string, ArtifactType> = {
        bulk_screening: "screening_batch",
        update_protocol: "protocol_suggestion",
        store_memory: "memory_proposal",
        forget_memory: "memory_forget_proposal",
        update_note: "draft_diff",
        exclude_study: "study_proposal",
        update_study: "study_update",
    };
    return mapping[toolName] ?? null;
}

function mapToolToArtifactTitle(toolName: string, args: Record<string, unknown>): string {
    switch (toolName) {
        case "bulk_screening":
            return "Batch screening results";
        case "update_protocol":
            return `Protocol: ${args.field ?? "update"}`;
        case "store_memory":
            return `Remember: ${args.key ?? "preference"}`;
        case "forget_memory":
            return `Forget: ${args.key ?? "memory"}`;
        case "update_note":
            return `Draft: ${args.section ?? "section"}`;
        case "exclude_study":
            return `Exclude: ${args.reason ?? "study"}`;
        case "update_study":
            return "Study metadata update";
        default:
            return toolName;
    }
}

async function maybeAutoApplyDelegatedArtifact(params: {
    toolName: string;
    toolArgs: Record<string, unknown>;
    toolResult: unknown;
    parentRunId?: string;
    projectId?: string;
    userId?: string;
}): Promise<string | null> {
    const artifactType = mapToolToArtifactType(params.toolName);
    if (!artifactType) return null;
    if (!params.parentRunId || !params.projectId || params.toolResult == null) return null;

    const artifact = await createArtifact({
        runId: params.parentRunId,
        projectId: params.projectId,
        userId: params.userId,
        type: artifactType,
        title: mapToolToArtifactTitle(params.toolName, params.toolArgs),
        payload: params.toolResult,
    });
    await applyArtifact(artifact.id, "auto_applied");
    return artifact.id;
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
    console.warn(`[sub-agent] Failed to emit ${eventType} event for run ${runId}: ${reason}`);
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
    let childRunId: string | null = null;
    let childRunStatus: Extract<RunStatus, "completed" | "failed" | "cancelled" | "paused"> = "completed";

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
        await emitEvent(childRun.id, "message", { content: task }, { messageRole: "user" });
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
                console.warn(
                    "[sub-agent] Dropped malformed shadowed tool calls:",
                    sanitizedToolCalls.dropped.map((toolCall) => ({
                        id: toolCall.id,
                        name: toolCall.name,
                        reason: toolCall.reason,
                    })),
                );
                collectedToolCalls.length = 0;
                collectedToolCalls.push(...sanitizedToolCalls.toolCalls);
            }

            if (collectedToolCalls.length === 0) {
                lastContent = contentSoFar;
                loop.markStopped("natural");
                break;
            }

            // Check for doom loops
            if (loop.recordToolCalls(collectedToolCalls.map((toolCall) => ({
                ...toolCall,
                repeatKey: getToolCallRepeatKey(toolCall),
            })))) {
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
                    await emitEvent(childRunId, "message", { content: contentSoFar }, { messageRole: "assistant" });
                } catch (error) {
                    // Event writes are best-effort: telemetry failures should not fail delegated work.
                    logEventEmissionFailure("message", childRunId, error);
                }
            }

            // Execute each tool call
            for (const tc of collectedToolCalls) {
                if (childRunId) {
                    try {
                        await emitEvent(childRunId, "tool_call", { arguments: tc.arguments }, { toolName: tc.name });
                    } catch (error) {
                        logEventEmissionFailure("tool_call", childRunId, error);
                    }
                }
                const result = await executeTool(tc.name, tc.arguments, tc.id, {
                    projectId,
                    studyId,
                    userId,
                    runId: childRunId ?? params.parentRunId,
                    parentRunId: params.parentRunId,
                    signal,
                    systemContexts,
                });
                let resultForModel: ToolResultWithArtifactState = result;
                if (childRunId) {
                    try {
                        await emitEvent(childRunId, "tool_result", { success: !result.error, error: result.error ?? null }, { toolName: tc.name });
                    } catch (error) {
                        logEventEmissionFailure("tool_result", childRunId, error);
                    }
                }

                // If a tool requires user input, sub-agent can't handle that — stop
                if (result.requiresUserInput) {
                    lastContent = "Sub-agent paused: a tool requested user input.";
                    loop.markStopped("paused_for_input");
                    childRunStatus = "paused";
                    break;
                }

                if (!result.error) {
                    try {
                        const artifactId = await maybeAutoApplyDelegatedArtifact({
                            toolName: tc.name,
                            toolArgs: tc.arguments,
                            toolResult: result.result,
                            parentRunId: params.parentRunId,
                            projectId,
                            userId,
                        });
                        if (artifactId) {
                            resultForModel = {
                                ...result,
                                artifactId,
                                artifactType: mapToolToArtifactType(tc.name) ?? undefined,
                                artifactTitle: mapToolToArtifactTitle(tc.name, tc.arguments),
                                artifactStatus: "auto_applied",
                            };
                            toolLog.push({
                                name: `${tc.name}:auto_applied`,
                                resultPreview: `Applied delegated artifact ${artifactId}`,
                            });
                        }
                    } catch (error) {
                        const message = error instanceof Error
                            ? error.message
                            : "Failed to auto-apply delegated artifact";
                        childRunStatus = "failed";
                        return {
                            summary: lastContent || "Sub-agent failed during delegated artifact application.",
                            stopReason: "error",
                            iterations: loop.iterations,
                            totalToolCalls: loop.totalToolCalls,
                            toolLog,
                            error: message,
                        };
                    }
                }

                const preview = compactToolResult(
                    tc.name,
                    buildModelVisibleToolResult(resultForModel),
                    500, // shorter preview for sub-agent log
                );
                toolLog.push({ name: tc.name, resultPreview: preview });

                const toolMsg: AIMessage = {
                    id: `sub-agent-tool-${tc.id}`,
                    role: "tool",
                    content: compactToolResult(tc.name, buildModelVisibleToolResult(resultForModel)),
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
        };
    } finally {
        if (childRunId) {
            try {
                const stopReason = loop.stopReason;
                const resolvedStatus = childRunStatus === "completed"
                    ? mapStopReasonToRunStatus(stopReason)
                    : childRunStatus;
                await endRun(childRunId, resolvedStatus);
            } catch (error) {
                console.error("[sub-agent] Failed to finalize child run", error);
            }
        }
    }
}
