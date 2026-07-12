// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationMainView } from "../ConversationMainView";

const { mockUseProjectConversation, mockChatTimeline, mockCreateNoteAction } = vi.hoisted(() => ({
  mockUseProjectConversation: vi.fn(),
  mockChatTimeline: vi.fn(),
  mockCreateNoteAction: vi.fn(),
}));

const mockRouterPush = vi.fn();

vi.mock("@/contexts/ProjectConversationContext", () => ({
  useProjectConversation: mockUseProjectConversation,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
  }),
}));

vi.mock("@/hooks/useProjectState", () => ({
  useProjectState: () => ({
    isReady: false,
    snapshot: null,
  }),
}));

vi.mock("@/lib/agent/suggestions", () => ({
  getSuggestions: () => [],
}));

vi.mock("@/app/actions/notes", () => ({
  createNoteAction: (...args: unknown[]) => mockCreateNoteAction(...args),
}));

vi.mock("../../chat/ChatTimeline", () => ({
  ChatTimeline: (props: unknown) => {
    mockChatTimeline(props);
    return <div data-testid="timeline-renderer" />;
  },
}));

vi.mock("../ProjectConversationComposer", () => ({
  ProjectConversationComposer: ({
    hasQueuedFollowUp,
    attachedStack,
    interactionLocked,
  }: {
    hasQueuedFollowUp?: boolean;
    attachedStack?: "none" | "attached";
    interactionLocked?: boolean;
  }) => (
    <div
      data-testid="copilot-input"
      data-has-queued={hasQueuedFollowUp ? "yes" : "no"}
      data-attached-stack={attachedStack ?? "none"}
      data-interaction-locked={interactionLocked ? "yes" : "no"}
    />
  ),
}));

vi.mock("../ProjectConversationAutonomySettings", () => ({
  ProjectConversationAutonomySettings: () => <div data-testid="autonomy-settings" />,
}));

vi.mock("../../ui/ConversationPicker", () => ({
  ConversationPicker: ({ children }: { children?: ReactNode }) => <div data-testid="conversation-picker">{children}</div>,
}));

describe("ConversationMainView parity", () => {
  let baseContextValue: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRouterPush.mockReset();
    mockCreateNoteAction.mockReset();
    const sendMessage = vi.fn();
    const reconnectRun = vi.fn();
    const answerUserInput = vi.fn();
    baseContextValue = {
      reconnectRun,
      messages: [
        {
          id: "user-1",
          sender: "user",
          text: "Recover this search",
          createdAt: "2026-03-09T23:59:59.000Z",
          context: { page: "overview" },
        },
        {
          id: "progress-1",
          sender: "ai",
          text: "",
          createdAt: "2026-03-10T00:00:00.000Z",
          progress: { message: "Waiting for your answer" },
        },
        {
          id: "checkpoint-1",
          sender: "ai",
          text: "",
          createdAt: "2026-03-10T00:00:01.000Z",
          checkpoint: {
            label: "PubMed found 18 total results. Reviewing the strongest matches now.",
            runId: "run-1",
            checkpointKind: "recovery",
          },
        },
        {
          id: "user-input-1",
          sender: "ai",
          text: "",
          createdAt: "2026-03-10T00:00:02.000Z",
          userInputRequest: {
            callId: "ask-1",
            question: "Which study should I inspect first?",
            questionType: "single_choice",
          },
        },
        {
          id: "error-1",
          sender: "ai",
          text: "Protocol update failed validation.",
          createdAt: "2026-03-10T00:00:03.000Z",
          streamError: {
            kind: "tool_schema_validation",
            code: "PROTOCOL_MUTATION_VALIDATION_FAILED",
            retryable: false,
            source: "tool_validator",
            message: "Protocol update failed validation.",
            runId: "run-1",
            recoveryRecommendation: "reconnect",
          },
        },
      ],
      isLoading: false,
      isConversationLoading: false,
      conversations: [],
      currentConversationId: "conv-1",
      queuedFollowUp: null,
      clearQueuedFollowUp: vi.fn(),
      selectConversation: vi.fn(),
      newConversation: vi.fn(),
      branchConversation: vi.fn(),
      deleteConversation: vi.fn(),
      renameConversation: vi.fn(),
      sendMessage,
      handleReviewArtifact: vi.fn(),
      approveArtifactsBatch: vi.fn(),
      executePlan: vi.fn(),
      answerUserInput,
      selectedModel: "gpt-5.6-luna",
      reasoningMode: "full",
      setReasoningMode: vi.fn(),
      reasoningSupport: "explicit",
      reasoningVisibilitySupport: "full",
      hasMore: false,
      isLoadingOlder: false,
      loadOlderMessages: vi.fn(),
    };
    mockUseProjectConversation.mockReturnValue(baseContextValue);
  });

  it("passes normalized timeline items through to the shared renderer", () => {
    render(<ConversationMainView projectId="project-1" />);

    expect(screen.getByTestId("timeline-renderer")).toBeTruthy();
    const status = screen.getByRole("status");
    const input = screen.getByTestId("copilot-input");
    const lane = document.querySelector('[data-composer-stack-lane="true"]');
    expect(lane?.contains(status)).toBe(true);
    expect(lane?.contains(input)).toBe(true);
    expect(status.getAttribute("data-stack-position")).toBe("top");
    expect(input.getAttribute("data-attached-stack")).toBe("attached");
    expect(screen.getByText("Waiting for your answer")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(status.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(mockChatTimeline.mock.calls.length).toBeGreaterThanOrEqual(1);
    const props = mockChatTimeline.mock.calls.at(-1)?.[0] as {
      items: Array<{ type: string; id: string; runId?: string; checkpointKind?: string }>;
      messages?: unknown[];
      suppressedProgressId?: string | null;
      reasoningMode?: string;
    };
    expect(props.items).toHaveLength(5);
    expect(props.messages).toBeUndefined();
    expect(props.suppressedProgressId).toBe("progress-1");
    expect(props.reasoningMode).toBe("full");
    expect(screen.getByRole("button", { name: "Reasoning visibility: full" })).toBeTruthy();
    const checkpoint = props.items.find((item) => item.type === "checkpoint");
    expect(checkpoint).toMatchObject({ id: "checkpoint-1", runId: "run-1", checkpointKind: "recovery" });
  });

  it("targets reconnect, continue, and stop-and-retry actions to the clicked run", () => {
    render(<ConversationMainView projectId="project-1" />);

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

    const contextValue = mockUseProjectConversation.mock.results[0]?.value as {
      reconnectRun: ReturnType<typeof vi.fn>;
      sendMessage: ReturnType<typeof vi.fn>;
    };

    expect(contextValue.reconnectRun).toHaveBeenCalledWith("run-clicked");
    expect(contextValue.sendMessage).toHaveBeenCalledWith(
      "Recover this search",
      "overview",
      undefined,
      "gpt-5.6-luna",
      undefined,
      undefined,
      expect.objectContaining({
        source: "retry_action",
      }),
      undefined,
      {
        replaceRunId: "run-clicked",
        preferContinueFromRunId: "run-clicked",
      },
    );
    expect(contextValue.sendMessage).toHaveBeenCalledWith(
      "Recover this search",
      "overview",
      undefined,
      "gpt-5.6-luna",
      undefined,
      undefined,
      expect.objectContaining({
        source: "retry_action",
      }),
      undefined,
      {
        replaceRunId: "run-clicked",
        continueFromRunId: "run-clicked",
        suppressUserMessageAppend: true,
      },
    );
  });

  it("routes clarification answers back through the provider-owned answer handler", () => {
    render(<ConversationMainView projectId="project-1" />);

    const props = mockChatTimeline.mock.calls[0]?.[0] as {
      onAnswerUserInput?: (callId: string, answer: string, page?: "overview", section?: string, resolution?: "answered") => void;
    };

    props.onAnswerUserInput?.("ask-1", "Start with the strongest RCT", "overview");

    const contextValue = mockUseProjectConversation.mock.results[0]?.value as {
      answerUserInput: ReturnType<typeof vi.fn>;
    };

    expect(contextValue.answerUserInput).toHaveBeenCalledWith(
      "ask-1",
      "Start with the strongest RCT",
      "overview",
    );
  });

  it("rethrows a failed note save from the shell-owned handler instead of swallowing it", async () => {
    mockCreateNoteAction.mockResolvedValue({
      success: false,
      error: "Unable to save note.",
    });

    render(<ConversationMainView projectId="project-1" />);

    const props = mockChatTimeline.mock.calls[0]?.[0] as {
      onSaveToNotes?: (content: string, messageId: string) => Promise<void>;
    };

    await expect(props.onSaveToNotes?.("Summarized answer", "assistant-1")).rejects.toThrow("Unable to save note.");
    expect(mockCreateNoteAction).toHaveBeenCalledWith(
      "project-1",
      "Summarized answer",
      "conversation",
      "conv-1",
      "assistant-1",
    );
  });

  it("renders a queued follow-up cap above the composer when one is present", () => {
    mockUseProjectConversation.mockReturnValue({
      ...baseContextValue,
      messages: [],
      queuedFollowUp: {
        id: "queue-1",
        text: "Please compare the strongest papers next.",
        createdAt: Date.now(),
        conversationId: "conv-1",
        page: "overview",
        model: "gpt-5.6-luna",
        reasoningEffort: "medium",
        deliveryMode: "standard",
        source: "draft",
      },
      clearQueuedFollowUp: vi.fn(),
    });

    render(<ConversationMainView projectId="project-1" />);

    const queued = screen.getByText("Queued next message").closest("[data-stack-position]");
    const input = screen.getByTestId("copilot-input");
    const lane = document.querySelector('[data-composer-stack-lane="true"]');
    expect(screen.getByText("Please compare the strongest papers next.")).toBeTruthy();
    expect(lane?.contains(queued!)).toBe(true);
    expect(lane?.contains(input)).toBe(true);
    expect(queued?.getAttribute("data-stack-position")).toBe("top");
    expect(input.getAttribute("data-attached-stack")).toBe("attached");
    expect(queued).toBeTruthy();
    expect(queued!.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps the composer standalone when no attached caps are present", () => {
    mockUseProjectConversation.mockReturnValue({
      ...baseContextValue,
      messages: [],
    });

    render(<ConversationMainView projectId="project-1" />);

    const lane = document.querySelector('[data-composer-stack-lane="true"]');
    expect(lane?.contains(screen.getByTestId("copilot-input"))).toBe(true);
    expect(screen.getByTestId("copilot-input").getAttribute("data-attached-stack")).toBe("none");
    expect(screen.queryByText("Queued next message")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
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
          createdAt: "2026-03-10T00:00:00.000Z",
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
          createdAt: "2026-03-10T00:00:01.000Z",
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

    render(<ConversationMainView projectId="project-1" />);

    const lane = document.querySelector('[data-composer-stack-lane="true"]');
    const barText = screen.getByText("2 pending proposals");
    const input = screen.getByTestId("copilot-input");

    expect(lane?.contains(barText)).toBe(true);
    expect(lane?.contains(input)).toBe(true);
    expect(barText.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(input.getAttribute("data-attached-stack")).toBe("attached");

    fireEvent.click(screen.getByRole("button", { name: /approve all pending proposals/i }));

    await screen.findByText("All approved.");
    expect(approveArtifactsBatch).toHaveBeenCalledWith(
      ["cproposal1", "cproposal2"],
      expect.objectContaining({
        conversationId: "conv-1",
      }),
    );
  });
});
