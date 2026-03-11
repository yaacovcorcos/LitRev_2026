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
