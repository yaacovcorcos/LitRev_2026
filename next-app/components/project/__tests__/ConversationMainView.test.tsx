// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationMainView } from "../ConversationMainView";

const { mockUseProjectCopilot, mockTimelineRenderer } = vi.hoisted(() => ({
  mockUseProjectCopilot: vi.fn(),
  mockTimelineRenderer: vi.fn(),
}));

const mockRouterPush = vi.fn();

vi.mock("@/contexts/ProjectCopilotContext", () => ({
  useProjectCopilot: mockUseProjectCopilot,
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
  createNoteAction: vi.fn(),
}));

vi.mock("../../copilot/TimelineRenderer", () => ({
  TimelineRenderer: (props: unknown) => {
    mockTimelineRenderer(props);
    return <div data-testid="timeline-renderer" />;
  },
}));

vi.mock("../../copilot/CopilotInput", () => ({
  CopilotInput: ({
    hasQueuedFollowUp,
    attachedStack,
  }: {
    hasQueuedFollowUp?: boolean;
    attachedStack?: "none" | "attached";
  }) => (
    <div
      data-testid="copilot-input"
      data-has-queued={hasQueuedFollowUp ? "yes" : "no"}
      data-attached-stack={attachedStack ?? "none"}
    />
  ),
}));

vi.mock("../../copilot/AutonomySettings", () => ({
  AutonomySettings: () => <div data-testid="autonomy-settings" />,
}));

vi.mock("../../ui/ConversationPicker", () => ({
  ConversationPicker: ({ children }: { children?: ReactNode }) => <div data-testid="conversation-picker">{children}</div>,
}));

describe("ConversationMainView parity", () => {
  let baseContextValue: Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRouterPush.mockReset();
    const sendMessage = vi.fn();
    const reconnectRun = vi.fn();
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
            label: "PubMed returned 18 results. Reviewing the strongest matches now.",
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
      answerUserInput: vi.fn(),
      selectedModel: "gpt-5.2",
      hasMore: false,
      isLoadingOlder: false,
      loadOlderMessages: vi.fn(),
    };
    mockUseProjectCopilot.mockReturnValue(baseContextValue);
  });

  it("passes structured timeline-capable messages through to the shared renderer unchanged", () => {
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
    expect(mockTimelineRenderer).toHaveBeenCalledTimes(1);
    const props = mockTimelineRenderer.mock.calls[0]?.[0] as { messages: unknown[]; suppressedProgressId?: string | null };
    expect(props.messages).toHaveLength(5);
    expect(props.messages).toEqual(mockUseProjectCopilot.mock.results[0]?.value.messages);
    expect(props.suppressedProgressId).toBe("progress-1");
    const checkpoint = props.messages.find((message) => (message as { checkpoint?: unknown }).checkpoint) as {
      checkpoint?: { runId?: string; checkpointKind?: string };
    };
    expect(checkpoint.checkpoint).toMatchObject({ runId: "run-1", checkpointKind: "recovery" });
  });

  it("targets reconnect, continue, and stop-and-retry actions to the clicked run", () => {
    render(<ConversationMainView projectId="project-1" />);

    const props = mockTimelineRenderer.mock.calls[0]?.[0] as {
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

    const contextValue = mockUseProjectCopilot.mock.results[0]?.value as {
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

  it("renders a queued follow-up cap above the composer when one is present", () => {
    mockUseProjectCopilot.mockReturnValue({
      ...baseContextValue,
      messages: [],
      queuedFollowUp: {
        id: "queue-1",
        text: "Please compare the strongest papers next.",
        createdAt: Date.now(),
        conversationId: "conv-1",
        page: "overview",
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
    mockUseProjectCopilot.mockReturnValue({
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
});
