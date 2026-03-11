import { appendReasoningRaw } from "@/lib/ai/reasoning-visibility";
import type { AIErrorEnvelope, AIStreamChunk, ChoiceOption, CopilotPage, UserInputRequest } from "@/types/ai";

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
  completedPubmedSearchCount: number;
  lastPubmedSearchSize: number | null;
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
      queryPreview?: string;
      returnedCount?: number;
      totalResults?: number;
      resultIdentifiers?: string[];
      errorMeta?: AIErrorEnvelope;
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
      errorMeta?: AIErrorEnvelope;
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
    completedPubmedSearchCount: 0,
    lastPubmedSearchSize: null,
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

function buildQueryPreview(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  const maxLength = 96;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

const SEARCH_TOOL_LABELS = {
  search_pubmed: "PubMed",
  search_openalex: "OpenAlex",
  search_semantic_scholar: "Semantic Scholar",
} satisfies Record<string, string>;

type SearchToolName = keyof typeof SEARCH_TOOL_LABELS;

function isSearchToolName(toolName: string | undefined): toolName is SearchToolName {
  return typeof toolName === "string" && toolName in SEARCH_TOOL_LABELS;
}

function getSearchToolLabel(toolName: string | undefined): string | null {
  return isSearchToolName(toolName) ? SEARCH_TOOL_LABELS[toolName] : null;
}

function getSearchToolCallMetadata(
  chunk: AIStreamChunk,
): Pick<Extract<SharedStreamIntent, { type: "tool_activity_upsert" }>, "queryPreview"> | undefined {
  if (!isSearchToolName(chunk.toolCall?.name)) return undefined;
  return {
    queryPreview: buildQueryPreview(chunk.toolCall.arguments?.query),
  };
}

function formatSearchResultIdentifier(toolName: SearchToolName, value: Record<string, unknown>): string | null {
  const pmid = typeof value.pmid === "string" ? value.pmid.trim() : "";
  const doi = typeof value.doi === "string" ? value.doi.trim() : "";
  const metadata = typeof value.metadata === "object" && value.metadata
    ? value.metadata as Record<string, unknown>
    : null;

  if (toolName === "search_pubmed") {
    if (pmid) return `PMID ${pmid}`;
    if (doi) return `DOI ${doi}`;
    return null;
  }

  if (doi) return `DOI ${doi}`;
  if (pmid) return `PMID ${pmid}`;

  if (toolName === "search_openalex") {
    const openAlexId = typeof metadata?.openAlexId === "string"
      ? metadata.openAlexId
      : typeof value.sourceUrl === "string"
        ? value.sourceUrl
        : "";
    const shortId = openAlexId.split("/").filter(Boolean).at(-1) ?? "";
    return shortId ? `OpenAlex ${shortId}` : null;
  }

  if (toolName === "search_semantic_scholar") {
    const paperId = typeof metadata?.s2PaperId === "string" ? metadata.s2PaperId.trim() : "";
    return paperId ? `S2 ${paperId}` : null;
  }

  return null;
}

function getSearchResultIdentifiers(toolName: SearchToolName, result: Record<string, unknown>): string[] | undefined {
  const items = Array.isArray(result.results) ? result.results : [];
  const identifiers: string[] = [];
  const seen = new Set<string>();

  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const identifier = formatSearchResultIdentifier(toolName, item as Record<string, unknown>);
    if (!identifier || seen.has(identifier)) continue;
    seen.add(identifier);
    identifiers.push(identifier);
    if (identifiers.length >= 2) break;
  }

  return identifiers.length > 0 ? identifiers : undefined;
}

function getSearchToolResultMetadata(
  chunk: AIStreamChunk,
): Pick<Extract<SharedStreamIntent, { type: "tool_activity_upsert" }>, "returnedCount" | "totalResults" | "resultIdentifiers"> | undefined {
  if (!isSearchToolName(chunk.toolName)) return undefined;
  const result = chunk.toolResult?.result;
  if (!result || typeof result !== "object") return undefined;
  const record = result as Record<string, unknown>;
  return {
    returnedCount: typeof record.returnedCount === "number" ? record.returnedCount : undefined,
    totalResults: typeof record.totalResults === "number" ? record.totalResults : undefined,
    resultIdentifiers: getSearchResultIdentifiers(chunk.toolName, record),
  };
}

function getPubMedSearchSize(metadata?: Pick<Extract<SharedStreamIntent, { type: "tool_activity_upsert" }>, "returnedCount" | "totalResults">): number | null {
  if (typeof metadata?.totalResults === "number") return metadata.totalResults;
  if (typeof metadata?.returnedCount === "number") return metadata.returnedCount;
  return null;
}

function buildPubMedResultSummary(metadata?: Pick<Extract<SharedStreamIntent, { type: "tool_activity_upsert" }>, "returnedCount" | "totalResults">): string | undefined {
  if (!metadata) return undefined;
  if (typeof metadata.returnedCount === "number" && typeof metadata.totalResults === "number") {
    return `Found ${metadata.returnedCount} of ${metadata.totalResults} PubMed results.`;
  }
  if (typeof metadata.returnedCount === "number") {
    return `Found ${metadata.returnedCount} PubMed results.`;
  }
  if (typeof metadata.totalResults === "number") {
    return `Found ${metadata.totalResults} PubMed results.`;
  }
  return undefined;
}

function buildSearchResultSummary(
  toolName: string | undefined,
  metadata?: Pick<Extract<SharedStreamIntent, { type: "tool_activity_upsert" }>, "returnedCount" | "totalResults">,
): string | undefined {
  const label = getSearchToolLabel(toolName);
  if (!label || !metadata) return undefined;
  if (toolName === "search_pubmed") return buildPubMedResultSummary(metadata);
  if (typeof metadata.returnedCount === "number" && typeof metadata.totalResults === "number") {
    return `Found ${metadata.returnedCount} of ${metadata.totalResults} ${label} results.`;
  }
  if (typeof metadata.returnedCount === "number") {
    return `Found ${metadata.returnedCount} ${label} results.`;
  }
  if (typeof metadata.totalResults === "number") {
    return `Found ${metadata.totalResults} ${label} results.`;
  }
  return undefined;
}

function buildPubMedCheckpoint(params: {
  metadata?: Pick<Extract<SharedStreamIntent, { type: "tool_activity_upsert" }>, "returnedCount" | "totalResults">;
  completedSearchCount: number;
  previousSearchSize: number | null;
}): string | null {
  const size = getPubMedSearchSize(params.metadata);
  if (size === null) return null;

  if (size <= 2) {
    return `PubMed returned ${size} results. The search may be too narrow, so broader terms may be needed next.`;
  }

  if (params.completedSearchCount === 0) {
    if (size >= 25) {
      return `PubMed returned ${size} results. The search is broad, so it is being narrowed next.`;
    }
    return `PubMed returned ${size} results. Reviewing the strongest matches now.`;
  }

  if (params.previousSearchSize !== null && size < params.previousSearchSize) {
    return `The latest PubMed search narrowed the result set from ${params.previousSearchSize} to ${size} results. Reviewing the strongest matches now.`;
  }

  if (params.previousSearchSize !== null && size > params.previousSearchSize) {
    return `The latest PubMed search broadened the result set from ${params.previousSearchSize} to ${size} results. Refinement may still be needed next.`;
  }

  return null;
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
      const metadata = getSearchToolCallMetadata(chunk);
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
        ...metadata,
      });
      if (toolName === "search_pubmed") {
        intents.push({
          type: "progress_upsert",
          message: prev.completedPubmedSearchCount > 0 ? "Refining the PubMed query" : "Searching PubMed",
        });
      }
      return { state: next, intents };
    }

    case "tool_result": {
      const runningToolCallIds = prev.runningToolCallIds ?? [];
      const fallbackCallId = prev.lastToolCallId ?? runningToolCallIds[runningToolCallIds.length - 1] ?? null;
      const callId = chunk.toolResult?.callId ?? fallbackCallId;
      const isPubMedResult = chunk.toolName === "search_pubmed";
      const metadata = getSearchToolResultMetadata(chunk);
      if (callId) {
        intents.push({
          type: "tool_activity_upsert",
          callId,
          toolName: chunk.toolName ?? "tool",
          status: chunk.toolResult?.error ? "failed" : "done",
          summary: chunk.toolResult?.error ?? buildSearchResultSummary(chunk.toolName, metadata),
          ...metadata,
          errorMeta: chunk.toolResult?.errorMeta,
        });
      }
      if (isPubMedResult && !chunk.toolResult?.error) {
        intents.push({
          type: "progress_upsert",
          message: "Reviewing PubMed results",
        });
        const checkpoint = buildPubMedCheckpoint({
          metadata,
          completedSearchCount: prev.completedPubmedSearchCount,
          previousSearchSize: prev.lastPubmedSearchSize,
        });
        if (checkpoint) {
          intents.push({
            type: "checkpoint_append",
            label: checkpoint,
          });
        }
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
        completedPubmedSearchCount: isPubMedResult && !chunk.toolResult?.error
          ? prev.completedPubmedSearchCount + 1
          : prev.completedPubmedSearchCount,
        lastPubmedSearchSize: isPubMedResult && !chunk.toolResult?.error
          ? getPubMedSearchSize(metadata)
          : prev.lastPubmedSearchSize,
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
        type: "progress_upsert",
        message: "Waiting for your answer",
      });
      intents.push({
        type: "checkpoint_append",
        label: `Need your answer before continuing: ${chunk.userInputRequest.question}`,
      });
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
        errorMeta: chunk.errorMeta,
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
