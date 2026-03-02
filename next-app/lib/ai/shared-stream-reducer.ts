import { appendReasoningRaw } from "@/lib/ai/reasoning-visibility";
import type { AIStreamChunk, ChoiceOption, CopilotPage, UserInputRequest } from "@/types/ai";

export type SharedToolStatus = "queued" | "running" | "done" | "failed";

export type SharedStreamState = {
  aiMessageCreated: boolean;
  fullContent: string;
  reasoningContent: string;
  reasoningState: "streaming" | "done";
  reasoningTruncated: boolean;
  activeReasoningId: string | null;
  runningToolCallIds: string[];
  lastToolCallId: string | null;
  syntheticToolCounter: number;
  localRunId: string;
  effectiveConvId: string | null;
};

export type SharedStreamIntent =
  | {
      type: "assistant_upsert";
      text: string;
      reasoning?: {
        text: string;
        state: "streaming" | "done";
        truncated?: boolean;
      };
    }
  | {
      type: "progress_upsert";
      message: string;
      current?: number;
      total?: number;
    }
  | { type: "progress_clear" }
  | {
      type: "tool_activity_upsert";
      callId: string;
      toolName: string;
      status: SharedToolStatus;
      summary?: string;
    }
  | {
      type: "artifact_emit";
      artifactId?: string;
      artifactType?: string;
      artifactStatus?: string;
      artifactTitle?: string;
      artifactPayload?: unknown;
      artifactVersion?: number;
    }
  | {
      type: "plan_step_update";
      planId: string;
      stepIndex: number;
      stepStatus: string;
    }
  | {
      type: "checkpoint_append";
      label: string;
    }
  | {
      type: "stream_error";
      message: string;
    }
  | {
      type: "run_set";
      runId: string | null;
    }
  | {
      type: "conversation_sync";
      conversationId: string;
    }
  | {
      type: "conversation_title";
      conversationId?: string;
      title: string;
    }
  | {
      type: "choices_set";
      choices: ChoiceOption[];
    }
  | {
      type: "user_input_set";
      request: UserInputRequest;
    }
  | {
      type: "user_input_append";
      request: UserInputRequest;
      page: CopilotPage;
      section?: string;
    }
  | {
      type: "navigate";
      url: string;
      projectId?: string;
    }
  | {
      type: "ledger_changed";
    };

export type SharedStreamReduceMeta = {
  page: CopilotPage;
  section?: string;
};

export function createInitialSharedStreamState(
  overrides?: Partial<SharedStreamState>,
): SharedStreamState {
  return {
    aiMessageCreated: false,
    fullContent: "",
    reasoningContent: "",
    reasoningState: "done",
    reasoningTruncated: false,
    activeReasoningId: null,
    runningToolCallIds: [],
    lastToolCallId: null,
    syntheticToolCounter: 0,
    localRunId: "",
    effectiveConvId: null,
    ...overrides,
  };
}

function assistantIntentFromState(state: SharedStreamState): SharedStreamIntent {
  const trimmedReasoning = state.reasoningContent.trim();
  return {
    type: "assistant_upsert",
    text: state.fullContent,
    reasoning: trimmedReasoning
      ? {
          text: state.reasoningContent,
          state: state.reasoningState,
          truncated: state.reasoningTruncated || undefined,
        }
      : undefined,
  };
}

function resolveToolCallId(
  state: SharedStreamState,
  incomingCallId?: string,
): { callId: string; syntheticToolCounter: number } {
  if (incomingCallId && incomingCallId.trim()) {
    return {
      callId: incomingCallId,
      syntheticToolCounter: state.syntheticToolCounter,
    };
  }
  const nextCounter = state.syntheticToolCounter + 1;
  return {
    callId: `synthetic-tool-${nextCounter}`,
    syntheticToolCounter: nextCounter,
  };
}

function appendUniqueCallId(callIds: string[], callId: string): string[] {
  if (callIds.includes(callId)) return callIds;
  return [...callIds, callId];
}

function removeCallId(callIds: string[], callId: string): string[] {
  return callIds.filter((id) => id !== callId);
}

export function reduceSharedStreamChunk(
  prev: SharedStreamState,
  chunk: AIStreamChunk,
  meta: SharedStreamReduceMeta,
): { state: SharedStreamState; intents: SharedStreamIntent[] } {
  const intents: SharedStreamIntent[] = [];
  let next = prev;

  switch (chunk.type) {
    case "content": {
      const delta = chunk.content ?? "";
      next = {
        ...prev,
        aiMessageCreated: true,
        fullContent: `${prev.fullContent}${delta}`,
      };
      intents.push({ type: "progress_clear" });
      intents.push(assistantIntentFromState(next));
      return { state: next, intents };
    }

    case "reasoning_start": {
      const activeReasoningId = chunk.reasoningId ?? prev.activeReasoningId ?? "reasoning";
      const prepend = prev.reasoningContent.trim().length > 0 ? `${prev.reasoningContent}\n\n` : prev.reasoningContent;
      next = {
        ...prev,
        aiMessageCreated: true,
        reasoningContent: prepend,
        reasoningState: "streaming",
        activeReasoningId,
      };
      intents.push(assistantIntentFromState(next));
      return { state: next, intents };
    }

    case "reasoning_delta": {
      if (prev.activeReasoningId && chunk.reasoningId && chunk.reasoningId !== prev.activeReasoningId) {
        return { state: prev, intents };
      }
      if (prev.reasoningTruncated) return { state: prev, intents };
      const delta = chunk.reasoningText ?? "";
      if (!delta) return { state: prev, intents };
      const appended = appendReasoningRaw(prev.reasoningContent, delta);
      next = {
        ...prev,
        aiMessageCreated: true,
        reasoningContent: appended.raw,
        reasoningState: "streaming",
        reasoningTruncated: prev.reasoningTruncated || appended.truncated,
        activeReasoningId: chunk.reasoningId ?? prev.activeReasoningId,
      };
      intents.push(assistantIntentFromState(next));
      return { state: next, intents };
    }

    case "reasoning_end": {
      if (prev.activeReasoningId && chunk.reasoningId && chunk.reasoningId !== prev.activeReasoningId) {
        return { state: prev, intents };
      }
      next = {
        ...prev,
        aiMessageCreated: true,
        reasoningState: "done",
        activeReasoningId: null,
      };
      intents.push(assistantIntentFromState(next));
      return { state: next, intents };
    }

    case "tool_call": {
      const { callId, syntheticToolCounter } = resolveToolCallId(prev, chunk.toolCall?.id);
      const toolName = chunk.toolCall?.name ?? "tool";
      const runningToolCallIds = appendUniqueCallId(prev.runningToolCallIds ?? [], callId);
      next = {
        ...prev,
        runningToolCallIds,
        lastToolCallId: callId,
        syntheticToolCounter,
      };
      intents.push({
        type: "tool_activity_upsert",
        callId,
        toolName,
        status: "running",
      });
      return { state: next, intents };
    }

    case "tool_result": {
      const runningToolCallIds = prev.runningToolCallIds ?? [];
      const fallbackCallId = prev.lastToolCallId ?? runningToolCallIds[runningToolCallIds.length - 1] ?? null;
      const callId = chunk.toolResult?.callId ?? fallbackCallId;
      if (callId) {
        intents.push({
          type: "tool_activity_upsert",
          callId,
          toolName: chunk.toolName ?? "tool",
          status: chunk.toolResult?.error ? "failed" : "done",
          summary: chunk.toolResult?.error ?? undefined,
        });
      }
      if (chunk.toolName === "add_to_ledger" || chunk.toolName === "exclude_study") {
        intents.push({ type: "ledger_changed" });
      }
      const nextRunningToolCallIds = callId
        ? removeCallId(runningToolCallIds, callId)
        : runningToolCallIds;
      const nextLastToolCallId = callId && callId === prev.lastToolCallId
        ? nextRunningToolCallIds[nextRunningToolCallIds.length - 1] ?? null
        : prev.lastToolCallId;
      next = {
        ...prev,
        runningToolCallIds: nextRunningToolCallIds,
        lastToolCallId: nextLastToolCallId,
      };
      return { state: next, intents };
    }

    case "artifact": {
      intents.push({
        type: "artifact_emit",
        artifactId: chunk.artifactId,
        artifactType: chunk.artifactType,
        artifactStatus: chunk.artifactStatus,
        artifactTitle: chunk.artifactTitle,
        artifactPayload: chunk.artifactPayload,
        artifactVersion: chunk.artifactVersion,
      });
      return { state: prev, intents };
    }

    case "progress": {
      intents.push({
        type: "progress_upsert",
        message: chunk.progressMessage ?? "Working...",
        current: chunk.progressCurrent,
        total: chunk.progressTotal,
      });
      return { state: prev, intents };
    }

    case "checkpoint": {
      intents.push({
        type: "checkpoint_append",
        label: chunk.checkpointLabel ?? "Checkpoint",
      });
      return { state: prev, intents };
    }

    case "run_start": {
      next = {
        ...prev,
        localRunId: chunk.runId ?? "",
      };
      intents.push({ type: "run_set", runId: chunk.runId ?? null });
      if (chunk.conversationId && chunk.conversationId !== prev.effectiveConvId) {
        next = {
          ...next,
          effectiveConvId: chunk.conversationId,
        };
        intents.push({ type: "conversation_sync", conversationId: chunk.conversationId });
      }
      return { state: next, intents };
    }

    case "run_end": {
      intents.push({ type: "run_set", runId: null });
      const runningToolCallIds = prev.runningToolCallIds ?? [];
      for (const callId of runningToolCallIds) {
        intents.push({
          type: "tool_activity_upsert",
          callId,
          toolName: "tool",
          status: "failed",
          summary: "Run ended before tool completion.",
        });
      }
      next = {
        ...prev,
        runningToolCallIds: [],
        lastToolCallId: null,
      };
      return { state: next, intents };
    }

    case "conversation_title": {
      const title = chunk.conversationTitle?.trim();
      if (!title) return { state: prev, intents };
      intents.push({
        type: "conversation_title",
        conversationId: chunk.conversationId ?? prev.effectiveConvId ?? undefined,
        title,
      });
      return { state: prev, intents };
    }

    case "choices": {
      intents.push({ type: "choices_set", choices: chunk.choices ?? [] });
      return { state: prev, intents };
    }

    case "plan_step_update": {
      if (chunk.planId && chunk.stepIndex !== undefined && chunk.stepStatus) {
        intents.push({
          type: "plan_step_update",
          planId: chunk.planId,
          stepIndex: chunk.stepIndex,
          stepStatus: chunk.stepStatus,
        });
      }
      return { state: prev, intents };
    }

    case "navigate": {
      if (chunk.navigateUrl) {
        intents.push({
          type: "navigate",
          url: chunk.navigateUrl,
          projectId: chunk.navigateProjectId,
        });
      }
      return { state: prev, intents };
    }

    case "user_input_required": {
      if (!chunk.userInputRequest) return { state: prev, intents };
      intents.push({
        type: "user_input_set",
        request: chunk.userInputRequest,
      });
      intents.push({
        type: "user_input_append",
        request: chunk.userInputRequest,
        page: meta.page,
        section: meta.section,
      });
      return { state: prev, intents };
    }

    case "error": {
      intents.push({
        type: "stream_error",
        message: chunk.error ?? "Unknown error",
      });
      return { state: prev, intents };
    }

    case "done": {
      return { state: prev, intents };
    }

    default: {
      return { state: prev, intents };
    }
  }
}
