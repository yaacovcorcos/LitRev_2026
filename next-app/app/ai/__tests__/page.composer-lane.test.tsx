// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  getAiViewMocks,
  installAiViewTestLifecycle,
  renderAiView,
} from "./page-support";

installAiViewTestLifecycle();

const {
  mockGetConversation,
  mockProcessAIStream,
  mockReviewArtifactAction,
} = getAiViewMocks();

describe("/ai page composer lane and attachment surfaces", () => {
  it("renders attached live progress above the composer without duplicating the inline progress row", async () => {
    mockProcessAIStream.mockImplementationOnce(async ({ onChunk }: {
      onChunk: (chunk: unknown) => void | Promise<void>;
    }) => {
      await onChunk({
        type: "progress",
        progressMessage: "Reviewing PubMed results",
        progressCurrent: 2,
        progressTotal: 3,
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

    renderAiView();

    fireEvent.click(screen.getByRole("button", { name: "send message" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeTruthy();
    });

    const status = screen.getByRole("status");
    const sendButton = screen.getByRole("button", { name: "send message" });
    const lane = document.querySelector('[data-composer-stack-lane="true"]');
    expect(lane?.contains(status)).toBe(true);
    expect(lane?.contains(screen.getByTestId("ai-composer"))).toBe(true);
    expect(status.getAttribute("data-stack-position")).toBe("top");
    expect(screen.getByTestId("ai-composer").getAttribute("data-attached-stack")).toBe("attached");
    expect(screen.getByText("Reviewing PubMed results")).toBeTruthy();
    expect(screen.getByText("2 of 3")).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(status.compareDocumentPosition(sendButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("timeline-suppressed-progress").textContent).not.toBe("");
    expect(screen.queryAllByText("Reviewing PubMed results")).toHaveLength(1);
  });

  it("elevates live progress above the composer and suppresses the matching inline timeline row", async () => {
    mockProcessAIStream.mockImplementation(async ({ onChunk }: {
      onChunk: (chunk: unknown) => void | Promise<void>;
    }) => {
      await onChunk({ type: "progress", progressMessage: "Searching PubMed", progressCurrent: 1, progressTotal: 3 });
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

    renderAiView();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "send message" }));
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeTruthy();
    });

    expect(screen.getByText("Searching PubMed")).toBeTruthy();
    expect(screen.getByTestId("timeline-suppressed-progress").textContent).toMatch(/^progress-/);
    const timelineText = screen.getByTestId("timeline-suppressed-progress").parentElement?.textContent ?? "";
    expect(timelineText).not.toContain("Searching PubMedSearching PubMed");
  });

  it("renders a queued follow-up cap between live progress and the composer", async () => {
    let resolveStream: ((summary: {
      runStatus: null;
      stopReason: null;
      terminalReason: "failed_network";
      errorMessage: null;
      errorMeta: null;
      actualModel: null;
      actualModelSource: "unknown";
    }) => void) | null = null;
    mockProcessAIStream.mockImplementationOnce(async ({ onChunk }: {
      onChunk: (chunk: unknown) => void | Promise<void>;
    }) => {
      await onChunk({
        type: "progress",
        progressMessage: "Reading protocol...",
        progressCurrent: 1,
        progressTotal: 2,
      });
      return await new Promise((resolve) => {
        resolveStream = resolve;
      });
    });

    renderAiView();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "composer ready" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "send message" }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "queue next" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("ai-has-queued").textContent).toBe("yes");
      expect(screen.getByText("Reading protocol...")).toBeTruthy();
      expect(screen.getByText("Queued next message")).toBeTruthy();
      expect(screen.getByText("Queue this next")).toBeTruthy();
    });

    const progress = screen.getByText("Reading protocol...").closest("[data-stack-position]");
    const queued = screen.getByText("Queued next message").closest("[data-stack-position]");
    const composerState = screen.getByTestId("ai-composer");
    const lane = document.querySelector('[data-composer-stack-lane="true"]');

    expect(lane?.contains(progress!)).toBe(true);
    expect(lane?.contains(queued!)).toBe(true);
    expect(lane?.contains(composerState)).toBe(true);
    expect(progress?.getAttribute("data-stack-position")).toBe("top");
    expect(queued?.getAttribute("data-stack-position")).toBe("middle");
    expect(composerState.getAttribute("data-attached-stack")).toBe("attached");
    expect(progress!.compareDocumentPosition(queued!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(queued!.compareDocumentPosition(composerState) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await act(async () => {
      resolveStream?.({
        runStatus: null,
        stopReason: null,
        terminalReason: "failed_network",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      });
      await Promise.resolve();
    });
  });

  it("allows queueing before the first conversation id exists", async () => {
    renderAiView();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "queue next" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("ai-has-queued").textContent).toBe("yes");
      expect(screen.getByText("Queued next message")).toBeTruthy();
      expect(screen.getByText("Queue this next")).toBeTruthy();
    });

    const lane = document.querySelector('[data-composer-stack-lane="true"]');
    expect(lane?.contains(screen.getByText("Queued next message"))).toBe(true);
    expect(lane?.contains(screen.getByTestId("ai-composer"))).toBe(true);
    expect(screen.getByText("Queued next message").closest("[data-stack-position]")?.getAttribute("data-stack-position")).toBe("top");
    expect(screen.getByTestId("ai-composer").getAttribute("data-attached-stack")).toBe("attached");
  });

  it("renders the pending approval bar above the composer for persisted proposed artifacts", async () => {
    mockGetConversation.mockResolvedValueOnce({
      success: true,
      data: {
        id: "conv-1",
        title: "First chat",
        messages: [],
        artifacts: [
          {
            id: "cproposal1",
            type: "memory_proposal",
            status: "proposed",
            title: "Memory 1",
            payload: {},
            version: 1,
            createdAt: "2026-03-17T00:00:00.000Z",
          },
          {
            id: "cproposal2",
            type: "draft_diff",
            status: "proposed",
            title: "Draft 2",
            payload: { section: "Intro", content: "Body", citations: [], wordCount: 1 },
            version: 1,
            createdAt: "2026-03-17T00:00:01.000Z",
          },
        ],
      },
    });

    renderAiView();

    fireEvent.click(screen.getByLabelText("Open chat history"));
    await waitFor(() => {
      expect(screen.getByText("First chat")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("First chat"));

    await waitFor(() => {
      expect(screen.getByText("2 pending proposals")).toBeTruthy();
    });

    const lane = document.querySelector('[data-composer-stack-lane="true"]');
    const barText = screen.getByText("2 pending proposals");
    const composer = screen.getByTestId("ai-composer");

    expect(lane?.contains(barText)).toBe(true);
    expect(lane?.contains(composer)).toBe(true);
    expect(barText.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(composer.getAttribute("data-attached-stack")).toBe("attached");
  });

  it("keeps artifact status proposed until review succeeds", async () => {
    let resolveReview: ((value: unknown) => void) | null = null;
    mockGetConversation.mockResolvedValueOnce({
      success: true,
      data: {
        id: "conv-1",
        title: "First chat",
        messages: [],
        artifacts: [
          {
            id: "artifact-1",
            type: "draft_diff",
            status: "proposed",
            title: "Draft proposal",
            payload: { section: "Intro", content: "Body", citations: [], wordCount: 1 },
            version: 1,
            createdAt: "2026-03-17T00:00:00.000Z",
          },
        ],
      },
    });
    mockReviewArtifactAction.mockImplementation(() => new Promise((resolve) => {
      resolveReview = resolve;
    }));

    renderAiView();

    fireEvent.click(screen.getByLabelText("Open chat history"));
    await waitFor(() => {
      expect(screen.getByText("First chat")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("First chat"));

    await waitFor(() => {
      expect(screen.getByText("artifact:proposed")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "review artifact" }));

    expect(screen.getByText("artifact:proposed")).toBeTruthy();
    await waitFor(() => {
      expect(mockReviewArtifactAction).toHaveBeenCalledWith("artifact-1", "accepted", undefined, undefined);
    });

    await act(async () => {
      resolveReview?.({
        success: true,
        artifact: {
          id: "artifact-1",
          type: "draft_diff",
          status: "accepted",
          projectId: "proj-1",
          payload: { section: "Intro", content: "Accepted", citations: [], wordCount: 1 },
        },
      });
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByText("artifact:accepted")).toBeTruthy();
    });
  });

  it("keeps the composer standalone when no attached caps are present", () => {
    renderAiView();

    const lane = document.querySelector('[data-composer-stack-lane="true"]');
    expect(lane?.contains(screen.getByTestId("ai-composer"))).toBe(true);
    expect(screen.getByTestId("ai-composer").getAttribute("data-attached-stack")).toBe("none");
    expect(screen.queryByText("Queued next message")).toBeNull();
  });
});
