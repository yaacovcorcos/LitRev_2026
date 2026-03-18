import type { TimelineAssistantMessage, TimelineError, TimelineItem, TimelineProgress, TimelineUserInputRequest, TimelineUserMessage } from "@/types/timeline";
import type { AIErrorEnvelope, AIStreamChunk, CopilotPage } from "@/types/ai";
import { normalizeAssistantContent } from "@/lib/ai/normalize-assistant-content";
import { buildClientErrorState, reconcileRunScopedRenderedErrors } from "@/lib/ai/stream-error-ui";
import {
  createInitialSharedStreamState,
  reduceSharedStreamChunk,
  type SharedStreamIntent,
  type SharedStreamState,
} from "@/lib/ai/shared-stream-reducer";

export type PopupTimelineItem = Extract<
  TimelineItem,
  { type: "user_message" | "assistant_message" | "progress" | "checkpoint" | "error" | "user_input_request" }
>;

export type PopupStreamRuntimeState = {
  conversationId: string;
  items: PopupTimelineItem[];
  progressItemId: string | null;
  sharedState: SharedStreamState;
};

type PopupStreamMeta = {
  page: CopilotPage;
  section?: string;
  aiMessageId: string;
  now: () => string;
};

export function createInitialPopupStreamRuntimeState(
  overrides?: Partial<PopupStreamRuntimeState>,
): PopupStreamRuntimeState {
  return {
    conversationId: "popup",
    items: [],
    progressItemId: null,
    sharedState: createInitialSharedStreamState(),
    ...overrides,
  };
}

export function appendPopupUserMessage(
  state: PopupStreamRuntimeState,
  params: {
    id: string;
    content: string;
    createdAt: string;
  },
): PopupStreamRuntimeState {
  const message: TimelineUserMessage = {
    type: "user_message",
    id: params.id,
    content: params.content,
    createdAt: params.createdAt,
  };
  return {
    ...state,
    items: [...state.items, message],
  };
}

export function appendPopupTerminalError(
  state: PopupStreamRuntimeState,
  params: {
    message: string;
    retryable: boolean;
    errorMeta: AIErrorEnvelope;
    createdAt: string;
  },
): PopupStreamRuntimeState {
  const reconciled = reconcileRunScopedRenderedErrors({
    items: state.items.filter((item) => item.type === "error"),
    nextMessage: params.message,
    nextMeta: params.errorMeta,
    getMessage: (item) => item.type === "error" ? item.message : null,
    getErrorMeta: (item) => item.type === "error" ? item.errorMeta : null,
  });
  if (!reconciled.shouldAppend) {
    const retainedErrorIds = new Set(reconciled.items.map((item) => item.id));
    return {
      ...state,
      items: state.items.filter((item) => item.type !== "error" || retainedErrorIds.has(item.id)),
    };
  }

  const item: TimelineError = {
    type: "error",
    id: `popup-error-${params.createdAt}-${state.items.length}`,
    message: params.message,
    retryable: params.retryable,
    errorMeta: params.errorMeta,
    createdAt: params.createdAt,
  };
  const retainedErrorIds = new Set(reconciled.items.map((item) => item.id));
  return {
    ...state,
    items: [...state.items.filter((entry) => entry.type !== "error" || retainedErrorIds.has(entry.id)), item],
  };
}

function upsertAssistant(
  items: PopupTimelineItem[],
  aiMessageId: string,
  createdAt: string,
  intent: Extract<SharedStreamIntent, { type: "assistant_upsert" }>,
): PopupTimelineItem[] {
  const idx = items.findIndex((item) => item.type === "assistant_message" && item.id === aiMessageId);
  const nextItem: TimelineAssistantMessage = {
    type: "assistant_message",
    id: aiMessageId,
    content: intent.text,
    reasoning: intent.reasoning,
    createdAt,
  };
  if (idx < 0) return [...items, nextItem];
  const next = [...items];
  next[idx] = nextItem;
  return next;
}

function upsertProgress(
  state: PopupStreamRuntimeState,
  createdAt: string,
  intent: Extract<SharedStreamIntent, { type: "progress_upsert" }>,
): PopupStreamRuntimeState {
  const progressItem: TimelineProgress = {
    type: "progress",
    id: state.progressItemId ?? `popup-progress-${createdAt}`,
    message: intent.message,
    current: intent.current,
    total: intent.total,
  };
  const nextProgressId = progressItem.id;
  const idx = state.items.findIndex((item) => item.type === "progress" && item.id === nextProgressId);
  if (idx < 0) {
    return {
      ...state,
      progressItemId: nextProgressId,
      items: [...state.items, progressItem],
    };
  }
  const next = [...state.items];
  next[idx] = progressItem;
  return {
    ...state,
    progressItemId: nextProgressId,
    items: next,
  };
}

function clearProgress(state: PopupStreamRuntimeState): PopupStreamRuntimeState {
  if (!state.progressItemId) return state;
  return {
    ...state,
    progressItemId: null,
    items: state.items.filter((item) => !(item.type === "progress" && item.id === state.progressItemId)),
  };
}

function appendCheckpoint(
  state: PopupStreamRuntimeState,
  createdAt: string,
  intent: Extract<SharedStreamIntent, { type: "checkpoint_append" }>,
): PopupStreamRuntimeState {
  if (state.items.some((item) => item.type === "checkpoint" && item.label === intent.label)) {
    return state;
  }
  return {
    ...state,
    items: [
      ...state.items,
      {
        type: "checkpoint",
        id: `popup-checkpoint-${createdAt}-${state.items.length}`,
        label: intent.label,
        createdAt,
      },
    ],
  };
}

function appendStreamError(
  state: PopupStreamRuntimeState,
  createdAt: string,
  intent: Extract<SharedStreamIntent, { type: "stream_error" }>,
): PopupStreamRuntimeState {
  const errorState = buildClientErrorState(intent.errorMeta ?? intent.message);
  const reconciled = reconcileRunScopedRenderedErrors({
    items: state.items.filter((item) => item.type === "error"),
    nextMessage: errorState.message,
    nextMeta: errorState.errorMeta,
    getMessage: (item) => item.type === "error" ? item.message : null,
    getErrorMeta: (item) => item.type === "error" ? item.errorMeta : null,
  });
  if (!reconciled.shouldAppend) {
    const retainedErrorIds = new Set(reconciled.items.map((item) => item.id));
    return {
      ...state,
      items: state.items.filter((item) => item.type !== "error" || retainedErrorIds.has(item.id)),
    };
  }
  const retainedErrorIds = new Set(reconciled.items.map((item) => item.id));
  return {
    ...state,
    items: [
      ...state.items.filter((item) => item.type !== "error" || retainedErrorIds.has(item.id)),
      {
        type: "error",
        id: `popup-error-${createdAt}-${state.items.length}`,
        message: errorState.message,
        retryable: errorState.retryable,
        errorMeta: errorState.errorMeta,
        createdAt,
      },
    ],
  };
}

function appendUserInput(
  state: PopupStreamRuntimeState,
  createdAt: string,
  intent: Extract<SharedStreamIntent, { type: "user_input_append" }>,
): PopupStreamRuntimeState {
  const requestId = `popup-user-input-${intent.request.callId}`;
  if (state.items.some((item) => item.type === "user_input_request" && item.id === requestId)) {
    return state;
  }
  const requestItem: TimelineUserInputRequest = {
    type: "user_input_request",
    id: requestId,
    callId: intent.request.callId,
    page: intent.page,
    section: intent.section,
    question: intent.request.question,
    questionType: intent.request.questionType,
    options: intent.request.options,
    header: intent.request.header,
    context: intent.request.context,
    answered: false,
    createdAt,
  };
  return {
    ...state,
    items: [...state.items, requestItem],
  };
}

function applySupportedIntent(
  state: PopupStreamRuntimeState,
  intent: SharedStreamIntent,
  meta: PopupStreamMeta,
): PopupStreamRuntimeState {
  const createdAt = meta.now();
  switch (intent.type) {
    case "assistant_upsert":
      return {
        ...state,
        items: upsertAssistant(state.items, meta.aiMessageId, createdAt, intent),
      };
    case "progress_upsert":
      return upsertProgress(state, createdAt, intent);
    case "progress_clear":
      return clearProgress(state);
    case "checkpoint_append":
      return appendCheckpoint(state, createdAt, intent);
    case "stream_error":
      return appendStreamError(state, createdAt, intent);
    case "user_input_append":
      return appendUserInput(state, createdAt, intent);
    case "conversation_sync":
      return {
        ...state,
        conversationId: intent.conversationId,
      };
    default:
      return state;
  }
}

export function reducePopupStreamChunk(
  prev: PopupStreamRuntimeState,
  chunk: AIStreamChunk,
  meta: PopupStreamMeta,
): PopupStreamRuntimeState {
  const reduced = reduceSharedStreamChunk(prev.sharedState, chunk, {
    page: meta.page,
    section: meta.section,
  });

  let next: PopupStreamRuntimeState = {
    ...prev,
    sharedState: reduced.state,
  };

  for (const intent of reduced.intents) {
    next = applySupportedIntent(next, intent, meta);
  }

  return next;
}

export function getPopupTranscriptEntries(items: PopupTimelineItem[]): Array<{ role: "user" | "assistant"; content: string }> {
  const entries: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const item of items) {
    switch (item.type) {
      case "user_message":
        if (item.content.trim()) {
          entries.push({ role: "user", content: item.content });
        }
        break;
      case "assistant_message":
        if (item.content.trim()) {
          const displayContent = normalizeAssistantContent(item.content).displayContent;
          if (displayContent.trim()) {
            entries.push({ role: "assistant", content: displayContent });
          }
        }
        break;
      case "checkpoint":
        if (item.label.trim()) {
          entries.push({ role: "assistant", content: item.label });
        }
        break;
      case "error":
        if (item.message.trim()) {
          entries.push({ role: "assistant", content: item.message });
        }
        break;
      case "user_input_request": {
        const lines = [item.header, item.question, item.context].filter(Boolean).join("\n");
        if (lines.trim()) {
          entries.push({ role: "assistant", content: lines });
        }
        break;
      }
      case "progress":
        break;
    }
  }

  return entries;
}
