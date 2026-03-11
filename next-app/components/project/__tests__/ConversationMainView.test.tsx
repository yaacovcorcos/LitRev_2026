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
    mockUseProjectCopilot.mockReturnValue({
      messages: [
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
          checkpoint: { label: "PubMed returned 18 results. Reviewing the strongest matches now." },
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
      sendMessage: vi.fn(),
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
    expect(screen.getByText("Waiting for your answer")).toBeTruthy();
    expect(mockTimelineRenderer).toHaveBeenCalledTimes(1);
    const props = mockTimelineRenderer.mock.calls[0]?.[0] as { messages: unknown[]; suppressedProgressId?: string | null };
    expect(props.messages).toHaveLength(4);
    expect(props.messages).toEqual(mockUseProjectCopilot.mock.results[0]?.value.messages);
    expect(props.suppressedProgressId).toBe("progress-1");
  });
});
