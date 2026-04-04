// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectCopilotPanel } from "../ProjectCopilotPanel";

const { mockUseProjectConversation, mockNotify } = vi.hoisted(() => ({
  mockUseProjectConversation: vi.fn(),
  mockNotify: vi.fn(),
}));

vi.mock("@/contexts/ProjectConversationContext", () => ({
  useProjectConversation: mockUseProjectConversation,
}));

vi.mock("@/app/actions/notes", () => ({
  createNoteAction: vi.fn(),
}));

vi.mock("@/contexts/NotificationContext", () => ({
  useNotifications: () => ({
    notify: mockNotify,
  }),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "project-1" }),
}));

vi.mock("@radix-ui/react-popover", () => ({
  Root: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Trigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  Portal: ({ children }: { children: ReactNode }) => <>{children}</>,
  Content: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const { mockChatTimeline } = vi.hoisted(() => ({
  mockChatTimeline: vi.fn(),
}));

vi.mock("../../chat/ChatTimeline", () => ({
  ChatTimeline: (props: {
    onSuggestionClick: (prompt: string) => void;
    onAnswerUserInput?: (callId: string, answer: string, page?: "overview", section?: string, resolution?: "answered") => void;
  }) => {
    mockChatTimeline(props);
    return (
      <div>
        <button
          type="button"
          data-testid="panel-suggestion"
          onClick={() => props.onSuggestionClick("Summarize my project progress")}
        >
          Suggest
        </button>
      </div>
    );
  },
}));

vi.mock("../ProjectConversationComposer", () => ({
  ProjectConversationComposer: ({
    prefillCommand,
    onPrefillConsumed,
    hasQueuedFollowUp,
    attachedStack,
    interactionLocked,
  }: {
    prefillCommand?: { text: string; id: string } | null;
    onPrefillConsumed?: () => void;
    hasQueuedFollowUp?: boolean;
    attachedStack?: "none" | "attached";
    interactionLocked?: boolean;
  }) => (
    <div>
      <div data-testid="copilot-prefill">{prefillCommand?.text ?? ""}</div>
      <div data-testid="copilot-has-queued">{hasQueuedFollowUp ? "yes" : "no"}</div>
      <div data-testid="copilot-attached-stack">{attachedStack ?? "none"}</div>
      <div data-testid="copilot-interaction-locked">{interactionLocked ? "yes" : "no"}</div>
      <button type="button" data-testid="consume-prefill" onClick={() => onPrefillConsumed?.()}>
        Consume
      </button>
    </div>
  ),
}));

vi.mock("../ProjectConversationAutonomySettings", () => ({
  ProjectConversationAutonomySettings: () => null,
}));

describe("ProjectCopilotPanel suggestion wiring", () => {
  let baseContextValue: Record<string, unknown>;

  beforeEach(() => {
    baseContextValue = {
      messages: [
        {
          id: "user-1",
          sender: "user",
          text: "Recover this search",
          createdAt: "2026-03-10T23:59:59.000Z",
          context: { page: "overview" },
        },
        {
          id: "progress-1",
          sender: "ai",
          text: "",
          createdAt: "2026-03-11T00:00:00.000Z",
          progress: { message: "Reviewing PubMed results", current: 2, total: 3 },
        },
      ],
      isCollapsed: false,
      isLoading: false,
      reasoningMode: "full",
      setReasoningMode: vi.fn(),
      setCollapsed: vi.fn(),
      conversations: [],
      currentConversationId: null,
      isConversationLoading: false,
      selectConversation: vi.fn(),
      newConversation: vi.fn(),
      branchConversation: vi.fn(),
      reconnectRun: vi.fn(),
      reconcileArtifactStatus: vi.fn(),
      sendMessage: vi.fn(),
      answerUserInput: vi.fn(),
      handleReviewArtifact: vi.fn(),
      handleUndoArtifact: vi.fn(),
      approveArtifactsBatch: vi.fn(),
      executePlan: vi.fn(),
      shouldOfferSummary: false,
      summarizeAndRefresh: vi.fn(),
      isSummarizing: false,
      setShowAutonomySettings: vi.fn(),
      selectedModel: "gpt-5.2",
      prefillCommand: null,
      consumePrefillCommand: vi.fn(),
      queuedFollowUp: null,
      clearQueuedFollowUp: vi.fn(),
    };
    mockUseProjectConversation.mockReturnValue(baseContextValue);
    mockChatTimeline.mockReset();
    mockNotify.mockReset();
  });

  it("prefills panel input when empty-state suggestion is clicked", async () => {
    render(
      <ProjectCopilotPanel
        page="overview"
        contextDisplay="Overview"
        emptyState={{
          icon: "smart_toy",
          title: "AI Copilot",
          description: "Help text",
          suggestions: [{ label: "Summarize", prompt: "Summarize my project progress" }],
        }}
        inputPlaceholder="Ask..."
      />,
    );

    const suggestionButton = await screen.findByTestId("panel-suggestion");
    fireEvent.click(suggestionButton);

    expect(screen.getByTestId("copilot-prefill").textContent).toBe("Summarize my project progress");

    fireEvent.click(screen.getByTestId("consume-prefill"));
    expect(screen.getByTestId("copilot-prefill").textContent).toBe("");
  });

  it("renders elevated progress above the composer and suppresses the matching inline progress row", () => {
    render(
      <ProjectCopilotPanel
        page="overview"
        contextDisplay="Overview"
        emptyState={{
          icon: "smart_toy",
          title: "AI Copilot",
          description: "Help text",
          suggestions: [{ label: "Summarize", prompt: "Summarize my project progress" }],
        }}
        inputPlaceholder="Ask..."
      />,
    );

    const status = screen.getByRole("status");
    const input = screen.getByTestId("copilot-prefill");
    const lane = document.querySelector('[data-composer-stack-lane="true"]');
    expect(lane?.contains(status)).toBe(true);
    expect(lane?.contains(input)).toBe(true);
    expect(status.getAttribute("data-stack-position")).toBe("top");
    expect(screen.getByTestId("copilot-attached-stack").textContent).toBe("attached");
    expect(screen.getByText("Reviewing PubMed results")).toBeTruthy();
    expect(screen.getByText("2 of 3")).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(status.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const props = mockChatTimeline.mock.calls[0]?.[0] as { suppressedProgressId?: string | null };
    expect(props.suppressedProgressId).toBe("progress-1");
  });

  it("renders the pending approval bar above the composer for persisted proposed artifacts", async () => {
    const approveArtifactsBatch = vi.fn(async (artifactIds: string[]) => ({
      approvedCount: artifactIds.length,
      failedArtifactIds: [],
      stopped: false,
    }));

    mockUseProjectConversation.mockReturnValue({
      ...baseContextValue,
      messages: [
        {
          id: "artifact-cproposal1",
          sender: "ai",
          text: "[memory_proposal] Memory 1",
          createdAt: "2026-03-11T00:00:00.000Z",
          context: { page: "overview" },
          artifact: {
            id: "cproposal1",
            type: "memory_proposal",
            status: "proposed",
            title: "Memory 1",
            payload: {},
            version: 1,
          },
        },
        {
          id: "artifact-cproposal2",
          sender: "ai",
          text: "[draft_diff] Draft 2",
          createdAt: "2026-03-11T00:00:01.000Z",
          context: { page: "overview" },
          artifact: {
            id: "cproposal2",
            type: "draft_diff",
            status: "proposed",
            title: "Draft 2",
            payload: { section: "Intro", content: "Body", citations: [], wordCount: 1 },
            version: 1,
          },
        },
      ],
      approveArtifactsBatch,
    });

    render(
      <ProjectCopilotPanel
        page="overview"
        contextDisplay="Overview"
        emptyState={{
          icon: "smart_toy",
          title: "AI Copilot",
          description: "Help text",
          suggestions: [{ label: "Summarize", prompt: "Summarize my project progress" }],
        }}
        inputPlaceholder="Ask..."
      />,
    );

    const lane = document.querySelector('[data-composer-stack-lane="true"]');
    const barText = screen.getByText("2 pending proposals");
    const input = screen.getByTestId("copilot-prefill");

    expect(lane?.contains(barText)).toBe(true);
    expect(lane?.contains(input)).toBe(true);
    expect(barText.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("copilot-attached-stack").textContent).toBe("attached");

    fireEvent.click(screen.getByRole("button", { name: /approve all pending proposals/i }));

    await waitFor(() => {
      expect(approveArtifactsBatch).toHaveBeenCalledWith(
        ["cproposal1", "cproposal2"],
        expect.objectContaining({
          conversationId: undefined,
        }),
      );
    });
  });

  it("keeps side-panel clarification answers provider-owned", async () => {
    mockUseProjectConversation.mockReturnValue({
      ...baseContextValue,
      messages: [
        {
          id: "user-input-1",
          sender: "ai",
          text: "",
          createdAt: "2026-03-11T00:00:00.000Z",
          context: { page: "overview" },
          userInputRequest: {
            callId: "ask-1",
            question: "Which study should I inspect first?",
            questionType: "single_choice",
          },
        },
      ],
    });

    render(
      <ProjectCopilotPanel
        page="overview"
        contextDisplay="Overview"
        emptyState={{
          icon: "smart_toy",
          title: "AI Copilot",
          description: "Help text",
          suggestions: [{ label: "Summarize", prompt: "Summarize my project progress" }],
        }}
        inputPlaceholder="Ask..."
      />,
    );

    const props = mockChatTimeline.mock.calls.at(-1)?.[0] as {
      onAnswerUserInput?: (callId: string, answer: string, page?: "overview", section?: string, resolution?: "answered") => void;
    };
    props.onAnswerUserInput?.("ask-1", "Review the meta-analysis first.", "overview");

    const contextValue = mockUseProjectConversation.mock.results.at(-1)?.value as {
      answerUserInput: ReturnType<typeof vi.fn>;
    };

    expect(contextValue.answerUserInput).toHaveBeenCalledWith(
      "ask-1",
      "Review the meta-analysis first.",
      "overview",
    );
  });

  it("targets reconnect, continue, and stop-and-retry actions to the clicked run", () => {
    render(
      <ProjectCopilotPanel
        page="overview"
        contextDisplay="Overview"
        emptyState={{
          icon: "smart_toy",
          title: "AI Copilot",
          description: "Help text",
          suggestions: [{ label: "Summarize", prompt: "Summarize my project progress" }],
        }}
        inputPlaceholder="Ask..."
      />,
    );

    const props = mockChatTimeline.mock.calls[0]?.[0] as {
      onReconnectRun?: (item: { type: "error"; errorMeta?: { runId?: string | null; activeRunId?: string | null } }) => void;
      onContinueFromDurableStateRun?: (item: { type: "error"; errorMeta?: { runId?: string | null; activeRunId?: string | null } }) => void;
      onStopAndRetryRun?: (item: { type: "error"; errorMeta?: { runId?: string | null; activeRunId?: string | null } }) => void;
    };

    props.onReconnectRun?.({
      type: "error",
      errorMeta: { runId: "run-clicked", activeRunId: "run-newer" },
    });
    props.onContinueFromDurableStateRun?.({
      type: "error",
      errorMeta: { runId: "run-clicked", activeRunId: "run-newer" },
    });
    props.onStopAndRetryRun?.({
      type: "error",
      errorMeta: { runId: "run-clicked", activeRunId: "run-newer" },
    });

    const contextValue = baseContextValue as {
      reconnectRun: ReturnType<typeof vi.fn>;
      sendMessage: ReturnType<typeof vi.fn>;
    };

    expect(contextValue.reconnectRun).toHaveBeenCalledWith("run-clicked");
    expect(contextValue.sendMessage).toHaveBeenCalledWith(
      "Recover this search",
      "overview",
      undefined,
      "gpt-5.2",
      undefined,
      undefined,
      expect.objectContaining({
        source: "retry_action",
      }),
      undefined,
      { replaceRunId: "run-clicked" },
    );
    expect(contextValue.sendMessage).toHaveBeenCalledWith(
      "Recover this search",
      "overview",
      undefined,
      "gpt-5.2",
      undefined,
      undefined,
      undefined,
      undefined,
      {
        replaceRunId: "run-clicked",
        continueFromRunId: "run-clicked",
        suppressUserMessageAppend: true,
      },
    );
  });

  it("renders a queued follow-up cap between live progress and the composer", () => {
    mockUseProjectConversation.mockReturnValue({
      ...baseContextValue,
      queuedFollowUp: {
        id: "queue-1",
        text: "Review the strongest recovery option once this finishes.",
        createdAt: Date.now(),
        conversationId: "conv-1",
        page: "overview",
        source: "draft",
      },
      clearQueuedFollowUp: vi.fn(),
    });

    render(
      <ProjectCopilotPanel
        page="overview"
        contextDisplay="Overview"
        emptyState={{
          icon: "smart_toy",
          title: "AI Copilot",
          description: "Help text",
          suggestions: [{ label: "Summarize", prompt: "Summarize my project progress" }],
        }}
        inputPlaceholder="Ask..."
      />,
    );

    const progress = screen.getByText("Reviewing PubMed results").closest("[data-stack-position]");
    const queued = screen.getByText("Queued next message").closest("[data-stack-position]");
    const input = screen.getByTestId("copilot-prefill");
    const lane = document.querySelector('[data-composer-stack-lane="true"]');

    expect(screen.getByText("Review the strongest recovery option once this finishes.")).toBeTruthy();
    expect(lane?.contains(progress!)).toBe(true);
    expect(lane?.contains(queued!)).toBe(true);
    expect(lane?.contains(input)).toBe(true);
    expect(progress?.getAttribute("data-stack-position")).toBe("top");
    expect(queued?.getAttribute("data-stack-position")).toBe("middle");
    expect(screen.getByTestId("copilot-attached-stack").textContent).toBe("attached");
    expect(progress).toBeTruthy();
    expect(queued).toBeTruthy();
    expect(progress!.compareDocumentPosition(queued!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(queued!.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the composer standalone when no attached caps are present", () => {
    mockUseProjectConversation.mockReturnValue({
      ...baseContextValue,
      messages: [],
    });

    render(
      <ProjectCopilotPanel
        page="overview"
        contextDisplay="Overview"
        emptyState={{
          icon: "smart_toy",
          title: "AI Copilot",
          description: "Help text",
          suggestions: [{ label: "Summarize", prompt: "Summarize my project progress" }],
        }}
        inputPlaceholder="Ask..."
      />,
    );

    const lane = document.querySelector('[data-composer-stack-lane="true"]');
    expect(lane?.contains(screen.getByTestId("copilot-prefill"))).toBe(true);
    expect(screen.getByTestId("copilot-attached-stack").textContent).toBe("none");
    expect(screen.queryByText("Queued next message")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("notifies for newly auto-applied study updates on the study page without toast-primary undo", async () => {
    const initialContextValue = {
      ...baseContextValue,
      messages: [] as unknown[],
    };
    mockUseProjectConversation.mockReturnValue(initialContextValue);

    const { rerender } = render(
      <ProjectCopilotPanel
        page="study"
        studyId="study-1"
        contextDisplay="Study"
        emptyState={{
          icon: "smart_toy",
          title: "AI Copilot",
          description: "Help text",
          suggestions: [{ label: "Summarize", prompt: "Summarize my project progress" }],
        }}
        inputPlaceholder="Ask..."
      />,
    );

    mockUseProjectConversation.mockReturnValue({
      ...baseContextValue,
      messages: [
        {
          id: "artifact-msg-1",
          sender: "ai",
          text: "[study_update] Study metadata update",
          createdAt: "2026-03-17T10:00:00.000Z",
          context: { page: "study" },
          artifact: {
            id: "artifact-study-1",
            type: "study_update",
            status: "auto_applied",
            title: "Study metadata update",
            version: 1,
            payload: {
              studyId: "study-1",
              studyTitle: "Example Study",
              snapshotAt: "2026-03-17T10:00:00.000Z",
              idempotencyKey: "idempotency-key",
              patch: { details: { abstract: "Updated abstract", aiSummary: "Updated summary" } },
              changes: [
                {
                  field: "details.abstract",
                  label: "Abstract",
                  operation: "set",
                  typedOldValue: "Old abstract",
                  typedNewValue: "Updated abstract",
                  displayOld: "Old abstract",
                  displayNew: "Updated abstract",
                },
                {
                  field: "details.aiSummary",
                  label: "AI Summary",
                  operation: "set",
                  typedOldValue: "Old summary",
                  typedNewValue: "Updated summary",
                  displayOld: "Old summary",
                  displayNew: "Updated summary",
                },
              ],
              rationale: "User asked",
            },
          },
        },
      ],
    });

    rerender(
      <ProjectCopilotPanel
        page="study"
        studyId="study-1"
        contextDisplay="Study"
        emptyState={{
          icon: "smart_toy",
          title: "AI Copilot",
          description: "Help text",
          suggestions: [{ label: "Summarize", prompt: "Summarize my project progress" }],
        }}
        inputPlaceholder="Ask..."
      />,
    );

    await waitFor(() => {
      expect(mockNotify).toHaveBeenCalledWith("success", expect.stringContaining("Updated study:"));
    });
    expect(mockNotify.mock.calls[0]?.[2]).toBeUndefined();
  });
});
