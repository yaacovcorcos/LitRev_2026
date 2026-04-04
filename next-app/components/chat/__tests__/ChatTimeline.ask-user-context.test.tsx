// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChatTimeline } from "../ChatTimeline";
import type { TimelineItem } from "@/types/timeline";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "project-1" }),
}));

vi.mock("@/app/actions/ledger", () => ({
  addMentionedStudyAction: vi.fn(async () => ({ created: true, study: { id: "s1" } })),
}));

vi.mock("@/lib/agent/feature-flags", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agent/feature-flags")>("@/lib/agent/feature-flags");
  return {
    ...actual,
    isChatStudyMentionsEnabled: () => false,
  };
});

describe("ChatTimeline ask-user callbacks", () => {
  it("propagates page/section context on answer", () => {
    const onAnswerUserInput = vi.fn();
    const items: TimelineItem[] = [
      {
        type: "user_input_request",
        id: "ask-item-1",
        callId: "ask-1",
        page: "protocol",
        section: "inclusion",
        question: "Continue with strict criteria?",
        questionType: "yes_no",
        options: [
          { label: "Yes", description: "Proceed with strict filtering." },
          { label: "No", description: "Use broader filtering." },
        ],
        answered: false,
        createdAt: "2026-03-02T00:00:00.000Z",
      },
    ];

    render(
      <ChatTimeline
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
        onAnswerUserInput={onAnswerUserInput}
      />,
    );

    fireEvent.click(screen.getByText("Yes"));
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));

    expect(onAnswerUserInput).toHaveBeenCalledWith(
      "ask-1",
      "Yes",
      "protocol",
      "inclusion",
      "answered",
    );
  });

  it("sends the explicit cancelled resolution via timeline card", () => {
    const onAnswerUserInput = vi.fn();
    const items: TimelineItem[] = [
      {
        type: "user_input_request",
        id: "ask-item-2",
        callId: "ask-2",
        page: "draft",
        section: "discussion",
        question: "Need your input before proceeding",
        questionType: "yes_no",
        header: "Decision",
        options: [
          { label: "Continue", description: "Proceed immediately." },
          { label: "Pause", description: "Stop and review." },
        ],
        answered: false,
        createdAt: "2026-03-02T00:01:00.000Z",
      },
    ];

    render(
      <ChatTimeline
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
        onAnswerUserInput={onAnswerUserInput}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));

    expect(onAnswerUserInput).toHaveBeenCalledWith(
      "ask-2",
      "Cancelled by the user.",
      "draft",
      "discussion",
      "cancelled",
    );
  });
});
