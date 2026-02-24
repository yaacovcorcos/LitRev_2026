import type { CopilotMessage } from "@/lib/projectCopilotStorage";
import type { ArtifactData, ArtifactStatus, ArtifactType } from "@/types/artifacts";
import type { AIStreamChunk, ChoiceOption, CopilotPage } from "@/types/ai";

export type StreamMutableState = {
  aiMessageCreated: boolean;
  fullContent: string;
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
      createdAt: new Date().toISOString(),
      context: { page: deps.page, section: deps.section },
    };
    deps.updateMessages((messages) => [...messages, aiMessage]);
    return { ...state, aiMessageCreated: true };
  }

  deps.updateMessages((messages) =>
    messages.map((msg) => (msg.id === deps.aiMessageId ? { ...msg, text } : msg))
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

