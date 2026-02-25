import type { CopilotMessage } from "@/lib/projectCopilotStorage";
import type { ArtifactData, ArtifactStatus, ArtifactType } from "@/types/artifacts";
import type { AIStreamChunk, ChoiceOption, CopilotPage } from "@/types/ai";
import { appendReasoningRaw } from "@/lib/ai/reasoning-visibility";

export type StreamMutableState = {
  aiMessageCreated: boolean;
  fullContent: string;
  reasoningContent: string;
  reasoningState: "streaming" | "done";
  reasoningTruncated: boolean;
  activeReasoningId: string | null;
  localRunId: string;
  effectiveConvId: string | null;
};

type StreamChunkDeps = {
  aiMessageId: string;
  page: CopilotPage;
  section?: string;
  projectId: string;
  myGen: number;
  getCurrentGen: () => number;
  setCurrentRunId: (runId: string | null) => void;
  syncConversationId: (conversationId: string) => void;
  upsertConversationTitle: (conversationId: string, title: string) => void;
  upsertArtifact: (artifact: ArtifactData) => void;
  updateMessages: (updater: (messages: CopilotMessage[]) => CopilotMessage[]) => void;
  emitLedgerChanged: () => void;
  setPendingChoices: (choices: ChoiceOption[]) => void;
  onPlanStepUpdate?: (planId: string, stepIndex: number, stepStatus: string) => void;
};

function appendAssistantMessage(
  deps: StreamChunkDeps,
  state: StreamMutableState,
  text: string
): StreamMutableState {
  if (!state.aiMessageCreated) {
    const aiMessage: CopilotMessage = {
      id: deps.aiMessageId,
      sender: "ai",
      text,
      reasoning: state.reasoningContent
        ? {
            text: state.reasoningContent,
            state: state.reasoningState,
            truncated: state.reasoningTruncated || undefined,
          }
        : undefined,
      createdAt: new Date().toISOString(),
      context: { page: deps.page, section: deps.section },
    };
    deps.updateMessages((messages) => [...messages, aiMessage]);
    return { ...state, aiMessageCreated: true };
  }

  deps.updateMessages((messages) =>
    messages.map((msg) => {
      if (msg.id !== deps.aiMessageId) return msg;
      const nextReasoning = state.reasoningContent
        ? {
            text: state.reasoningContent,
            state: state.reasoningState,
            truncated: state.reasoningTruncated || undefined,
          }
        : msg.reasoning;
      return {
        ...msg,
        text,
        reasoning: nextReasoning,
      };
    })
  );
  return state;
}

function upsertAssistantReasoning(
  deps: StreamChunkDeps,
  state: StreamMutableState
): StreamMutableState {
  if (!state.aiMessageCreated) {
    const aiMessage: CopilotMessage = {
      id: deps.aiMessageId,
      sender: "ai",
      text: state.fullContent,
      reasoning: state.reasoningContent
        ? {
            text: state.reasoningContent,
            state: state.reasoningState,
            truncated: state.reasoningTruncated || undefined,
          }
        : undefined,
      createdAt: new Date().toISOString(),
      context: { page: deps.page, section: deps.section },
    };
    deps.updateMessages((messages) => [...messages, aiMessage]);
    return { ...state, aiMessageCreated: true };
  }

  deps.updateMessages((messages) =>
    messages.map((msg) =>
      msg.id === deps.aiMessageId
        ? {
            ...msg,
            text: state.fullContent,
            reasoning: {
              text: state.reasoningContent,
              state: state.reasoningState,
              truncated: state.reasoningTruncated || undefined,
            },
          }
        : msg
    )
  );
  return state;
}

const TOOL_PROGRESS_LABELS: Record<string, string> = {
  search_pubmed: "Searching PubMed...",
  add_to_ledger: "Adding studies to ledger...",
};

type ChunkHandler = (
  data: AIStreamChunk,
  state: StreamMutableState,
  deps: StreamChunkDeps
) => StreamMutableState;

const chunkHandlers: Partial<Record<AIStreamChunk["type"], ChunkHandler>> = {
  content: (data, state, deps) => {
    const nextContent = `${state.fullContent}${data.content ?? ""}`;
    const nextState = { ...state, fullContent: nextContent };
    return appendAssistantMessage(deps, nextState, nextContent);
  },
  reasoning_start: (data, state, deps) => {
    const activeReasoningId = data.reasoningId ?? `reasoning-${Date.now()}`;
    const nextReasoning =
      state.reasoningContent.trim().length > 0 ? `${state.reasoningContent}\n\n` : state.reasoningContent;
    const nextState: StreamMutableState = {
      ...state,
      reasoningContent: nextReasoning,
      reasoningState: "streaming",
      activeReasoningId,
    };
    return upsertAssistantReasoning(deps, nextState);
  },
  reasoning_delta: (data, state, deps) => {
    // Ignore stale/foreign reasoning chunks when an active reasoning block is set.
    if (state.activeReasoningId && data.reasoningId && data.reasoningId !== state.activeReasoningId) {
      return state;
    }
    if (state.reasoningTruncated) return state;
    const delta = data.reasoningText ?? "";
    if (!delta) return state;
    const nextReasoning = appendReasoningRaw(state.reasoningContent, delta);
    const nextState: StreamMutableState = {
      ...state,
      reasoningContent: nextReasoning.raw,
      reasoningState: "streaming",
      reasoningTruncated: state.reasoningTruncated || nextReasoning.truncated,
      activeReasoningId: data.reasoningId ?? state.activeReasoningId,
    };
    return upsertAssistantReasoning(deps, nextState);
  },
  reasoning_end: (data, state, deps) => {
    if (state.activeReasoningId && data.reasoningId && data.reasoningId !== state.activeReasoningId) {
      return state;
    }
    const nextState: StreamMutableState = {
      ...state,
      reasoningState: "done",
      activeReasoningId: null,
    };
    return upsertAssistantReasoning(deps, nextState);
  },
  tool_call: (data, state, deps) => {
    const toolName = data.toolCall?.name ?? "";
    const statusText = TOOL_PROGRESS_LABELS[toolName] ?? `Running ${toolName}...`;
    const nextText = state.fullContent || `*${statusText}*`;
    return appendAssistantMessage(deps, state, nextText);
  },
  tool_result: (data, state, deps) => {
    if (data.toolName === "add_to_ledger" || data.toolName === "exclude_study") {
      deps.emitLedgerChanged();
    }
    if (state.aiMessageCreated && !state.fullContent) {
      deps.updateMessages((messages) =>
        messages.map((msg) =>
          msg.id === deps.aiMessageId ? { ...msg, text: "*Processing results...*" } : msg
        )
      );
    }
    return state;
  },
  run_start: (data, state, deps) => {
    const runId = data.runId ?? "";
    deps.setCurrentRunId(data.runId ?? null);
    let effectiveConvId = state.effectiveConvId;
    if (data.conversationId && data.conversationId !== effectiveConvId) {
      effectiveConvId = data.conversationId;
      deps.syncConversationId(data.conversationId);
    }
    return { ...state, localRunId: runId, effectiveConvId };
  },
  run_end: (_data, state, deps) => {
    deps.setCurrentRunId(null);
    return state;
  },
  conversation_title: (data, state, deps) => {
    const targetId = data.conversationId || state.effectiveConvId;
    const nextTitle = data.conversationTitle?.trim();
    if (targetId && nextTitle) {
      deps.upsertConversationTitle(targetId, nextTitle);
    }
    return state;
  },
  artifact: (data, state, deps) => {
    const artType = (data.artifactType ?? "plan") as ArtifactType;
    const artStatus = (data.artifactStatus ?? "proposed") as ArtifactStatus;
    const artTitle = data.artifactTitle ?? "Artifact";
    const artifactData: ArtifactData = {
      id: data.artifactId ?? `art-${Date.now()}`,
      runId: state.localRunId,
      projectId: deps.projectId,
      conversationId: state.effectiveConvId ?? null,
      type: artType,
      status: artStatus,
      title: artTitle,
      payload: data.artifactPayload ?? {},
      version: data.artifactVersion ?? 1,
      sourceEventId: null,
      appliedAt: null,
      reviewedAt: null,
      reviewNote: null,
      createdAt: new Date().toISOString(),
    };
    deps.upsertArtifact(artifactData);

    const artifactMessage: CopilotMessage = {
      id: `artifact-${artifactData.id}`,
      sender: "ai",
      text: `[${artType}] ${artTitle}`,
      createdAt: new Date().toISOString(),
      context: { page: deps.page },
      artifact: {
        id: artifactData.id,
        type: artType,
        status: artStatus,
        title: artTitle,
        payload: (data.artifactPayload ?? {}) as Record<string, unknown>,
        version: data.artifactVersion ?? 1,
      },
    };
    deps.updateMessages((messages) => [...messages, artifactMessage]);
    return state;
  },
  progress: (data, state, deps) => {
    const progressText = data.progressMessage ?? "Working...";
    if (!state.aiMessageCreated) {
      return appendAssistantMessage(deps, state, `*${progressText}*`);
    }
    if (!state.fullContent) {
      deps.updateMessages((messages) =>
        messages.map((msg) =>
          msg.id === deps.aiMessageId ? { ...msg, text: `*${progressText}*` } : msg
        )
      );
    }
    return state;
  },
  choices: (data, state, deps) => {
    if (data.choices && deps.getCurrentGen() === deps.myGen) {
      deps.setPendingChoices(data.choices);
    }
    return state;
  },
  plan_step_update: (data, state, deps) => {
    if (data.planId && data.stepIndex !== undefined && data.stepStatus) {
      deps.onPlanStepUpdate?.(data.planId, data.stepIndex, data.stepStatus);
    }
    return state;
  },
};

export function handleProjectCopilotStreamChunk(
  data: AIStreamChunk,
  state: StreamMutableState,
  deps: StreamChunkDeps
): StreamMutableState {
  const handler = chunkHandlers[data.type];
  if (!handler) return state;
  return handler(data, state, deps);
}
