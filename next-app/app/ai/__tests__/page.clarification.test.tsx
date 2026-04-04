// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  flushZeroTimeout,
  getAiViewMocks,
  installAiViewTestLifecycle,
  readFetchRequestBody,
  renderAiView,
} from "./page-support";

installAiViewTestLifecycle();

const {
  mockFetch,
  mockProcessAIStream,
} = getAiViewMocks();

describe("/ai page clarification handling", () => {
  it("resumes ask_user answers through the structured clarification path instead of a plain user turn", async () => {
    mockProcessAIStream
      .mockImplementationOnce(async ({ onChunk }: {
        onChunk: (chunk: unknown) => void | Promise<void>;
      }) => {
        await onChunk({ type: "run_start", runId: "run-ask", conversationId: "conv-new" });
        await onChunk({
          type: "user_input_required",
          userInputRequest: {
            sourceRunId: "run-ask",
            callId: "ask-1",
            question: "Which direction should I take?",
            questionType: "single_choice",
            recommendedAnswer: "Broaden the search first.",
          },
        });
        return {
          runStatus: "paused",
          stopReason: "paused_for_input",
          terminalReason: "paused_for_input",
          errorMessage: null,
          errorMeta: null,
          actualModel: null,
          actualModelSource: "unknown",
        };
      })
      .mockImplementationOnce(async () => ({
        runStatus: "completed",
        stopReason: null,
        terminalReason: "completed",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      }));

    renderAiView();

    fireEvent.click(screen.getByRole("button", { name: "send message" }));

    await waitFor(() => {
      expect(screen.getByText("Which direction should I take?")).toBeTruthy();
    });

    await flushZeroTimeout();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "answer user input" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    const parsedBody = readFetchRequestBody(1);
    expect(parsedBody.userMessage).toBe("");
    expect(parsedBody.options).toMatchObject({
      continueFromRunId: "run-ask",
      replaceRunId: "run-ask",
      persistUserMessage: false,
      userInputResolution: {
        sourceRunId: "run-ask",
        callId: "ask-1",
        resolution: "answered",
        answerText: "Broaden the search first.",
      },
    });
  });

  it("treats a freeform send while blocked as cancel-and-new-run instead of a hidden clarification resume", async () => {
    mockProcessAIStream
      .mockImplementationOnce(async ({ onChunk }: {
        onChunk: (chunk: unknown) => void | Promise<void>;
      }) => {
        await onChunk({ type: "run_start", runId: "run-ask", conversationId: "conv-new" });
        await onChunk({
          type: "user_input_required",
          userInputRequest: {
            sourceRunId: "run-ask",
            callId: "ask-1",
            question: "Which direction should I take?",
            questionType: "single_choice",
            options: [{ label: "Broaden the search first." }],
          },
        });
        return {
          runStatus: "waiting_for_input",
          stopReason: "paused_for_input",
          terminalReason: "paused_for_input",
          errorMessage: null,
          errorMeta: null,
          actualModel: null,
          actualModelSource: "unknown",
        };
      })
      .mockImplementationOnce(async () => ({
        runStatus: "completed",
        stopReason: null,
        terminalReason: "completed",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      }));

    renderAiView();

    fireEvent.click(screen.getByRole("button", { name: "send message" }));

    await waitFor(() => {
      expect(screen.getByText("Which direction should I take?")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "send message" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    const parsedBody = readFetchRequestBody(1);
    expect(parsedBody.userMessage).toBe("Recover this run");
    expect(parsedBody.options).toMatchObject({
      userInputResolution: {
        sourceRunId: "run-ask",
        callId: "ask-1",
        resolution: "cancelled",
        answerText: "Recover this run",
      },
    });
  });

  it("treats blocked-card cancel as a terminal dismissal without reconnect or stream-ended fallback copy", async () => {
    mockProcessAIStream
      .mockImplementationOnce(async ({ onChunk }: {
        onChunk: (chunk: unknown) => void | Promise<void>;
      }) => {
        await onChunk({ type: "run_start", runId: "run-ask", conversationId: "conv-new" });
        await onChunk({
          type: "user_input_required",
          userInputRequest: {
            sourceRunId: "run-ask",
            callId: "ask-1",
            question: "Which direction should I take?",
            questionType: "single_choice",
          },
        });
        return {
          runStatus: "paused",
          stopReason: "paused_for_input",
          terminalReason: "paused_for_input",
          errorMessage: null,
          errorMeta: null,
          actualModel: null,
          actualModelSource: "unknown",
        };
      })
      .mockImplementationOnce(async ({ onChunk }: {
        onChunk: (chunk: unknown) => void | Promise<void>;
      }) => {
        await onChunk({
          type: "user_input_resolved",
          userInputResolution: {
            sourceRunId: "run-ask",
            callId: "ask-1",
            resolution: "cancelled",
            answerText: "Cancelled by the user.",
            answeredAt: "2026-03-24T10:00:00.000Z",
          },
        });
        await onChunk({
          type: "run_end",
          runStatus: "cancelled",
          stopReason: "cancelled",
        });
        return {
          runStatus: "cancelled",
          stopReason: "cancelled",
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
      expect(screen.getByText("Which direction should I take?")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "cancel user input" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    const parsedBody = readFetchRequestBody(1);
    expect(parsedBody.userMessage).toBe("");
    expect(parsedBody.options).toMatchObject({
      continueFromRunId: "run-ask",
      replaceRunId: "run-ask",
      persistUserMessage: false,
      userInputResolution: {
        sourceRunId: "run-ask",
        callId: "ask-1",
        resolution: "cancelled",
        answerText: "Cancelled by the user.",
      },
    });
    expect(screen.queryByText("Cancelled by the user.")).toBeNull();
    expect(screen.queryByText("Run interrupted. Reconnecting to the active run…")).toBeNull();
    expect(screen.queryByText("The stream ended unexpectedly. Retry to continue.")).toBeNull();
    expect(screen.queryByText("Run interrupted and recovery failed. You can retry safely now.")).toBeNull();
  });
});
