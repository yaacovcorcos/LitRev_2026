import type { ChatSurface, ChatUnificationStreamPhase, RunEndObservedPayload } from "@/types/chat-unification";
type PageCarrier = { page?: string };

export type RunEndObservation = {
  runId: string | null;
  runStatus: string | null;
  actualModel: string | null;
  actualModelSource: "provider" | "requested" | "unknown";
  conversationId: string | null;
};

export function deriveChatUnificationSurface(options?: PageCarrier): ChatSurface {
  return options?.page === "ai" ? "ai" : "project";
}

export function deriveChatUnificationStreamPhase(params: {
  options?: PageCarrier;
  isPlanExecution: boolean;
}): ChatUnificationStreamPhase {
  if (params.isPlanExecution) return "plan";
  return params.options?.page === "ai" ? "send" : "project_stream";
}

export function buildRunEndObservedPayload(params: {
  requestKey?: string | null;
  runStatus: string | null;
  streamPhase: ChatUnificationStreamPhase;
  actualModel: string | null;
  actualModelSource: "provider" | "requested" | "unknown";
  firstProviderContentMs?: number | null;
}): RunEndObservedPayload {
  return {
    requestKey: params.requestKey ?? null,
    runStatus: params.runStatus,
    streamPhase: params.streamPhase,
    actualModel: params.actualModel,
    actualModelSource: params.actualModelSource,
    firstProviderContentMs: params.firstProviderContentMs ?? null,
  };
}
