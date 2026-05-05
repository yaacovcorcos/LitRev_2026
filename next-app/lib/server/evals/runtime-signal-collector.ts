import type { AIStreamChunk, CopilotPage } from "@/types/ai";
import {
  createInitialSharedStreamState,
  reduceSharedStreamChunk,
  type SharedStreamIntent,
} from "@/lib/ai/shared-stream-reducer";

const SEARCH_TOOL_NAMES = new Set([
  "search_pubmed",
  "search_openalex",
  "search_semantic_scholar",
]);

export type SearchReceiptObservation = {
  callId: string;
  toolName: string;
  status: "queued" | "running" | "done" | "failed" | "interrupted";
  queryPreview?: string;
  returnedCount?: number;
  totalResults?: number;
  summary?: string;
};

export function collectSharedIntents(
  chunks: AIStreamChunk[],
  options?: { page?: CopilotPage; section?: string },
): SharedStreamIntent[] {
  let state = createInitialSharedStreamState();
  const intents: SharedStreamIntent[] = [];

  for (const chunk of chunks) {
    const reduced = reduceSharedStreamChunk(state, chunk, {
      page: options?.page ?? "overview",
      section: options?.section,
    });
    state = reduced.state;
    intents.push(...reduced.intents);
  }

  return intents;
}

export function collectSearchReceiptObservations(
  chunks: AIStreamChunk[],
  options?: { page?: CopilotPage; section?: string },
): SearchReceiptObservation[] {
  const receipts = new Map<string, SearchReceiptObservation>();

  for (const intent of collectSharedIntents(chunks, options)) {
    if (intent.type !== "tool_activity_upsert") continue;
    if (!SEARCH_TOOL_NAMES.has(intent.toolName)) continue;

    const previous = receipts.get(intent.callId);
    receipts.set(intent.callId, {
      callId: intent.callId,
      toolName: intent.toolName,
      status: intent.status,
      queryPreview: intent.queryPreview ?? previous?.queryPreview,
      returnedCount: intent.returnedCount ?? previous?.returnedCount,
      totalResults: intent.totalResults ?? previous?.totalResults,
      summary: intent.summary ?? previous?.summary,
    });
  }

  return [...receipts.values()];
}

function addSignal(signals: Set<string>, signal: string | null | undefined): void {
  const trimmed = signal?.trim();
  if (trimmed) signals.add(trimmed);
}

export function collectRuntimeSignals(
  chunks: AIStreamChunk[],
  options?: { page?: CopilotPage; section?: string },
): string[] {
  const signals = new Set<string>();
  const toolNamesByCallId = new Map<string, string>();

  for (const chunk of chunks) {
    if (chunk.type !== "tool_call") continue;
    const callId = chunk.toolCall?.id;
    const toolName = chunk.toolCall?.name;
    if (callId && toolName) {
      toolNamesByCallId.set(callId, toolName);
    }
  }

  for (const chunk of chunks) {
    addSignal(signals, chunk.type);

    switch (chunk.type) {
      case "tool_call": {
        const toolName = chunk.toolCall?.name;
        addSignal(signals, toolName ? `tool_call:${toolName}` : "tool_call:unknown");
        break;
      }
      case "tool_result": {
        const callId = chunk.toolResult?.callId;
        const toolName = chunk.toolName ?? (callId ? toolNamesByCallId.get(callId) : undefined);
        addSignal(signals, toolName ? `tool_result:${toolName}` : "tool_result:unknown");
        addSignal(signals, chunk.toolResult?.error ? "tool_result:failed" : "tool_result:done");
        break;
      }
      case "run_end":
        addSignal(signals, chunk.runStatus ? `run_end:${chunk.runStatus}` : "run_end:unknown");
        addSignal(signals, chunk.stopReason ? `stop_reason:${chunk.stopReason}` : undefined);
        break;
      case "user_input_required": {
        const request = chunk.userInputRequest;
        addSignal(signals, request?.questionType ? `user_input_required:${request.questionType}` : undefined);
        addSignal(signals, request?.decisionRequest ? "decision_request" : undefined);
        addSignal(
          signals,
          request?.decisionRequest?.status ? `decision_request:${request.decisionRequest.status}` : undefined,
        );
        break;
      }
      case "user_input_resolved": {
        const resolution = chunk.userInputResolution;
        addSignal(signals, resolution?.resolution ? `user_input_resolved:${resolution.resolution}` : undefined);
        addSignal(signals, resolution?.decisionResolution ? "decision_resolution" : undefined);
        addSignal(
          signals,
          resolution?.decisionResolution?.resolutionKind
            ? `decision_resolution:${resolution.decisionResolution.resolutionKind}`
            : undefined,
        );
        break;
      }
      case "artifact":
        addSignal(signals, chunk.artifactType ? `artifact:${chunk.artifactType}` : undefined);
        addSignal(signals, chunk.artifactStatus ? `artifact_status:${chunk.artifactStatus}` : undefined);
        break;
      case "error":
        addSignal(signals, chunk.errorMeta?.code ? `error:${chunk.errorMeta.code}` : undefined);
        break;
      default:
        break;
    }
  }

  for (const intent of collectSharedIntents(chunks, options)) {
    if (intent.type !== "tool_activity_upsert") continue;
    addSignal(signals, `tool_activity:${intent.toolName}`);
    addSignal(signals, `tool_activity:${intent.toolName}:${intent.status}`);
  }

  return [...signals].sort();
}
