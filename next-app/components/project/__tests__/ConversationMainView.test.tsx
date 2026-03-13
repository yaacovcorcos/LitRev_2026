// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationMainView } from "../ConversationMainView";

const { mockUseProjectCopilot, mockTimelineRenderer } = vi.hoisted(() => ({
  mockUseProjectCopilot: vi.fn(),
  mockTimelineRenderer: vi.fn(),
}));

vi.mock("@/contexts/ProjectCopilotContext", () => ({
  useProjectCopilot: mockUseProjectCopilot,
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
  CopilotInput: () => <div data-testid="copilot-input" />,
}));

vi.mock("../../copilot/AutonomySettings", () => ({
  AutonomySettings: () => <div data-testid="autonomy-settings" />,
}));

vi.mock("../../ui/ConversationPicker", () => ({
  ConversationPicker: ({ children }: { children?: ReactNode }) => <div data-testid="conversation-picker">{children}</div>,
}));

describe("ConversationMainView parity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const sendMessage = vi.fn();
    const reconnectRun = vi.fn();
    mockUseProjectCopilot.mockReturnValue({
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
    });
  });

  it("passes structured timeline-capable messages through to the shared renderer unchanged", () => {
    render(<ConversationMainView projectId="project-1" />);

    expect(screen.getByTestId("timeline-renderer")).toBeTruthy();
    const status = screen.getByRole("status");
    const input = screen.getByTestId("copilot-input");
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

  it("targets reconnect and stop-and-retry actions to the clicked run", () => {
    render(<ConversationMainView projectId="project-1" />);

    const props = mockTimelineRenderer.mock.calls[0]?.[0] as {
      onReconnectRun?: (item: { type: "error"; errorMeta?: { runId?: string | null; activeRunId?: string | null } }) => void;
      onStopAndRetryRun?: (item: { type: "error"; errorMeta?: { runId?: string | null; activeRunId?: string | null } }) => void;
    };

    props.onReconnectRun?.({
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
  });
});
