import type {
  ChoiceOption,
  AIErrorEnvelope,
  AIStreamChunk,
  CopilotPage,
  UserInputRequest,
} from "@/types/ai";
import type {
  TimelineError,
  TimelineItem,
  TimelineToolActivity,
  TimelineUserMessage,
} from "@/types/timeline";
import { normalizeAssistantContent } from "@/lib/ai/normalize-assistant-content";
import { reconcileRunScopedRenderedErrors } from "@/lib/ai/stream-error-ui";
import { createAiStreamRuntime, type AiStreamRuntime, type AiStreamRuntimeDeps } from "@/lib/ai/ai-stream-runtime";
import { createInitialSharedStreamState, type SharedStreamIntent, type SharedStreamState } from "@/lib/ai/shared-stream-reducer";

export type PopupTimelineItem = Extract<
  TimelineItem,
  { type: "user_message" | "assistant_message" | "tool_activity" | "progress" | "checkpoint" | "error" | "user_input_request" }
>;

export type PopupStreamRuntimeState = {
  conversationId: string;
  items: PopupTimelineItem[];
  timelineItems: TimelineItem[];
  sharedState: SharedStreamState;
  pendingChoices: ChoiceOption[];
  pendingUserInput: UserInputRequest | null;
};

export type PopupStreamMeta = {
  page: CopilotPage;
  section?: string;
  aiMessageId: string;
  now: () => string;
  myGen: number;
  getCurrentGen: () => number;
  selectedProjectId?: string | null;
  onNavigate?: (url: string) => void;
  onIntent?: (intent: SharedStreamIntent) => void;
  emitLedgerChanged?: (projectId: string) => void;
};

type PopupRuntimeBuildStateParams = {
  conversationId: string;
  timelineItems: TimelineItem[];
  sharedState: SharedStreamState;
  pendingChoices: ChoiceOption[];
  pendingUserInput: UserInputRequest | null;
};

export type PopupStreamRuntimeController = {
  reserveAssistantTurn: () => PopupStreamRuntimeState;
  handleChunk: (chunk: AIStreamChunk) => PopupStreamRuntimeState;
  clearProgress: () => PopupStreamRuntimeState;
  failRunningTools: (summary: string) => PopupStreamRuntimeState;
  interruptRunningTools: (summary: string) => PopupStreamRuntimeState;
  appendTerminalError: (params: {
    message: string;
    retryable: boolean;
    errorMeta: AIErrorEnvelope;
    createdAt: string;
  }) => PopupStreamRuntimeState;
  getState: () => PopupStreamRuntimeState;
};

function isReservedEmptyAssistantMessage(item: TimelineItem): boolean {
  return item.type === "assistant_message"
    && item.deliveryState === "reserved"
    && item.content.length === 0
    && (item.reasoning?.text?.trim().length ?? 0) === 0;
}

function hasPopupToolReceiptContent(item: TimelineToolActivity): boolean {
  return Boolean(
    item.displayLabel
      || item.inputPreview
      || item.outcomeSummary
      || item.sourceBadge
      || item.detailItems?.length
      || item.summary
      || item.errorMeta?.message,
  );
}

function isPopupVisibleToolActivity(item: TimelineToolActivity): boolean {
  if (item.status === "queued" || item.status === "running") {
    return false;
  }
  return hasPopupToolReceiptContent(item);
}

function projectPopupItems(items: TimelineItem[]): PopupTimelineItem[] {
  return items.flatMap<PopupTimelineItem>((item) => {
    switch (item.type) {
      case "user_message":
      case "progress":
      case "checkpoint":
      case "error":
      case "user_input_request":
        return [item];
      case "assistant_message":
        return isReservedEmptyAssistantMessage(item) ? [] : [item];
      case "tool_activity":
        return isPopupVisibleToolActivity(item) ? [item] : [];
      default:
        return [];
    }
  });
}

function buildPopupRuntimeState(params: PopupRuntimeBuildStateParams): PopupStreamRuntimeState {
  return {
    conversationId: params.conversationId,
    items: projectPopupItems(params.timelineItems),
    timelineItems: params.timelineItems,
    sharedState: params.sharedState,
    pendingChoices: params.pendingChoices,
    pendingUserInput: params.pendingUserInput,
  };
}

function stripReservedAssistantTurns(items: TimelineItem[]): TimelineItem[] {
  return items.filter((item) => !isReservedEmptyAssistantMessage(item));
}

function humanizeToolName(toolName: string): string {
  return toolName
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildPopupToolTranscriptContent(item: TimelineToolActivity): string | null {
  const lines: string[] = [];
  const title = item.displayLabel ?? humanizeToolName(item.toolName);
  const summary = item.outcomeSummary ?? item.summary ?? item.errorMeta?.message ?? null;

  if (title.trim()) {
    lines.push(title);
  }
  if (item.inputPreview && !summary) {
    lines.push(item.inputPreview);
  }
  if (summary?.trim()) {
    lines.push(summary);
  }
  if (item.detailItems?.length) {
    lines.push(item.detailItems.join("; "));
  }

  const content = lines.filter((line) => line.trim().length > 0).join("\n");
  return content.trim() ? content : null;
}

export function createInitialPopupStreamRuntimeState(
  overrides?: Partial<PopupStreamRuntimeState>,
): PopupStreamRuntimeState {
  return {
    conversationId: "popup",
    items: [],
    timelineItems: [],
    sharedState: createInitialSharedStreamState(),
    pendingChoices: [],
    pendingUserInput: null,
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

  return buildPopupRuntimeState({
    conversationId: state.conversationId,
    timelineItems: [...state.timelineItems, message],
    sharedState: state.sharedState,
    pendingChoices: state.pendingChoices,
    pendingUserInput: state.pendingUserInput,
  });
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
  const baseTimelineItems = stripReservedAssistantTurns(state.timelineItems);
  const reconciled = reconcileRunScopedRenderedErrors({
    items: baseTimelineItems.filter((item) => item.type === "error"),
    nextMessage: params.message,
    nextMeta: params.errorMeta,
    getMessage: (item) => item.type === "error" ? item.message : null,
    getErrorMeta: (item) => item.type === "error" ? item.errorMeta : null,
  });

  const retainedErrorIds = new Set(reconciled.items.map((item) => item.id));
  const retainedTimelineItems = baseTimelineItems.filter((item) => item.type !== "error" || retainedErrorIds.has(item.id));

  if (!reconciled.shouldAppend) {
    return buildPopupRuntimeState({
      conversationId: state.conversationId,
      timelineItems: retainedTimelineItems,
      sharedState: state.sharedState,
      pendingChoices: state.pendingChoices,
      pendingUserInput: state.pendingUserInput,
    });
  }

  const errorItem: TimelineError = {
    type: "error",
    id: `popup-error-${params.createdAt}-${retainedTimelineItems.length}`,
    message: params.message,
    retryable: params.retryable,
    errorMeta: params.errorMeta,
    createdAt: params.createdAt,
  };

  return buildPopupRuntimeState({
    conversationId: state.conversationId,
    timelineItems: [...retainedTimelineItems, errorItem],
    sharedState: state.sharedState,
    pendingChoices: state.pendingChoices,
    pendingUserInput: state.pendingUserInput,
  });
}

function createPopupRuntimeDeps(
  meta: PopupStreamMeta,
  popupState: PopupStreamRuntimeState,
  store: {
    conversationId: string;
    timelineItems: TimelineItem[];
    pendingChoices: ChoiceOption[];
    pendingUserInput: UserInputRequest | null;
  },
): AiStreamRuntimeDeps {
  return {
    aiMessageId: meta.aiMessageId,
    page: meta.page,
    section: meta.section,
    initialConversationId: popupState.conversationId,
    initialStreamState: popupState.sharedState,
    selectedProjectId: meta.selectedProjectId ?? null,
    myGen: meta.myGen,
    getCurrentGen: meta.getCurrentGen,
    updateConversationTimeline: (conversationId, updater) => {
      store.conversationId = conversationId;
      store.timelineItems = updater(store.timelineItems);
    },
    ensureConversationTimeline: (conversationId) => {
      store.conversationId = conversationId;
    },
    setActiveConversationId: (conversationId) => {
      store.conversationId = conversationId;
    },
    upsertConversationTitle: () => {},
    setPendingChoices: (choices) => {
      store.pendingChoices = choices;
    },
    setPendingUserInput: (request) => {
      store.pendingUserInput = request;
    },
    onPlanStepUpdate: () => {},
    onNavigate: meta.onNavigate ?? (() => {}),
    onIntent: meta.onIntent,
    now: meta.now,
    emitLedgerChanged: meta.emitLedgerChanged,
  };
}

export function createPopupStreamRuntimeController(params: PopupStreamMeta & {
  initialState?: PopupStreamRuntimeState;
  onStateChange?: (state: PopupStreamRuntimeState) => void;
}): PopupStreamRuntimeController {
  const initialState = params.initialState ?? createInitialPopupStreamRuntimeState();
  const store = {
    conversationId: initialState.conversationId,
    timelineItems: [...initialState.timelineItems],
    pendingChoices: [...initialState.pendingChoices],
    pendingUserInput: initialState.pendingUserInput,
  };

  let popupState = initialState;
  const runtime: AiStreamRuntime = createAiStreamRuntime(createPopupRuntimeDeps(params, initialState, store));

  const replaceState = (nextState: PopupStreamRuntimeState) => {
    popupState = nextState;
    store.conversationId = nextState.conversationId;
    store.timelineItems = [...nextState.timelineItems];
    store.pendingChoices = [...nextState.pendingChoices];
    store.pendingUserInput = nextState.pendingUserInput;
    params.onStateChange?.(popupState);
    return popupState;
  };

  const syncState = () => {
    return replaceState(buildPopupRuntimeState({
      conversationId: runtime.getConversationId() || store.conversationId,
      timelineItems: store.timelineItems,
      sharedState: runtime.getState(),
      pendingChoices: store.pendingChoices,
      pendingUserInput: store.pendingUserInput,
    }));
  };

  return {
    reserveAssistantTurn: () => {
      runtime.reserveAssistantTurn();
      return syncState();
    },
    handleChunk: (chunk) => {
      runtime.handleChunk(chunk);
      return syncState();
    },
    clearProgress: () => {
      runtime.clearProgress();
      return syncState();
    },
    failRunningTools: (summary) => {
      runtime.failRunningTools(summary);
      return syncState();
    },
    interruptRunningTools: (summary) => {
      runtime.interruptRunningTools(summary);
      return syncState();
    },
    appendTerminalError: (error) => replaceState(appendPopupTerminalError(popupState, error)),
    getState: () => popupState,
  };
}

export function reducePopupStreamChunk(
  prev: PopupStreamRuntimeState,
  chunk: AIStreamChunk,
  meta: PopupStreamMeta,
): PopupStreamRuntimeState {
  const controller = createPopupStreamRuntimeController({
    ...meta,
    initialState: prev,
  });

  return controller.handleChunk(chunk);
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
      case "tool_activity": {
        const toolContent = buildPopupToolTranscriptContent(item);
        if (toolContent) {
          entries.push({ role: "assistant", content: toolContent });
        }
        break;
      }
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
