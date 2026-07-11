// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  flushZeroTimeout,
  getAiViewMocks,
  installAiViewTestLifecycle,
  readFetchRequestBody,
  renderAiView,
  runAllTimersAndFlush,
} from "./page-support";

installAiViewTestLifecycle();

const {
  mockFetch,
  mockGetConversation,
  mockListConversations,
  mockPollRunRecovery,
  mockProcessAIStream,
} = getAiViewMocks();

describe("/ai page recovery truth and continuation", () => {
  it("settles explicit user stop into truthful retryable timeline state", async () => {
    let resolveStream: (() => void) | null = null;
    mockProcessAIStream.mockImplementation(async ({ onChunk }: {
      onChunk: (chunk: unknown) => void | Promise<void>;
    }) => {
      await onChunk({ type: "run_start", runId: "run-cancel", conversationId: "conv-new" });
      await onChunk({
        type: "checkpoint",
        checkpointLabel: "PubMed found 105 results. Narrowing the search next.",
      });
      await new Promise<void>((resolve) => {
        resolveStream = resolve;
      });
      return {
        runStatus: null,
        stopReason: null,
        terminalReason: "cancelled_by_user",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      };
    });

    renderAiView();
    fireEvent.click(screen.getByRole("button", { name: "send message" }));

    await waitFor(() => {
      expect(screen.getByText("PubMed found 105 results. Narrowing the search next.")).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "stop generation" }));

    await waitFor(() => {
      expect(screen.getByText("Stopped by you. Completed work is preserved.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    });
    expect(screen.getByText("Recover this run")).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledWith(
      "/api/ai/runs/run-cancel/cancel",
      { method: "POST" },
    );

    await act(async () => {
      resolveStream?.();
      await Promise.resolve();
    });
  });

  it("does not append a false terminal failure after a recovered completed run", async () => {
    mockProcessAIStream.mockImplementation(async ({ onChunk }: {
      onChunk: (chunk: unknown) => void | Promise<void>;
    }) => {
      await onChunk({ type: "run_start", runId: "run-1", conversationId: "conv-new" });
      return {
        runStatus: null,
        stopReason: null,
        terminalReason: "failed_network",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      };
    });
    mockPollRunRecovery.mockImplementation(async ({ onTerminal }: {
      onTerminal: (chunk: unknown) => Promise<void>;
    }) => {
      await onTerminal({ type: "content", content: "Recovered answer." });
      await onTerminal({ type: "run_end", runStatus: "completed", stopReason: null });
      return {
        outcome: "recovered",
        response: {
          conversationId: "conv-new",
          runId: "run-1",
          runStatus: "completed",
          isActive: false,
          runPhase: "finalize",
          phaseEnteredAt: "2026-03-11T11:19:00.000Z",
          lastActivityAt: "2026-03-11T11:20:00.000Z",
          lastSequence: 2,
          replayableEvents: [],
          terminalEvent: {
            chunk: { type: "run_end", runStatus: "completed", stopReason: null },
          },
          recoveryRecommendation: "terminal",
          abnormalEndClassification: null,
        },
        lastAppliedSequence: 2,
      };
    });

    renderAiView();

    fireEvent.click(screen.getByRole("button", { name: "send message" }));

    await waitFor(() => {
      expect(screen.getByText("Recovered answer.")).toBeTruthy();
    });

    expect(screen.queryByText("Run interrupted. Reconnecting to the active run…")).toBeNull();
    expect(screen.queryByText("The stream ended unexpectedly. Retry to continue.")).toBeNull();
    expect(screen.queryByText("Run interrupted and recovery failed. You can retry safely now.")).toBeNull();
  });

  it("keeps recovered paused runs in a question state without a red failure", async () => {
    mockProcessAIStream.mockImplementation(async ({ onChunk }: {
      onChunk: (chunk: unknown) => void | Promise<void>;
    }) => {
      await onChunk({ type: "run_start", runId: "run-2", conversationId: "conv-new" });
      return {
        runStatus: null,
        stopReason: null,
        terminalReason: "failed_network",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      };
    });
    mockPollRunRecovery.mockImplementation(async ({ onReplay, onTerminal }: {
      onReplay: (chunk: unknown) => Promise<void>;
      onTerminal: (chunk: unknown) => Promise<void>;
    }) => {
      await onReplay({
        type: "checkpoint",
        checkpointLabel: "PubMed found 18 total results. Reviewing the strongest matches now.",
      });
      await onReplay({
        type: "user_input_required",
        userInputRequest: {
          callId: "ask-1",
          question: "Which study should I inspect first?",
          questionType: "single_choice",
        },
      });
      await onTerminal({ type: "run_end", runStatus: "paused", stopReason: "paused_for_input" });
      return {
        outcome: "recovered",
        response: {
          conversationId: "conv-new",
          runId: "run-2",
          runStatus: "paused",
          isActive: false,
          runPhase: "ask",
          phaseEnteredAt: "2026-03-11T11:24:00.000Z",
          lastActivityAt: "2026-03-11T11:25:00.000Z",
          lastSequence: 3,
          replayableEvents: [],
          terminalEvent: {
            chunk: { type: "run_end", runStatus: "paused", stopReason: "paused_for_input" },
          },
          recoveryRecommendation: "terminal",
          abnormalEndClassification: null,
        },
        lastAppliedSequence: 3,
      };
    });

    renderAiView();

    fireEvent.click(screen.getByRole("button", { name: "send message" }));

    await waitFor(() => {
      expect(screen.getByText("Which study should I inspect first?")).toBeTruthy();
    });

    expect(screen.getByText("PubMed found 18 total results. Reviewing the strongest matches now.")).toBeTruthy();
    expect(screen.queryByText("Run interrupted. Reconnecting to the active run…")).toBeNull();
    expect(screen.queryByText("The stream ended unexpectedly. Retry to continue.")).toBeNull();
    expect(screen.queryByText("Run interrupted and recovery failed. You can retry safely now.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("restores a recent recoverable ai run after history load and replays recovery through the existing runtime path", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem("litrev:ai-entry:v1:__global__", JSON.stringify({
      version: 1,
      lastConversationId: "conv-1",
      lastRecoverableRunId: "run-restore",
      lastRecoverableAtMs: Date.now(),
    }));
    mockPollRunRecovery.mockResolvedValue({
      outcome: "recovered",
      response: {
        conversationId: "conv-1",
        runId: "run-restore",
        runStatus: "paused",
        isActive: false,
        runPhase: "ask",
        phaseEnteredAt: "2026-03-29T10:00:00.000Z",
        lastActivityAt: "2026-03-29T10:01:00.000Z",
        lastSequence: 0,
        replayableEvents: [],
        terminalEvent: null,
        recoveryRecommendation: "terminal",
        abnormalEndClassification: null,
      },
      lastAppliedSequence: -1,
    });

    renderAiView();

    fireEvent.click(screen.getByRole("button", { name: "composer ready" }));
    await runAllTimersAndFlush();
    vi.useRealTimers();

    await waitFor(() => {
      expect(mockGetConversation).toHaveBeenCalledWith("conv-1");
    });
    await waitFor(() => {
      expect(mockPollRunRecovery).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: "conv-1",
          runId: "run-restore",
        }),
      );
    });
  });

  it("fails soft and clears stale ai restore state when the stored conversation no longer exists", async () => {
    vi.useFakeTimers();
    window.localStorage.setItem("litrev:ai-entry:v1:__global__", JSON.stringify({
      version: 1,
      lastConversationId: "missing-conv",
      lastRecoverableRunId: "run-missing",
      lastRecoverableAtMs: Date.now(),
    }));

    renderAiView();

    fireEvent.click(screen.getByRole("button", { name: "composer ready" }));
    await runAllTimersAndFlush();
    vi.useRealTimers();

    await waitFor(() => {
      expect(mockListConversations).toHaveBeenCalled();
    });

    expect(mockGetConversation).not.toHaveBeenCalled();
    expect(mockPollRunRecovery).not.toHaveBeenCalled();
    expect(window.localStorage.getItem("litrev:ai-entry:v1:__global__")).toBeNull();
  });

  it("replaces a reconnect checkpoint with stronger same-run stop-and-retry truth", async () => {
    mockProcessAIStream.mockImplementation(async ({ onChunk }: {
      onChunk: (chunk: unknown) => void | Promise<void>;
    }) => {
      await onChunk({ type: "run_start", runId: "run-3", conversationId: "conv-new" });
      await onChunk({
        type: "tool_result",
        toolName: "pubmed_search",
        toolResult: { callId: "tool-1", result: { ok: true } },
      });
      return {
        runStatus: null,
        stopReason: null,
        terminalReason: "failed_network",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      };
    });
    mockPollRunRecovery.mockResolvedValue({
      outcome: "needs_user_action",
      response: {
        conversationId: "conv-new",
        runId: "run-3",
        runStatus: "running",
        isActive: true,
        runPhase: "act",
        phaseEnteredAt: "2026-03-13T11:24:00.000Z",
        lastActivityAt: "2026-03-13T11:25:00.000Z",
        lastDurableProgressAt: "2026-03-13T11:20:00.000Z",
        finalizationState: "not_started",
        lastSequence: 2,
        replayableEvents: [],
        terminalEvent: null,
        recoveryRecommendation: "stop_and_retry",
        abnormalEndClassification: "no_forward_durable_progress",
      },
      lastAppliedSequence: 2,
    });

    renderAiView();

    fireEvent.click(screen.getByRole("button", { name: "send message" }));
    await flushZeroTimeout();

    await waitFor(() => {
      expect(screen.getByText("The active run stopped making durable progress. Choose how to continue.")).toBeTruthy();
    });

    expect(screen.queryByText("Run interrupted. Reconnecting to the active run…")).toBeNull();
    expect(screen.queryByText("The stream ended unexpectedly. Retry to continue.")).toBeNull();
    expect(screen.queryAllByText("The active run stopped making durable progress. Choose how to continue.")).toHaveLength(1);
  });

  it("routes stop-and-retry through best-effort checkpointed retry semantics", async () => {
    mockProcessAIStream
      .mockImplementationOnce(async ({ onChunk }: {
        onChunk: (chunk: unknown) => void | Promise<void>;
      }) => {
        await onChunk({ type: "run_start", runId: "run-3", conversationId: "conv-new" });
        return {
          runStatus: null,
          stopReason: null,
          terminalReason: "failed_network",
          errorMessage: null,
          errorMeta: null,
          actualModel: null,
          actualModelSource: "unknown",
        };
      })
      .mockImplementationOnce(async () => ({
        runStatus: null,
        stopReason: null,
        terminalReason: "completed",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      }));
    mockPollRunRecovery.mockResolvedValueOnce({
      outcome: "needs_user_action",
      response: {
        conversationId: "conv-new",
        runId: "run-3",
        runStatus: "running",
        isActive: true,
        runPhase: "act",
        phaseEnteredAt: "2026-03-13T11:24:00.000Z",
        lastActivityAt: "2026-03-13T11:25:00.000Z",
        lastDurableProgressAt: "2026-03-13T11:20:00.000Z",
        finalizationState: "not_started",
        lastSequence: 2,
        replayableEvents: [],
        terminalEvent: null,
        recoveryRecommendation: "stop_and_retry",
        abnormalEndClassification: "no_forward_durable_progress",
      },
      lastAppliedSequence: 2,
    });

    renderAiView();

    fireEvent.click(screen.getByRole("button", { name: "send message" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Stop & Retry" })).toBeTruthy();
    });

    await flushZeroTimeout();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Stop & Retry" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    const retryRequest = readFetchRequestBody(1) as {
      options: {
        replaceRunId?: string;
        preferContinueFromRunId?: string;
        continueFromRunId?: string;
      };
    };

    expect(retryRequest.options).toMatchObject({
      replaceRunId: "run-3",
      preferContinueFromRunId: "run-3",
    });
    expect(retryRequest.options.continueFromRunId).toBeUndefined();
  });

  it("continues from the existing durable state without appending a duplicate user message", async () => {
    mockProcessAIStream
      .mockImplementationOnce(async ({ onChunk }: {
        onChunk: (chunk: unknown) => void | Promise<void>;
      }) => {
        await onChunk({ type: "run_start", runId: "run-4", conversationId: "conv-new" });
        return {
          runStatus: null,
          stopReason: null,
          terminalReason: "failed_network",
          errorMessage: null,
          errorMeta: null,
          actualModel: null,
          actualModelSource: "unknown",
        };
      })
      .mockImplementationOnce(async () => ({
        runStatus: null,
        stopReason: null,
        terminalReason: "completed",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      }));
    mockPollRunRecovery.mockResolvedValueOnce({
      outcome: "needs_user_action",
      response: {
        conversationId: "conv-new",
        runId: "run-4",
        runStatus: "running",
        isActive: true,
        runPhase: "finalize",
        phaseEnteredAt: "2026-03-14T10:24:00.000Z",
        lastActivityAt: "2026-03-14T10:25:00.000Z",
        lastDurableProgressAt: "2026-03-14T10:20:00.000Z",
        finalizationState: "failed",
        lastSequence: 2,
        replayableEvents: [],
        terminalEvent: null,
        recoveryRecommendation: "continue_from_durable_state",
        abnormalEndClassification: "finalization_failed",
      },
      lastAppliedSequence: 2,
    });

    renderAiView();

    fireEvent.click(screen.getByRole("button", { name: "send message" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    });

    expect(screen.getAllByText("Recover this run")).toHaveLength(1);
    await flushZeroTimeout();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    expect(readFetchRequestBody(1).options).toMatchObject({
      continueFromRunId: "run-4",
      replaceRunId: "run-4",
      persistUserMessage: false,
    });
    expect(screen.getAllByText("Recover this run")).toHaveLength(1);
  });

  it("continues from the latest checkpoint without appending a duplicate user message", async () => {
    mockProcessAIStream
      .mockImplementationOnce(async ({ onChunk }: {
        onChunk: (chunk: unknown) => void | Promise<void>;
      }) => {
        await onChunk({ type: "run_start", runId: "run-5", conversationId: "conv-new" });
        return {
          runStatus: null,
          stopReason: null,
          terminalReason: "failed_network",
          errorMessage: null,
          errorMeta: null,
          actualModel: null,
          actualModelSource: "unknown",
        };
      })
      .mockImplementationOnce(async () => ({
        runStatus: null,
        stopReason: null,
        terminalReason: "completed",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      }));
    mockPollRunRecovery.mockResolvedValueOnce({
      outcome: "needs_user_action",
      response: {
        conversationId: "conv-new",
        runId: "run-5",
        runStatus: "running",
        isActive: true,
        runPhase: "finalize",
        phaseEnteredAt: "2026-03-14T10:24:00.000Z",
        lastActivityAt: "2026-03-14T10:25:00.000Z",
        lastDurableProgressAt: "2026-03-14T10:20:00.000Z",
        finalizationState: "failed",
        lastSequence: 2,
        replayableEvents: [],
        terminalEvent: null,
        recoveryRecommendation: "continue_from_checkpoint",
        abnormalEndClassification: "finalization_failed",
      },
      lastAppliedSequence: 2,
    });

    renderAiView();

    fireEvent.click(screen.getByRole("button", { name: "send message" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    });

    await flushZeroTimeout();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    expect(readFetchRequestBody(1).options).toMatchObject({
      continueFromRunId: "run-5",
      replaceRunId: "run-5",
      persistUserMessage: false,
    });
  });
});
