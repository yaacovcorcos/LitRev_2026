import type { ArtifactStatus, ArtifactType } from "@/types/artifacts";
import type { AIStreamChunk, ChoiceOption, CopilotPage, UserInputRequest } from "@/types/ai";
import type { TimelineItem } from "@/types/timeline";
import { dispatchProjectDataChanged } from "@/lib/project-data-events";
import type { StreamTerminalReason } from "@/lib/ai/stream-lifecycle";
import {
  buildClientErrorState,
  reconcileRunScopedRenderedErrors,
  isDeterministicCapabilityFailure,
  matchesCanonicalFailureFallback,
} from "@/lib/ai/stream-error-ui";
import {
  createInitialSharedStreamState,
  reduceSharedStreamChunk,
  reserveSharedAssistantTurn,
  type SharedStreamIntent,
  type SharedStreamState,
} from "@/lib/ai/shared-stream-reducer";

export type AiStreamRuntimeDeps = {
  aiMessageId: string;
  page: CopilotPage;
  section?: string;
  initialConversationId: string;
  initialStreamState?: SharedStreamState;
  selectedProjectId: string | null;
  myGen: number;
  getCurrentGen: () => number;
  updateConversationTimeline: (conversationId: string, updater: (prev: TimelineItem[]) => TimelineItem[]) => void;
  ensureConversationTimeline: (conversationId: string) => void;
  setActiveConversationId: (conversationId: string) => void;
  upsertConversationTitle: (conversationId: string, title: string) => void;
  setPendingChoices: (choices: ChoiceOption[]) => void;
  setPendingUserInput: (request: UserInputRequest | null) => void;
  onPlanStepUpdate?: (planId: string, stepIndex: number, stepStatus: string) => void;
  onNavigate: (url: string) => void;
  onIntent?: (intent: SharedStreamIntent) => void;
  now?: () => string;
  emitLedgerChanged?: (projectId: string) => void;
};

export type AiStreamRuntime = {
  reserveAssistantTurn: () => void;
  handleChunk: (chunk: AIStreamChunk) => void;
  clearProgress: () => void;
  failRunningTools: (summary: string) => void;
  interruptRunningTools: (summary: string) => void;
  getConversationId: () => string;
  getState: () => SharedStreamState;
  getLastRunEndToolCounts: () => { beforeClear: number; afterClear: number } | null;
};

export const ABNORMAL_END_TOOL_FAILURE_SUMMARY = "Run ended before tool completion.";

function buildRuntimeItemId(prefix: string, seed: string | number): string {
  return `${prefix}-${seed}`;
}

function stripReservedAssistantTurn(items: TimelineItem[], assistantMessageId: string): TimelineItem[] {
  return items.filter((item) => (
    item.type !== "assistant_message"
    || item.id !== assistantMessageId
    || item.deliveryState !== "reserved"
    || item.content.length > 0
    || (item.reasoning?.text?.trim().length ?? 0) > 0
  ));
}

export function shouldFailRunningToolsOnAbnormalEnd(
  terminalReason: StreamTerminalReason | null,
): boolean {
  return terminalReason === "failed_interrupted"
    || terminalReason === "failed_network"
    || terminalReason === "failed_server"
    || terminalReason === "timed_out";
}

export function createAiStreamRuntime(deps: AiStreamRuntimeDeps): AiStreamRuntime {
  let currentConversationId = deps.initialConversationId;
  let progressItemId: string | null = null;
  let lastRunEndToolCounts: { beforeClear: number; afterClear: number } | null = null;
  let streamState = deps.initialStreamState ?? createInitialSharedStreamState({
    effectiveConvId: deps.initialConversationId,
  });

  const now = () => deps.now?.() ?? new Date().toISOString();

  const updateCurrentTimeline = (updater: (prev: TimelineItem[]) => TimelineItem[]) => {
    deps.updateConversationTimeline(currentConversationId, updater);
  };

  const clearProgress = () => {
    if (!progressItemId) return;
    const progressId = progressItemId;
    progressItemId = null;
    updateCurrentTimeline((items) =>
      items.filter((item) => !(item.type === "progress" && item.id === progressId))
    );
  };

  const upsertAssistant = (intent: Extract<SharedStreamIntent, { type: "assistant_upsert" }>) => {
    const createdAt = now();
    updateCurrentTimeline((items) => {
      const idx = items.findIndex((item) => item.type === "assistant_message" && item.id === deps.aiMessageId);
      if (idx < 0) {
        return [
          ...items,
          {
            type: "assistant_message",
            id: deps.aiMessageId,
            content: intent.text,
            deliveryState: undefined,
            reasoning: intent.reasoning,
            createdAt,
          },
        ];
      }
      const next = [...items];
      const existing = next[idx];
      if (!existing || existing.type !== "assistant_message") return items;
      next[idx] = {
        ...existing,
        content: intent.text,
        deliveryState: undefined,
        reasoning: intent.reasoning ?? existing.reasoning,
      };
      return next;
    });
  };

  const reserveAssistant = () => {
    updateCurrentTimeline((items) => {
      const idx = items.findIndex((item) => item.type === "assistant_message" && item.id === deps.aiMessageId);
      if (idx >= 0) {
        const next = [...items];
        const existing = next[idx];
        if (!existing || existing.type !== "assistant_message") return items;
        next[idx] = {
          ...existing,
          deliveryState: existing.content.length === 0 ? "reserved" : undefined,
        };
        return next;
      }

      return [
        ...items,
        {
          type: "assistant_message",
          id: deps.aiMessageId,
          content: "",
          deliveryState: "reserved",
          createdAt: now(),
        },
      ];
    });
  };

  const upsertProgress = (intent: Extract<SharedStreamIntent, { type: "progress_upsert" }>) => {
    const createdAt = now();
    updateCurrentTimeline((items) => {
      if (!progressItemId) {
        progressItemId = buildRuntimeItemId("progress", `${createdAt}-${items.length}`);
        return [
          ...items,
          {
            type: "progress",
            id: progressItemId,
            message: intent.message,
            current: intent.current,
            total: intent.total,
          },
        ];
      }
      const idx = items.findIndex((item) => item.type === "progress" && item.id === progressItemId);
      if (idx < 0) {
        return [
          ...items,
          {
            type: "progress",
            id: progressItemId,
            message: intent.message,
            current: intent.current,
            total: intent.total,
          },
        ];
      }
      const next = [...items];
      const existing = next[idx];
      if (!existing || existing.type !== "progress") return items;
      next[idx] = {
        ...existing,
        message: intent.message,
        current: intent.current,
        total: intent.total,
      };
      return next;
    });
  };

  const upsertToolActivity = (intent: Extract<SharedStreamIntent, { type: "tool_activity_upsert" }>) => {
    const ts = now();
    updateCurrentTimeline((items) => {
      const idx = items.findIndex((item) => item.type === "tool_activity" && item.callId === intent.callId);
      if (idx < 0) {
        return [
          ...items,
          {
            type: "tool_activity",
            id: `tool-${intent.callId}`,
            callId: intent.callId,
            toolName: intent.toolName,
            status: intent.status,
            displayLabel: intent.displayLabel,
            inputPreview: intent.inputPreview,
            outcomeSummary: intent.outcomeSummary,
            sourceBadge: intent.sourceBadge,
            detailItems: intent.detailItems,
            summary: intent.summary,
            queryPreview: intent.queryPreview,
            returnedCount: intent.returnedCount,
            totalResults: intent.totalResults,
            resultIdentifiers: intent.resultIdentifiers,
            errorMeta: intent.errorMeta,
            startedAt: ts,
            updatedAt: ts,
            completedAt: intent.status === "done" || intent.status === "failed" ? ts : undefined,
            createdAt: ts,
          },
        ];
      }
      const next = [...items];
      const existing = next[idx];
      if (!existing || existing.type !== "tool_activity") return items;
      next[idx] = {
        ...existing,
        status: intent.status,
        displayLabel: intent.displayLabel ?? existing.displayLabel,
        inputPreview: intent.inputPreview ?? existing.inputPreview,
        outcomeSummary: intent.outcomeSummary ?? existing.outcomeSummary,
        sourceBadge: intent.sourceBadge ?? existing.sourceBadge,
        detailItems: intent.detailItems ?? existing.detailItems,
        summary: intent.summary ?? existing.summary,
        queryPreview: intent.queryPreview ?? existing.queryPreview,
        returnedCount: intent.returnedCount ?? existing.returnedCount,
        totalResults: intent.totalResults ?? existing.totalResults,
        resultIdentifiers: intent.resultIdentifiers ?? existing.resultIdentifiers,
        errorMeta: intent.errorMeta ?? existing.errorMeta,
        updatedAt: ts,
        completedAt:
          intent.status === "done" || intent.status === "failed"
            ? ts
            : existing.completedAt,
      };
      return next;
    });
  };

  const appendArtifact = (intent: Extract<SharedStreamIntent, { type: "artifact_emit" }>) => {
    updateCurrentTimeline((items) => {
      if (intent.artifactId) {
        const idx = items.findIndex((item) => item.type === "artifact" && item.artifactId === intent.artifactId);
        if (idx >= 0) {
          const next = [...items];
          const existing = next[idx];
          if (!existing || existing.type !== "artifact") return items;
          next[idx] = {
            ...existing,
            artifactType: (intent.artifactType ?? existing.artifactType) as ArtifactType,
            status: (intent.artifactStatus ?? existing.status) as ArtifactStatus,
            title: intent.artifactTitle ?? existing.title,
            payload: intent.artifactPayload ?? existing.payload,
            version: intent.artifactVersion ?? existing.version,
          };
          return next;
        }
      }

      return [
        ...items,
        {
          type: "artifact",
          id: buildRuntimeItemId("artifact", intent.artifactId ?? `${now()}-${items.length}`),
          artifactId: intent.artifactId ?? "",
          artifactType: (intent.artifactType ?? "plan") as ArtifactType,
          status: (intent.artifactStatus ?? "proposed") as ArtifactStatus,
          title: intent.artifactTitle ?? "Artifact",
          payload: intent.artifactPayload ?? {},
          version: intent.artifactVersion ?? 1,
          createdAt: now(),
        },
      ];
    });
  };

  const appendCheckpoint = (intent: Extract<SharedStreamIntent, { type: "checkpoint_append" }>) => {
    updateCurrentTimeline((items) => {
      if (items.some((item) => item.type === "checkpoint" && item.label === intent.label)) {
        return items;
      }
      return [
        ...items,
        {
          type: "checkpoint",
          id: buildRuntimeItemId("checkpoint", `${now()}-${items.length}`),
          label: intent.label,
          createdAt: now(),
        },
      ];
    });
  };

  const appendStreamError = (intent: Extract<SharedStreamIntent, { type: "stream_error" }>) => {
    const errorState = buildClientErrorState(intent.errorMeta ?? intent.message);
    updateCurrentTimeline((items) => {
      const itemsWithoutReservedAssistant = stripReservedAssistantTurn(items, deps.aiMessageId);
      const normalizedItems = isDeterministicCapabilityFailure(errorState.errorMeta)
        ? itemsWithoutReservedAssistant.filter((item) => (
          !(item.type === "assistant_message"
            && matchesCanonicalFailureFallback({
              assistantText: item.content,
              streamError: errorState.errorMeta,
            }))
        ))
        : itemsWithoutReservedAssistant;

      const reconciled = reconcileRunScopedRenderedErrors({
        items: normalizedItems.filter((item) => item.type === "error"),
        nextMessage: errorState.message,
        nextMeta: errorState.errorMeta,
        getMessage: (item) => item.type === "error" ? item.message : null,
        getErrorMeta: (item) => item.type === "error" ? item.errorMeta : null,
      });

      if (!reconciled.shouldAppend) {
        const errorIds = new Set(reconciled.items.map((item) => item.id));
        return normalizedItems.filter((item) => item.type !== "error" || errorIds.has(item.id));
      }

      const retainedErrorIds = new Set(reconciled.items.map((item) => item.id));

      return [
        ...normalizedItems.filter((item) => item.type !== "error" || retainedErrorIds.has(item.id)),
        {
          type: "error",
          id: buildRuntimeItemId("error", `${now()}-${normalizedItems.length}`),
          message: errorState.message,
          retryable: errorState.retryable,
          errorMeta: errorState.errorMeta,
          createdAt: now(),
        },
      ];
    });
  };

  const appendUserInputRequest = (intent: Extract<SharedStreamIntent, { type: "user_input_append" }>) => {
    const requestId = `user-input-${intent.request.callId}`;
    updateCurrentTimeline((items) => {
      if (items.some((item) => item.type === "user_input_request" && item.id === requestId)) {
        return items;
      }
      return [
        ...items,
        {
          type: "user_input_request",
          id: requestId,
          callId: intent.request.callId,
          question: intent.request.question,
          questionType: intent.request.questionType,
          options: intent.request.options,
          header: intent.request.header,
          context: intent.request.context,
          page: intent.page,
          section: intent.section,
          answered: false,
          createdAt: now(),
        },
      ];
    });
  };

  const applyIntent = (intent: SharedStreamIntent) => {
    deps.onIntent?.(intent);

    switch (intent.type) {
      case "assistant_reserve": {
        reserveAssistant();
        return;
      }
      case "assistant_upsert": {
        upsertAssistant(intent);
        return;
      }
      case "progress_upsert": {
        upsertProgress(intent);
        return;
      }
      case "progress_clear": {
        clearProgress();
        return;
      }
      case "tool_activity_upsert": {
        upsertToolActivity(intent);
        return;
      }
      case "artifact_emit": {
        appendArtifact(intent);
        return;
      }
      case "plan_step_update": {
        deps.onPlanStepUpdate?.(intent.planId, intent.stepIndex, intent.stepStatus);
        return;
      }
      case "checkpoint_append": {
        appendCheckpoint(intent);
        return;
      }
      case "stream_error": {
        appendStreamError(intent);
        return;
      }
      case "run_set": {
        return;
      }
      case "conversation_sync": {
        currentConversationId = intent.conversationId;
        deps.setActiveConversationId(intent.conversationId);
        deps.ensureConversationTimeline(intent.conversationId);
        return;
      }
      case "conversation_title": {
        const targetId = intent.conversationId ?? currentConversationId;
        deps.upsertConversationTitle(targetId, intent.title);
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
        appendUserInputRequest(intent);
        return;
      }
      case "navigate": {
        deps.onNavigate(intent.url);
        return;
      }
      case "ledger_changed": {
        if (!deps.selectedProjectId) return;
        if (deps.emitLedgerChanged) {
          deps.emitLedgerChanged(deps.selectedProjectId);
          return;
        }
        dispatchProjectDataChanged({
          projectId: deps.selectedProjectId,
          domains: ["ledger"],
          reason: "server_mutation",
          source: "ai_stream_tool_result",
        });
        return;
      }
    }
  };

  const failRunningTools = (summary: string) => {
    const ts = now();
    updateCurrentTimeline((items) =>
      items.map((item) =>
        item.type === "tool_activity" && item.status === "running"
          ? {
              ...item,
              status: "failed",
              summary,
              updatedAt: ts,
              completedAt: ts,
            }
          : item
      )
    );
  };

  const interruptRunningTools = (summary: string) => {
    const ts = now();
    updateCurrentTimeline((items) =>
      items.map((item) =>
        item.type === "tool_activity" && item.status === "running"
          ? {
              ...item,
              status: "interrupted",
              summary,
              updatedAt: ts,
            }
          : item
      )
    );
  };

  return {
    reserveAssistantTurn: () => {
      const reserved = reserveSharedAssistantTurn(streamState);
      streamState = reserved.state;
      for (const intent of reserved.intents) {
        applyIntent(intent);
      }
    },
    handleChunk: (chunk: AIStreamChunk) => {
      const runningToolCallsBeforeChunk = streamState.runningToolCallIds.length;
      const reduced = reduceSharedStreamChunk(streamState, chunk, {
        page: deps.page,
        section: deps.section,
      });
      streamState = reduced.state;
      if (chunk.type === "run_end") {
        lastRunEndToolCounts = {
          beforeClear: runningToolCallsBeforeChunk,
          afterClear: streamState.runningToolCallIds.length,
        };
      }
      for (const intent of reduced.intents) {
        applyIntent(intent);
      }
    },
    clearProgress,
    failRunningTools,
    interruptRunningTools,
    getConversationId: () => currentConversationId,
    getState: () => streamState,
    getLastRunEndToolCounts: () => lastRunEndToolCounts,
  };
}
