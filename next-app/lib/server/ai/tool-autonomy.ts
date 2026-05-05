/**
 * Autonomy-aware tool execution.
 *
 * Parent streaming and delegated child execution both use the same shared core
 * for autonomy decisions, middleware-wrapped tool execution, and artifact
 * finalization. The parent path adds chunk emission on top of that core.
 */

import type { AIStreamChunk, ToolCall, ToolResult, ToolResultArtifact } from "@/types/ai";
import type { AgentMode } from "@/types/agent";
import { isToolAllowedInScope, getTool, resolveAutonomyLevel } from "./tools";
import { getEffectiveAllowedTools } from "@/lib/agent/router";
import type { ToolResultWithArtifactState } from "@/lib/agent/compaction";
import { prisma } from "@/lib/server/prisma";
import { recordRunEvent } from "@/lib/server/agent/run-event-recorder";
import { emitEventWithinTransaction } from "@/lib/server/agent/events";
import { createArtifact, applyArtifact } from "@/lib/server/agent/artifacts";
import { noteObservedRunActivity, markRunDurabilityDegraded } from "@/lib/server/agent/run";
import { createToolResultCheckpointInTransaction, isCheckpointEligibleToolResult } from "@/lib/server/agent/run-checkpoints";
import { getAutonomyConfig, getToolAutonomyLevel } from "@/lib/server/agent/autonomy";
import { startToolSpan, NOOP_SPAN } from "./tracing";
import type { TracingSpan } from "./tracing";
import { mapToolToArtifactType, mapToolToArtifactTitle } from "./tool-helpers";
import { createAutonomyBlockedErrorEnvelope } from "@/lib/ai/error-envelope";
import type { AIService, ToolRuntimeContext } from "./ai-service";
import { logServerError } from "@/lib/server/logging";
import { isIdempotencyReplayResult } from "./tool-middleware";

export type DelegatedAutonomyBlockedReason = "disabled_by_autonomy" | "approval_required";
export type AutonomyLevelOneBehavior = "suggest" | "block";

type ExecuteToolWithAutonomyCoreParams = {
    service: AIService;
    toolCall: ToolCall;
    runId: string;
    parentRunId?: string;
    projectId?: string;
    conversationId?: string;
    userId?: string;
    agentMode?: AgentMode;
    traceSpan?: TracingSpan;
    studyId?: string;
    cachedAutonomyConfig?: Awaited<ReturnType<typeof getAutonomyConfig>> | {
        preset: string;
        toolOverrides: Record<string, unknown>;
    };
    runtimeContext?: ToolRuntimeContext;
    levelOneBehavior?: AutonomyLevelOneBehavior;
    artifactRunId?: string;
};

function normalizeAutonomyConfig(
    config: Awaited<ReturnType<typeof getAutonomyConfig>> | {
        preset: string;
        toolOverrides: Record<string, unknown>;
    },
): {
    preset: string;
    toolOverrides: Record<string, unknown>;
} {
    return {
        preset: config.preset,
        toolOverrides: (config.toolOverrides && typeof config.toolOverrides === "object" && !Array.isArray(config.toolOverrides))
            ? config.toolOverrides as Record<string, unknown>
            : {},
    };
}

function createScopeOrModeBlockedResult(callId: string, message: string): ToolResult {
    return {
        callId,
        result: null,
        error: message,
    };
}

function createAutonomyBlockedResult(
    callId: string,
    toolName: string,
    reason: DelegatedAutonomyBlockedReason,
): ToolResult {
    const errorMeta = createAutonomyBlockedErrorEnvelope({ toolName, reason });
    return {
        callId,
        result: null,
        error: errorMeta.message,
        errorMeta,
        blockedByAutonomy: true,
        blockedReason: reason,
    };
}

function buildAutonomySuggestion(toolCall: ToolCall): ToolResult {
    return {
        callId: toolCall.id,
        result: `[Suggestion] I would call "${toolCall.name}" with: ${JSON.stringify(toolCall.arguments)}. Approve this action to proceed.`,
    };
}

function buildArtifactMetadata(params: {
    artifact: {
        id: string;
        type: string;
        title: string;
        payload: unknown;
        version?: number | null;
    };
    status: "proposed" | "auto_applied";
    emitToClient: boolean;
}): ToolResultArtifact {
    return {
        artifactId: params.artifact.id,
        artifactType: params.artifact.type,
        artifactTitle: params.artifact.title,
        artifactStatus: params.status,
        artifactPayload: params.artifact.payload,
        artifactVersion: params.artifact.version ?? 1,
        emitToClient: params.emitToClient,
    };
}

function formatError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

async function persistToolResultBoundary(params: {
    runId: string;
    conversationId?: string;
    toolName: string;
    toolResult: ToolResult;
    durationMs?: number;
}) {
    if (!isCheckpointEligibleToolResult({
        toolName: params.toolName,
        toolResult: params.toolResult,
    })) {
        await recordRunEvent({
            runId: params.runId,
            type: "tool_result",
            payload: params.toolResult,
            extras: { toolName: params.toolName, durationMs: params.durationMs },
            failureMode: "degrade",
            degradationReason: "tool_result_persistence_failed",
            logContext: `tool_result:${params.toolName}`,
        });
        return;
    }

    try {
        const event = await prisma.$transaction(async (tx) => {
            const created = await emitEventWithinTransaction(
                tx,
                params.runId,
                "tool_result",
                params.toolResult,
                { toolName: params.toolName, durationMs: params.durationMs },
            );
            await createToolResultCheckpointInTransaction(tx, {
                runId: params.runId,
                conversationId: params.conversationId ?? null,
                eventSequence: created.sequence,
                toolName: params.toolName,
                toolResult: params.toolResult,
            });
            return created;
        });
        noteObservedRunActivity(params.runId, event.createdAt);
    } catch (error) {
        await markRunDurabilityDegraded(
            params.runId,
            "tool_result_checkpoint_persistence_failed",
        ).catch((markError) => {
            logServerError("tool-autonomy", "failed to persist degraded durability state", {
                runId: params.runId,
                toolName: params.toolName,
                error: formatError(markError),
            });
        });
        logServerError("tool-autonomy", "failed to persist tool-result checkpoint boundary", {
            runId: params.runId,
            toolName: params.toolName,
            error: formatError(error),
        });
    }
}

export async function executeToolWithAutonomyCore(
    params: ExecuteToolWithAutonomyCoreParams,
): Promise<ToolResultWithArtifactState> {
    const {
        service,
        toolCall,
        runId,
        parentRunId,
        projectId,
        conversationId,
        userId,
        agentMode,
        traceSpan,
        studyId,
        cachedAutonomyConfig,
        runtimeContext,
        levelOneBehavior = "suggest",
        artifactRunId,
    } = params;

    const scope = projectId && projectId !== null ? "project" as const : "global" as const;
    if (!isToolAllowedInScope(toolCall.name, scope)) {
        const result = createScopeOrModeBlockedResult(
            toolCall.id,
            `Tool "${toolCall.name}" is not available in ${scope} scope.`,
        );
        await recordRunEvent({
            runId,
            type: "tool_result",
            payload: result,
            extras: { toolName: toolCall.name },
            failureMode: "degrade",
            degradationReason: "tool_result_persistence_failed",
            logContext: `tool_result:${toolCall.name}`,
        });
        return result;
    }

    if (agentMode) {
        const allowed = getEffectiveAllowedTools(agentMode);
        if (allowed && allowed.length > 0 && !allowed.includes(toolCall.name)) {
            const result = createScopeOrModeBlockedResult(
                toolCall.id,
                `Tool "${toolCall.name}" is not available in ${agentMode} mode.`,
            );
            await recordRunEvent({
                runId,
                type: "tool_result",
                payload: result,
                extras: { toolName: toolCall.name },
                failureMode: "degrade",
                degradationReason: "tool_result_persistence_failed",
                logContext: `tool_result:${toolCall.name}`,
            });
            return result;
        }
    }

    const tool = getTool(toolCall.name);
    const autonomyConfig = normalizeAutonomyConfig(
        cachedAutonomyConfig
        ?? runtimeContext?.autonomyConfig
        ?? await getAutonomyConfig(userId, projectId),
    );
    const configuredLevel = getToolAutonomyLevel(toolCall.name, {
        preset: autonomyConfig.preset,
        toolOverrides: (autonomyConfig.toolOverrides ?? {}) as Record<string, unknown>,
    });
    const level = resolveAutonomyLevel(toolCall.name, configuredLevel, tool?.autonomy);

    await recordRunEvent({
        runId,
        type: "tool_call",
        payload: {
            id: toolCall.id,
            name: toolCall.name,
            arguments: toolCall.arguments,
            autonomyLevel: level,
        },
        extras: { toolName: toolCall.name },
        failureMode: "strict",
        logContext: `tool_call:${toolCall.name}`,
    });

    if (level === 0) {
        const result = createAutonomyBlockedResult(toolCall.id, toolCall.name, "disabled_by_autonomy");
        await recordRunEvent({
            runId,
            type: "tool_result",
            payload: result,
            extras: { toolName: toolCall.name },
            failureMode: "degrade",
            degradationReason: "tool_result_persistence_failed",
            logContext: `tool_result:${toolCall.name}`,
        });
        return result;
    }

    if (level === 1) {
        const result = levelOneBehavior === "suggest"
            ? buildAutonomySuggestion(toolCall)
            : createAutonomyBlockedResult(toolCall.id, toolCall.name, "approval_required");
        await recordRunEvent({
            runId,
            type: "tool_result",
            payload: result,
            extras: { toolName: toolCall.name },
            failureMode: "degrade",
            degradationReason: "tool_result_persistence_failed",
            logContext: `tool_result:${toolCall.name}`,
        });
        return result;
    }

    const toolSpan = startToolSpan(traceSpan ?? NOOP_SPAN, toolCall.name, toolCall.arguments);
    const startTime = Date.now();
    const result = await service.executeToolWithMiddleware({
        name: toolCall.name,
        args: toolCall.arguments,
        callId: toolCall.id,
        context: {
            projectId,
            studyId,
            userId,
            runId,
            rootRunId: runtimeContext?.rootRunId ?? parentRunId ?? runId,
            parentRunId: parentRunId ?? runId,
            conversationId,
            autonomyConfig,
            systemContexts: runtimeContext?.systemContexts,
            protocolData: runtimeContext?.protocolData ?? null,
            signal: runtimeContext?.signal,
            autonomyLevel: level,
        },
    });
    const durationMs = Date.now() - startTime;
    toolSpan.update({ output: { success: !result.error, durationMs } }).end();

    await persistToolResultBoundary({
        runId,
        conversationId,
        toolName: toolCall.name,
        toolResult: result,
        durationMs,
    });

    if (
        result.error
        || result.requiresUserInput
        || result.blockedByAutonomy
        || isIdempotencyReplayResult(result)
    ) {
        return result as ToolResultWithArtifactState;
    }

    const artifactType = mapToolToArtifactType(toolCall.name);
    if (!artifactType || !result.result || !projectId) {
        return result as ToolResultWithArtifactState;
    }

    const artifact = await createArtifact({
        runId: artifactRunId ?? runId,
        projectId,
        conversationId,
        userId,
        type: artifactType,
        title: mapToolToArtifactTitle(toolCall.name, toolCall.arguments),
        payload: result.result,
    });

    let artifactStatus: "proposed" | "auto_applied" = "proposed";
    let emitToClient = true;
    if (level >= 3) {
        await applyArtifact(artifact.id, "auto_applied");
        artifactStatus = "auto_applied";
        emitToClient = level !== 4;
    }

    const artifactMeta = buildArtifactMetadata({
        artifact,
        status: artifactStatus,
        emitToClient,
    });

    return {
        ...(result as ToolResultWithArtifactState),
        artifactId: artifactMeta.artifactId,
        artifactType: artifactMeta.artifactType as ToolResultWithArtifactState["artifactType"],
        artifactTitle: artifactMeta.artifactTitle,
        artifactStatus: artifactMeta.artifactStatus as ToolResultWithArtifactState["artifactStatus"],
        artifacts: [...(result.artifacts ?? []), artifactMeta],
    };
}

/**
 * Execute a tool call with autonomy-aware behavior and stream artifact chunks
 * for direct parent execution.
 */
export async function* executeToolWithAutonomy(
    service: AIService,
    toolCall: ToolCall,
    runId: string,
    projectId: string | undefined,
    conversationId: string,
    userId?: string,
    agentMode?: AgentMode,
    traceSpan?: TracingSpan,
    studyId?: string,
    cachedAutonomyConfig?: Awaited<ReturnType<typeof getAutonomyConfig>> | {
        preset: string;
        toolOverrides: Record<string, unknown>;
    },
    runtimeContext?: ToolRuntimeContext,
): AsyncGenerator<AIStreamChunk, ToolResult> {
    const result = await executeToolWithAutonomyCore({
        service,
        toolCall,
        runId,
        parentRunId: runId,
        projectId,
        conversationId,
        userId,
        agentMode,
        traceSpan,
        studyId,
        cachedAutonomyConfig,
        runtimeContext,
        levelOneBehavior: "suggest",
        artifactRunId: runId,
    });

    for (const artifact of result.artifacts ?? []) {
        if (artifact.emitToClient === false) continue;
        yield {
            type: "artifact",
            artifactId: artifact.artifactId,
            artifactType: artifact.artifactType,
            artifactStatus: artifact.artifactStatus,
            artifactTitle: artifact.artifactTitle,
            artifactPayload: artifact.artifactPayload,
            artifactVersion: artifact.artifactVersion,
        };
    }

    return result;
}
