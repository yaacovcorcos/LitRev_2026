import type { AIStreamChunk, ChoiceOption, ToolCall, ToolResult } from "@/types/ai";

type SharedFields = {
  conversationId?: string;
};

export type RuntimeStreamEvent =
  | ({ type: "content"; content: string } & SharedFields)
  | ({ type: "reasoning_start"; reasoningId: string } & SharedFields)
  | ({ type: "reasoning_delta"; reasoningId: string; reasoningText: string } & SharedFields)
  | ({ type: "reasoning_end"; reasoningId: string } & SharedFields)
  | ({ type: "tool_call"; toolCall: ToolCall } & SharedFields)
  | ({ type: "tool_result"; toolResult: ToolResult; toolName?: string } & SharedFields)
  | ({ type: "done"; usage?: AIStreamChunk["usage"] } & SharedFields)
  | ({ type: "error"; error: string } & SharedFields)
  | ({
      type: "artifact";
      artifactId: string;
      artifactType: string;
      artifactStatus: string;
      artifactTitle: string;
      artifactPayload?: unknown;
      artifactVersion: number;
    } & SharedFields)
  | ({
      type: "progress";
      progressMessage: string;
      progressCurrent?: number;
      progressTotal?: number;
    } & SharedFields)
  | ({ type: "checkpoint"; checkpointLabel: string } & SharedFields)
  | ({ type: "run_start"; runId?: string } & SharedFields)
  | ({
      type: "run_end";
      runId?: string;
      runStatus?: string;
      runCostTokensIn?: number;
      runCostTokensOut?: number;
      stopReason?: string;
      iterationCount?: number;
      toolCallCount?: number;
    } & SharedFields)
  | ({
      type: "conversation_title";
      conversationId?: string;
      conversationTitle: string;
    } & SharedFields)
  | ({ type: "choices"; choices: ChoiceOption[] } & SharedFields)
  | ({
      type: "plan_step_update";
      planId: string;
      stepIndex: number;
      stepStatus: string;
    } & SharedFields)
  | ({ type: "navigate"; navigateUrl: string; navigateProjectId?: string } & SharedFields);

export function normalizeStreamChunk(chunk: AIStreamChunk): RuntimeStreamEvent | null {
  const conversationId = chunk.conversationId;
  switch (chunk.type) {
    case "content":
      return { type: "content", content: chunk.content ?? "", conversationId };
    case "reasoning_start":
      if (!chunk.reasoningId) return null;
      return { type: "reasoning_start", reasoningId: chunk.reasoningId, conversationId };
    case "reasoning_delta":
      if (!chunk.reasoningId) return null;
      return {
        type: "reasoning_delta",
        reasoningId: chunk.reasoningId,
        reasoningText: chunk.reasoningText ?? "",
        conversationId,
      };
    case "reasoning_end":
      if (!chunk.reasoningId) return null;
      return { type: "reasoning_end", reasoningId: chunk.reasoningId, conversationId };
    case "tool_call":
      if (!chunk.toolCall) return null;
      return { type: "tool_call", toolCall: chunk.toolCall, conversationId };
    case "tool_result":
      if (!chunk.toolResult) return null;
      return {
        type: "tool_result",
        toolResult: chunk.toolResult,
        toolName: chunk.toolName,
        conversationId,
      };
    case "done":
      return { type: "done", usage: chunk.usage, conversationId };
    case "error":
      return { type: "error", error: chunk.error ?? "Unknown error", conversationId };
    case "artifact":
      if (!chunk.artifactId || !chunk.artifactType) return null;
      return {
        type: "artifact",
        artifactId: chunk.artifactId,
        artifactType: chunk.artifactType,
        artifactStatus: chunk.artifactStatus ?? "proposed",
        artifactTitle: chunk.artifactTitle ?? "Artifact",
        artifactPayload: chunk.artifactPayload,
        artifactVersion: chunk.artifactVersion ?? 1,
        conversationId,
      };
    case "progress":
      return {
        type: "progress",
        progressMessage: chunk.progressMessage ?? "Working...",
        progressCurrent: chunk.progressCurrent,
        progressTotal: chunk.progressTotal,
        conversationId,
      };
    case "checkpoint":
      return {
        type: "checkpoint",
        checkpointLabel: chunk.checkpointLabel ?? "Checkpoint",
        conversationId,
      };
    case "run_start":
      return { type: "run_start", runId: chunk.runId, conversationId };
    case "run_end":
      return {
        type: "run_end",
        runId: chunk.runId,
        runStatus: chunk.runStatus,
        runCostTokensIn: chunk.runCostTokensIn,
        runCostTokensOut: chunk.runCostTokensOut,
        stopReason: chunk.stopReason,
        iterationCount: chunk.iterationCount,
        toolCallCount: chunk.toolCallCount,
        conversationId,
      };
    case "conversation_title":
      if (!chunk.conversationTitle) return null;
      return {
        type: "conversation_title",
        conversationId: chunk.conversationId,
        conversationTitle: chunk.conversationTitle,
      };
    case "choices":
      if (!chunk.choices || chunk.choices.length === 0) return null;
      return { type: "choices", choices: chunk.choices, conversationId };
    case "plan_step_update":
      if (!chunk.planId || chunk.stepIndex === undefined || !chunk.stepStatus) return null;
      return {
        type: "plan_step_update",
        planId: chunk.planId,
        stepIndex: chunk.stepIndex,
        stepStatus: chunk.stepStatus,
        conversationId,
      };
    case "navigate":
      if (!chunk.navigateUrl) return null;
      return {
        type: "navigate",
        navigateUrl: chunk.navigateUrl,
        navigateProjectId: chunk.navigateProjectId,
        conversationId,
      };
    default:
      return null;
  }
}

export function toWireChunk(event: RuntimeStreamEvent): AIStreamChunk {
  switch (event.type) {
    case "content":
      return { type: "content", content: event.content, conversationId: event.conversationId };
    case "reasoning_start":
      return {
        type: "reasoning_start",
        reasoningId: event.reasoningId,
        conversationId: event.conversationId,
      };
    case "reasoning_delta":
      return {
        type: "reasoning_delta",
        reasoningId: event.reasoningId,
        reasoningText: event.reasoningText,
        conversationId: event.conversationId,
      };
    case "reasoning_end":
      return {
        type: "reasoning_end",
        reasoningId: event.reasoningId,
        conversationId: event.conversationId,
      };
    case "tool_call":
      return { type: "tool_call", toolCall: event.toolCall, conversationId: event.conversationId };
    case "tool_result":
      return {
        type: "tool_result",
        toolResult: event.toolResult,
        toolName: event.toolName,
        conversationId: event.conversationId,
      };
    case "done":
      return { type: "done", usage: event.usage, conversationId: event.conversationId };
    case "error":
      return { type: "error", error: event.error, conversationId: event.conversationId };
    case "artifact":
      return {
        type: "artifact",
        artifactId: event.artifactId,
        artifactType: event.artifactType,
        artifactStatus: event.artifactStatus,
        artifactTitle: event.artifactTitle,
        artifactPayload: event.artifactPayload,
        artifactVersion: event.artifactVersion,
        conversationId: event.conversationId,
      };
    case "progress":
      return {
        type: "progress",
        progressMessage: event.progressMessage,
        progressCurrent: event.progressCurrent,
        progressTotal: event.progressTotal,
        conversationId: event.conversationId,
      };
    case "checkpoint":
      return {
        type: "checkpoint",
        checkpointLabel: event.checkpointLabel,
        conversationId: event.conversationId,
      };
    case "run_start":
      return { type: "run_start", runId: event.runId, conversationId: event.conversationId };
    case "run_end":
      return {
        type: "run_end",
        runId: event.runId,
        runStatus: event.runStatus,
        runCostTokensIn: event.runCostTokensIn,
        runCostTokensOut: event.runCostTokensOut,
        stopReason: event.stopReason,
        iterationCount: event.iterationCount,
        toolCallCount: event.toolCallCount,
        conversationId: event.conversationId,
      };
    case "conversation_title":
      return {
        type: "conversation_title",
        conversationId: event.conversationId,
        conversationTitle: event.conversationTitle,
      };
    case "choices":
      return { type: "choices", choices: event.choices, conversationId: event.conversationId };
    case "plan_step_update":
      return {
        type: "plan_step_update",
        planId: event.planId,
        stepIndex: event.stepIndex,
        stepStatus: event.stepStatus,
        conversationId: event.conversationId,
      };
    case "navigate":
      return {
        type: "navigate",
        navigateUrl: event.navigateUrl,
        navigateProjectId: event.navigateProjectId,
        conversationId: event.conversationId,
      };
  }
}
