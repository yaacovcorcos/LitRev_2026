import type { CopilotMessage } from "@/lib/projectCopilotStorage";
import type { ArtifactData, ArtifactStatus, ArtifactType } from "@/types/artifacts";
import type { AIStreamChunk, ChoiceOption, CopilotPage, UserInputRequest } from "@/types/ai";
import {
  createInitialSharedStreamState,
  reduceSharedStreamChunk,
  type SharedStreamIntent,
  type SharedStreamState,
} from "@/lib/ai/shared-stream-reducer";
import { isNavigationSafe } from "@/lib/ai/navigation-safety";
import {
  buildClientErrorState,
  isDeterministicCapabilityFailure,
  matchesCanonicalFailureFallback,
} from "@/lib/ai/stream-error-ui";
import { ABNORMAL_END_TOOL_FAILURE_SUMMARY } from "@/lib/ai/ai-stream-runtime";

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
  updateMessages: (updater: (messages: CopilotMessage[]) => CopilotMessage[]) => void;
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
  messages: CopilotMessage[],
  summary = ABNORMAL_END_TOOL_FAILURE_SUMMARY,
): CopilotMessage[] {
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
  messages: CopilotMessage[],
  summary = "Connection lost while the run was still active.",
): CopilotMessage[] {
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
      const message: CopilotMessage = {
        id: deps.aiMessageId,
        sender: "ai",
        text: payload.text,
        reasoning: payload.reasoning,
        createdAt: new Date().toISOString(),
        context: { page: deps.page, section: deps.section },
      };
      return [...messages, message];
    }

    const next = [...messages];
    const existing = next[idx];
    if (!existing) return messages;
    next[idx] = {
      ...existing,
      text: payload.text,
      reasoning: payload.reasoning ?? existing.reasoning,
    };
    return next;
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
      const nextMessage: CopilotMessage = {
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
      return [...scopedMessages, nextMessage];
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
    return next;
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
      const nextMessage: CopilotMessage = {
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
      return [...messages, nextMessage];
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
    return next;
  });
}

function appendUserInputMessage(
  deps: StreamChunkDeps,
  payload: Extract<SharedStreamIntent, { type: "user_input_append" }>,
) {
  deps.updateMessages((messages) => {
    const messageId = `user-input-${payload.request.callId}`;
    if (messages.some((message) => message.id === messageId)) return messages;
    const nextMessage: CopilotMessage = {
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
        answered: false,
      },
    };
    return [...messages, nextMessage];
  });
}

function appendCheckpointMessage(
  deps: StreamChunkDeps,
  payload: Extract<SharedStreamIntent, { type: "checkpoint_append" }>,
) {
  deps.updateMessages((messages) => {
    const messageId = `checkpoint-${Date.now()}`;
    const nextMessage: CopilotMessage = {
      id: messageId,
      sender: "ai",
      text: "",
      createdAt: new Date().toISOString(),
      context: { page: deps.page, section: deps.section },
      checkpoint: {
        label: payload.label,
      },
    };
    return [...messages, nextMessage];
  });
}

function appendStreamErrorMessage(
  deps: StreamChunkDeps,
  payload: Extract<SharedStreamIntent, { type: "stream_error" }>,
) {
  const errorState = buildClientErrorState(payload.errorMeta ?? payload.message);
  deps.updateMessages((messages) => {
    const normalizedMessages = isDeterministicCapabilityFailure(errorState.errorMeta)
      ? messages.filter((message) => (
        !(message.sender === "ai"
          && !message.streamError
          && matchesCanonicalFailureFallback({
            assistantText: message.text,
            streamError: errorState.errorMeta,
          }))
      ))
      : messages;

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

  const artifactMessage: CopilotMessage = {
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
  deps.updateMessages((messages) => [...messages, artifactMessage]);
}

function applyIntent(
  deps: StreamChunkDeps,
  state: StreamMutableState,
  intent: SharedStreamIntent,
) {
  switch (intent.type) {
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
    case "user_input_append": {
      appendUserInputMessage(deps, intent);
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

export function handleProjectCopilotStreamChunk(
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
