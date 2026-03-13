// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectCopilot } from "../ProjectCopilot";

const { mockUseProjectCopilot } = vi.hoisted(() => ({
  mockUseProjectCopilot: vi.fn(),
}));

vi.mock("@/contexts/ProjectCopilotContext", () => ({
  useProjectCopilot: mockUseProjectCopilot,
}));

vi.mock("@/app/actions/notes", () => ({
  createNoteAction: vi.fn(),
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

const { mockTimelineRenderer } = vi.hoisted(() => ({
  mockTimelineRenderer: vi.fn(),
}));

vi.mock("../copilot/TimelineRenderer", () => ({
  TimelineRenderer: (props: { onSuggestionClick: (prompt: string) => void }) => {
    mockTimelineRenderer(props);
    return (
    <button
      type="button"
      data-testid="panel-suggestion"
      onClick={() => props.onSuggestionClick("Summarize my project progress")}
    >
      Suggest
    </button>
    );
  },
}));

vi.mock("../copilot/CopilotInput", () => ({
  CopilotInput: ({
    prefillCommand,
    onPrefillConsumed,
  }: {
    prefillCommand?: { text: string; id: string } | null;
    onPrefillConsumed?: () => void;
  }) => (
    <div>
      <div data-testid="copilot-prefill">{prefillCommand?.text ?? ""}</div>
      <button type="button" data-testid="consume-prefill" onClick={() => onPrefillConsumed?.()}>
        Consume
      </button>
    </div>
  ),
}));

vi.mock("../copilot/AutonomySettings", () => ({
  AutonomySettings: () => null,
}));

describe("ProjectCopilot suggestion wiring", () => {
  beforeEach(() => {
    mockUseProjectCopilot.mockReturnValue({
      messages: [
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
      sendMessage: vi.fn(),
      handleReviewArtifact: vi.fn(),
      executePlan: vi.fn(),
      shouldOfferSummary: false,
      summarizeAndRefresh: vi.fn(),
      isSummarizing: false,
      setShowAutonomySettings: vi.fn(),
      prefillCommand: null,
      consumePrefillCommand: vi.fn(),
    });
    mockTimelineRenderer.mockReset();
  });

  it("prefills panel input when empty-state suggestion is clicked", async () => {
    render(
      <ProjectCopilot
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
      <ProjectCopilot
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
    expect(screen.getByText("Reviewing PubMed results")).toBeTruthy();
    expect(screen.getByText("2 of 3")).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(status.compareDocumentPosition(input) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const props = mockTimelineRenderer.mock.calls[0]?.[0] as { suppressedProgressId?: string | null };
    expect(props.suppressedProgressId).toBe("progress-1");
  });
});
