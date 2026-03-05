/**
 * Autonomy-aware tool execution.
 *
 * Extracted from AIService.executeToolWithAutonomy — executes a tool call
 * respecting the autonomy level and yields artifact chunks when appropriate.
 */

import type { AIStreamChunk, ToolCall, ToolResult } from "@/types/ai";
import type { AgentMode } from "@/types/agent";
import { isToolAllowedInScope, getTool, resolveAutonomyLevel } from "./tools";
import { getEffectiveAllowedTools } from "@/lib/agent/router";
import type { ToolResultWithArtifactState } from "@/lib/agent/compaction";
import { emitEvent } from "@/lib/server/agent/events";
import { createArtifact, applyArtifact } from "@/lib/server/agent/artifacts";
import { getAutonomyConfig, getToolAutonomyLevel } from "@/lib/server/agent/autonomy";
import { startToolSpan, NOOP_SPAN } from "./tracing";
import type { TracingSpan } from "./tracing";
import { mapToolToArtifactType, mapToolToArtifactTitle } from "./tool-helpers";
import type { AIService, ToolRuntimeContext } from "./ai-service";

/**
 * Execute a tool call with autonomy-aware behavior.
 * Yields artifact chunks when autonomy level triggers artifact creation.
 * Returns the tool result for the AI loop continuation.
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
    cachedAutonomyConfig?: Awaited<ReturnType<typeof getAutonomyConfig>>,
    runtimeContext?: ToolRuntimeContext,
): AsyncGenerator<AIStreamChunk, ToolResult> {
    // Defense-in-depth: reject tool calls not allowed in the current scope
    const scope = projectId && projectId !== null ? "project" as const : "global" as const;
    if (!isToolAllowedInScope(toolCall.name, scope)) {
        const result: ToolResult = {
            callId: toolCall.id,
            result: null,
            error: `Tool "${toolCall.name}" is not available in ${scope} scope.`,
        };
        await emitEvent(runId, "tool_result", { error: result.error }, { toolName: toolCall.name });
        return result;
    }

    // Defense-in-depth: reject tool calls not allowed in the current mode
    if (agentMode) {
        const allowed = getEffectiveAllowedTools(agentMode);
        if (allowed && allowed.length > 0 && !allowed.includes(toolCall.name)) {
            const result: ToolResult = {
                callId: toolCall.id,
                result: null,
                error: `Tool "${toolCall.name}" is not available in ${agentMode} mode.`,
            };
            await emitEvent(runId, "tool_result", { error: result.error }, { toolName: toolCall.name });
            return result;
        }
    }

    const tool = getTool(toolCall.name);

    // Resolve autonomy level — use cached config if provided to avoid a redundant DB round-trip per tool call
    const autonomyConfig = cachedAutonomyConfig ?? await getAutonomyConfig(userId, projectId);
    const configuredLevel = getToolAutonomyLevel(toolCall.name, {
        preset: autonomyConfig.preset,
        toolOverrides: (autonomyConfig.toolOverrides ?? {}) as Record<string, unknown>,
    });
    const level = resolveAutonomyLevel(toolCall.name, configuredLevel, tool?.autonomy);

    // Emit tool_call event
    await emitEvent(runId, "tool_call", {
        toolName: toolCall.name,
        arguments: toolCall.arguments,
        autonomyLevel: level,
    }, { toolName: toolCall.name });

    // Level 0 (Disabled): don't execute
    if (level === 0) {
        const result: ToolResult = {
            callId: toolCall.id,
            result: null,
            error: `Tool "${toolCall.name}" is disabled by autonomy configuration.`,
        };
        await emitEvent(runId, "tool_result", { error: result.error }, { toolName: toolCall.name });
        return result;
    }

    // Level 1 (Suggest): don't execute, return suggestion
    if (level === 1) {
        const result: ToolResult = {
            callId: toolCall.id,
            result: `[Suggestion] I would call "${toolCall.name}" with: ${JSON.stringify(toolCall.arguments)}. Approve this action to proceed.`,
        };
        await emitEvent(runId, "tool_result", { suggestion: true }, { toolName: toolCall.name });
        return result;
    }

    // Level >= 2: execute the tool
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
            parentRunId: runId,
            systemContexts: runtimeContext?.systemContexts,
            protocolData: runtimeContext?.protocolData ?? null,
            signal: runtimeContext?.signal,
            autonomyLevel: level,
        },
    });
    const durationMs = Date.now() - startTime;
    toolSpan.update({ output: { success: !result.error, durationMs } }).end();

    // Emit tool_result event
    await emitEvent(runId, "tool_result", {
        success: !result.error,
        error: result.error,
    }, { toolName: toolCall.name, durationMs });

    // If tool errored, just return the result
    if (result.error) {
        return result;
    }

    // Determine artifact type from tool name
    const artifactType = mapToolToArtifactType(toolCall.name);

    let artifactResult: ToolResultWithArtifactState = result;

    if (artifactType && result.result && projectId) {
        if (level === 2) {
            // Propose: create artifact with "proposed" status, yield to client
            const artifact = await createArtifact({
                runId,
                projectId,
                conversationId,
                userId,
                type: artifactType,
                title: mapToolToArtifactTitle(toolCall.name, toolCall.arguments),
                payload: result.result,
            });

            yield {
                type: "artifact",
                artifactId: artifact.id,
                artifactType: artifact.type as ToolResultWithArtifactState["artifactType"],
                artifactStatus: "proposed",
                artifactTitle: artifact.title,
                artifactPayload: artifact.payload,
                artifactVersion: 1,
            };
            artifactResult = {
                ...result,
                artifactId: artifact.id,
                artifactType: artifact.type as ToolResultWithArtifactState["artifactType"],
                artifactTitle: artifact.title,
                artifactStatus: "proposed",
            };
        } else if (level === 3) {
            // Auto-notify: create artifact as auto_applied, apply it, yield to client
            const artifact = await createArtifact({
                runId,
                projectId,
                conversationId,
                userId,
                type: artifactType,
                title: mapToolToArtifactTitle(toolCall.name, toolCall.arguments),
                payload: result.result,
            });

            await applyArtifact(artifact.id, "auto_applied");

            yield {
                type: "artifact",
                artifactId: artifact.id,
                artifactType: artifact.type as ToolResultWithArtifactState["artifactType"],
                artifactStatus: "auto_applied",
                artifactTitle: artifact.title,
                artifactPayload: artifact.payload,
                artifactVersion: 1,
            };
            artifactResult = {
                ...result,
                artifactId: artifact.id,
                artifactType: artifact.type as ToolResultWithArtifactState["artifactType"],
                artifactTitle: artifact.title,
                artifactStatus: "auto_applied",
            };
        }
        // Level 4 (Auto-silent): execute + apply but don't yield artifact to client
        else if (level === 4) {
            const artifact = await createArtifact({
                runId,
                projectId,
                conversationId,
                userId,
                type: artifactType,
                title: mapToolToArtifactTitle(toolCall.name, toolCall.arguments),
                payload: result.result,
            });

            await applyArtifact(artifact.id, "auto_applied");
            artifactResult = {
                ...result,
                artifactId: artifact.id,
                artifactType: artifact.type as ToolResultWithArtifactState["artifactType"],
                artifactTitle: artifact.title,
                artifactStatus: "auto_applied",
            };
        }
    }

    return artifactResult;
}
