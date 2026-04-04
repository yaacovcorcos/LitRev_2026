import type { ProjectConversationMessage } from "@/lib/project-conversation-storage";
import type { ArtifactData, ArtifactStatus, ArtifactType } from "@/types/artifacts";
import type { AIStreamChunk, ChoiceOption, CopilotPage, UserInputRequest } from "@/types/ai";
import {
  createInitialSharedStreamState,
  reduceSharedStreamChunk,
  reserveSharedAssistantTurn,
  type SharedStreamIntent,
  type SharedStreamState,
} from "@/lib/ai/shared-stream-reducer";
import { relocateReservedAssistantAfterTraceSuffix } from "@/lib/ai/assistant-turn-placement";
import { isNavigationSafe } from "@/lib/ai/navigation-safety";
import {
  buildClientErrorState,
  isDeterministicCapabilityFailure,
  matchesCanonicalFailureFallback,
} from "@/lib/ai/stream-error-ui";
import { ABNORMAL_END_TOOL_FAILURE_SUMMARY } from "@/lib/ai/ai-stream-runtime";
import { isArtifactReviewable } from "@/lib/artifacts/reviewability";

export type StreamMutableState = SharedStreamState;

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
  updateMessages: (updater: (messages: ProjectConversationMessage[]) => ProjectConversationMessage[]) => void;
  emitLedgerChanged: () => void;
  setPendingChoices: (choices: ChoiceOption[]) => void;
  setPendingUserInput: (request: UserInputRequest | null) => void;
  onIntent?: (intent: SharedStreamIntent) => void;
  onPlanStepUpdate?: (planId: string, stepIndex: number, stepStatus: string) => void;
  onNavigate?: (url: string) => void;
};

export function createInitialProjectStreamState(
  overrides?: Partial<StreamMutableState>,
): StreamMutableState {
  return createInitialSharedStreamState(overrides);
}

export function failRunningProjectToolActivityMessages(
  messages: ProjectConversationMessage[],
  summary = ABNORMAL_END_TOOL_FAILURE_SUMMARY,
): ProjectConversationMessage[] {
  const completedAt = new Date().toISOString();
  return messages.map((message) => (
    message.toolActivity?.status === "running"
      ? {
          ...message,
          toolActivity: {
            ...message.toolActivity,
            status: "failed",
            summary,
            updatedAt: completedAt,
            completedAt,
          },
        }
      : message
  ));
}

export function interruptRunningProjectToolActivityMessages(
  messages: ProjectConversationMessage[],
  summary = "Connection lost while the run was still active.",
): ProjectConversationMessage[] {
  const updatedAt = new Date().toISOString();
  return messages.map((message) => (
    message.toolActivity?.status === "running"
      ? {
          ...message,
          toolActivity: {
            ...message.toolActivity,
            status: "interrupted",
            summary,
            updatedAt,
          },
        }
      : message
  ));
}

function upsertAssistantMessage(
  deps: StreamChunkDeps,
  payload: Extract<SharedStreamIntent, { type: "assistant_upsert" }>,
) {
  deps.updateMessages((messages) => {
    const idx = messages.findIndex((msg) => msg.id === deps.aiMessageId);
    if (idx < 0) {
      const message: ProjectConversationMessage = {
        id: deps.aiMessageId,
        sender: "ai",
        text: payload.text,
        reasoning: payload.reasoning,
        deliveryState: undefined,
        createdAt: new Date().toISOString(),
        context: { page: deps.page, section: deps.section },
      };
      return repairReservedAssistantPlacement([...messages, message], deps.aiMessageId);
    }

    const next = [...messages];
    const existing = next[idx];
    if (!existing) return messages;
    next[idx] = {
      ...existing,
      text: payload.text,
      reasoning: payload.reasoning ?? existing.reasoning,
      deliveryState: undefined,
    };
    return repairReservedAssistantPlacement(next, deps.aiMessageId);
  });
}

function reserveAssistantMessage(deps: StreamChunkDeps) {
  deps.updateMessages((messages) => {
    const idx = messages.findIndex((msg) => msg.id === deps.aiMessageId);
    if (idx < 0) {
      const message: ProjectConversationMessage = {
        id: deps.aiMessageId,
        sender: "ai",
        text: "",
        createdAt: new Date().toISOString(),
        context: { page: deps.page, section: deps.section },
        deliveryState: "reserved",
      };
      return [...messages, message];
    }

    const next = [...messages];
    const existing = next[idx];
    if (!existing) return messages;
    next[idx] = {
      ...existing,
      deliveryState: "reserved",
    };
    return next;
  });
}

function stripReservedAssistantMessage(
  messages: ProjectConversationMessage[],
  assistantMessageId: string,
): ProjectConversationMessage[] {
  return messages.filter((message) => !(
    message.id === assistantMessageId
    && message.sender === "ai"
    && message.deliveryState === "reserved"
    && !message.text
    && !message.reasoning?.text
    && !message.streamError
  ));
}

function isMoveableProjectTraceOrProgressMessage(message: ProjectConversationMessage): boolean {
  if (message.progress || message.toolActivity || message.checkpoint) {
    return true;
  }
  if (message.artifact) {
    return !isArtifactReviewable(message.artifact.status as ArtifactStatus);
  }
  return false;
}

function repairReservedAssistantPlacement(
  messages: ProjectConversationMessage[],
  assistantMessageId: string,
): ProjectConversationMessage[] {
  return relocateReservedAssistantAfterTraceSuffix(messages, {
    assistantId: assistantMessageId,
    isReservedAssistant: (message, id) => (
      message.id === id
      && message.sender === "ai"
      && message.deliveryState === "reserved"
    ),
    isMoveableTraceOrProgress: isMoveableProjectTraceOrProgressMessage,
  });
}

function upsertProgressMessage(
  deps: StreamChunkDeps,
  payload: Extract<SharedStreamIntent, { type: "progress_upsert" }>,
) {
  const messageId = `progress-${deps.myGen}`;
  const now = new Date().toISOString();

  deps.updateMessages((messages) => {
    const scopedMessages = messages.filter((message) => !message.progress || message.id === messageId);
    const idx = scopedMessages.findIndex((message) => message.id === messageId);
    if (idx < 0) {
      const nextMessage: ProjectConversationMessage = {
        id: messageId,
        sender: "ai",
        text: "",
        createdAt: now,
        context: { page: deps.page, section: deps.section },
        progress: {
          message: payload.message,
          current: payload.current,
          total: payload.total,
        },
      };
      return repairReservedAssistantPlacement([...scopedMessages, nextMessage], deps.aiMessageId);
    }

    const next = [...scopedMessages];
    next[idx] = {
      ...next[idx],
      progress: {
        message: payload.message,
        current: payload.current,
        total: payload.total,
      },
    };
    return repairReservedAssistantPlacement(next, deps.aiMessageId);
  });
}

function clearProgressMessage(deps: StreamChunkDeps) {
  deps.updateMessages((messages) => messages.filter((message) => !message.progress));
}

function upsertToolActivityMessage(
  deps: StreamChunkDeps,
  payload: Extract<SharedStreamIntent, { type: "tool_activity_upsert" }>,
) {
  const messageId = `tool-${payload.callId}`;
  const now = new Date().toISOString();

  deps.updateMessages((messages) => {
    const idx = messages.findIndex((message) => message.id === messageId);
    if (idx < 0) {
      const nextMessage: ProjectConversationMessage = {
        id: messageId,
        sender: "ai",
        text: "",
        createdAt: now,
        context: { page: deps.page, section: deps.section },
        toolActivity: {
          callId: payload.callId,
          toolName: payload.toolName,
          status: payload.status,
          summary: payload.summary,
          queryPreview: payload.queryPreview,
          returnedCount: payload.returnedCount,
          totalResults: payload.totalResults,
          resultIdentifiers: payload.resultIdentifiers,
          errorMeta: payload.errorMeta,
          startedAt: now,
          updatedAt: now,
          completedAt: payload.status === "done" || payload.status === "failed" ? now : undefined,
        },
      };
      return repairReservedAssistantPlacement([...messages, nextMessage], deps.aiMessageId);
    }

    const next = [...messages];
    const existing = next[idx];
    if (!existing?.toolActivity) return messages;
    next[idx] = {
      ...existing,
      toolActivity: {
        ...existing.toolActivity,
        status: payload.status,
        summary: payload.summary ?? existing.toolActivity.summary,
        queryPreview: payload.queryPreview ?? existing.toolActivity.queryPreview,
        returnedCount: payload.returnedCount ?? existing.toolActivity.returnedCount,
        totalResults: payload.totalResults ?? existing.toolActivity.totalResults,
        resultIdentifiers: payload.resultIdentifiers ?? existing.toolActivity.resultIdentifiers,
        errorMeta: payload.errorMeta ?? existing.toolActivity.errorMeta,
        updatedAt: now,
        completedAt:
          payload.status === "done" || payload.status === "failed"
            ? now
            : existing.toolActivity.completedAt,
      },
    };
    return repairReservedAssistantPlacement(next, deps.aiMessageId);
  });
}

function appendUserInputMessage(
  deps: StreamChunkDeps,
  payload: Extract<SharedStreamIntent, { type: "user_input_append" }>,
) {
  deps.updateMessages((messages) => {
    const messageId = `user-input-${payload.request.callId}`;
    if (messages.some((message) => message.id === messageId)) return messages;
    const nextMessage: ProjectConversationMessage = {
      id: messageId,
      sender: "ai",
      text: "",
      createdAt: new Date().toISOString(),
      context: {
        page: payload.page,
        section: payload.section,
      },
      userInputRequest: {
        ...payload.request,
        resolution: payload.request.resolution,
        answered: false,
      },
    };
    return [...messages, nextMessage];
  });
}

function resolveUserInputMessage(
  deps: StreamChunkDeps,
  payload: Extract<SharedStreamIntent, { type: "user_input_resolve" }>,
) {
  deps.updateMessages((messages) => messages.map((message) => {
    if (message.userInputRequest?.callId !== payload.resolution.callId) {
      return message;
    }
    const isCancelled = payload.resolution.resolution === "cancelled";
    return {
      ...message,
      userInputRequest: {
        ...message.userInputRequest,
        questionId: payload.resolution.questionId ?? message.userInputRequest.questionId,
        resolution: payload.resolution.resolution,
        answered: !isCancelled,
        answer: payload.resolution.answerText ?? message.userInputRequest.answer,
      },
    };
  }));
}

function appendCheckpointMessage(
  deps: StreamChunkDeps,
  payload: Extract<SharedStreamIntent, { type: "checkpoint_append" }>,
) {
  deps.updateMessages((messages) => {
    const messageId = `checkpoint-${Date.now()}`;
    const nextMessage: ProjectConversationMessage = {
      id: messageId,
      sender: "ai",
      text: "",
      createdAt: new Date().toISOString(),
      context: { page: deps.page, section: deps.section },
      checkpoint: {
        label: payload.label,
      },
    };
    return repairReservedAssistantPlacement([...messages, nextMessage], deps.aiMessageId);
  });
}

function appendStreamErrorMessage(
  deps: StreamChunkDeps,
  payload: Extract<SharedStreamIntent, { type: "stream_error" }>,
) {
  const errorState = buildClientErrorState(payload.errorMeta ?? payload.message);
  deps.updateMessages((messages) => {
    const visibleMessages = stripReservedAssistantMessage(messages, deps.aiMessageId);
    const normalizedMessages = isDeterministicCapabilityFailure(errorState.errorMeta)
      ? visibleMessages.filter((message) => (
        !(message.sender === "ai"
          && !message.streamError
          && matchesCanonicalFailureFallback({
            assistantText: message.text,
            streamError: errorState.errorMeta,
          }))
      ))
      : visibleMessages;

    return [
      ...normalizedMessages,
      {
        id: `error-${Date.now()}`,
        sender: "ai",
        text: errorState.message,
        streamError: errorState.errorMeta,
        createdAt: new Date().toISOString(),
        context: { page: deps.page, section: deps.section },
      },
    ];
  });
}

function emitArtifactMessage(
  deps: StreamChunkDeps,
  state: StreamMutableState,
  payload: Extract<SharedStreamIntent, { type: "artifact_emit" }>,
) {
  const artType = (payload.artifactType ?? "plan") as ArtifactType;
  const artStatus = (payload.artifactStatus ?? "proposed") as ArtifactStatus;
  const artTitle = payload.artifactTitle ?? "Artifact";
  const artifactData: ArtifactData = {
    id: payload.artifactId ?? `art-${Date.now()}`,
    runId: state.localRunId,
    projectId: deps.projectId,
    conversationId: state.effectiveConvId ?? null,
    type: artType,
    status: artStatus,
    title: artTitle,
    payload: payload.artifactPayload ?? {},
    version: payload.artifactVersion ?? 1,
    sourceEventId: null,
    appliedAt: null,
    reviewedAt: null,
    reviewNote: null,
    createdAt: new Date().toISOString(),
  };
  deps.upsertArtifact(artifactData);

  const artifactMessage: ProjectConversationMessage = {
    id: `artifact-${artifactData.id}`,
    sender: "ai",
    text: `[${artType}] ${artTitle}`,
    createdAt: new Date().toISOString(),
    context: { page: deps.page, section: deps.section },
    artifact: {
      id: artifactData.id,
      type: artType,
      status: artStatus,
      title: artTitle,
      payload: (payload.artifactPayload ?? {}) as Record<string, unknown>,
      version: payload.artifactVersion ?? 1,
    },
  };
  deps.updateMessages((messages) => repairReservedAssistantPlacement([...messages, artifactMessage], deps.aiMessageId));
}

function applyIntent(
  deps: StreamChunkDeps,
  state: StreamMutableState,
  intent: SharedStreamIntent,
) {
  switch (intent.type) {
    case "assistant_reserve": {
      reserveAssistantMessage(deps);
      return;
    }
    case "assistant_upsert": {
      upsertAssistantMessage(deps, intent);
      return;
    }
    case "progress_upsert": {
      upsertProgressMessage(deps, intent);
      return;
    }
    case "progress_clear": {
      clearProgressMessage(deps);
      return;
    }
    case "tool_activity_upsert": {
      upsertToolActivityMessage(deps, intent);
      return;
    }
    case "artifact_emit": {
      emitArtifactMessage(deps, state, intent);
      return;
    }
    case "plan_step_update": {
      deps.onPlanStepUpdate?.(intent.planId, intent.stepIndex, intent.stepStatus);
      return;
    }
    case "checkpoint_append": {
      appendCheckpointMessage(deps, intent);
      return;
    }
    case "stream_error": {
      appendStreamErrorMessage(deps, intent);
      return;
    }
    case "run_set": {
      deps.setCurrentRunId(intent.runId);
      return;
    }
    case "conversation_sync": {
      deps.syncConversationId(intent.conversationId);
      return;
    }
    case "conversation_title": {
      const conversationId = intent.conversationId;
      if (!conversationId) return;
      deps.upsertConversationTitle(conversationId, intent.title);
      return;
    }
    case "choices_set": {
      if (deps.getCurrentGen() === deps.myGen) {
        deps.setPendingChoices(intent.choices);
      }
      return;
    }
    case "user_input_set": {
      if (deps.getCurrentGen() === deps.myGen) {
        deps.setPendingUserInput(intent.request);
      }
      return;
    }
    case "user_input_clear": {
      if (deps.getCurrentGen() === deps.myGen) {
        deps.setPendingUserInput(null);
      }
      return;
    }
    case "user_input_append": {
      appendUserInputMessage(deps, intent);
      return;
    }
    case "user_input_resolve": {
      resolveUserInputMessage(deps, intent);
      return;
    }
    case "navigate": {
      if (intent.url && isNavigationSafe(intent.url)) {
        deps.onNavigate?.(intent.url);
      }
      return;
    }
    case "ledger_changed": {
      deps.emitLedgerChanged();
      return;
    }
  }
}

export function handleProjectConversationStreamChunk(
  data: AIStreamChunk,
  state: StreamMutableState,
  deps: StreamChunkDeps,
): StreamMutableState {
  const reduced = reduceSharedStreamChunk(state, data, {
    page: deps.page,
    section: deps.section,
  });
  for (const intent of reduced.intents) {
    deps.onIntent?.(intent);
    applyIntent(deps, reduced.state, intent);
  }
  return reduced.state;
}

export function reserveProjectConversationAssistantTurn(
  state: StreamMutableState,
  deps: StreamChunkDeps,
): StreamMutableState {
  const reserved = reserveSharedAssistantTurn(state);
  for (const intent of reserved.intents) {
    deps.onIntent?.(intent);
    applyIntent(deps, reserved.state, intent);
  }
  return reserved.state;
}
