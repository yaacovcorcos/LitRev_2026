// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CopilotMessage } from "@/lib/projectCopilotStorage";
import type { TimelineItem } from "@/types/timeline";
import artifactStyles from "@/styles/artifacts.module.css";
import { TimelineRenderer } from "../TimelineRenderer";

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

function renderTimeline(items?: TimelineItem[], messages?: CopilotMessage[], isLoading = false) {
  return render(
    <TimelineRenderer
      items={items}
      messages={messages}
      isLoading={isLoading}
      emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
      onSuggestionClick={vi.fn()}
    />,
  );
}

describe("TimelineRenderer execution trace collapse", () => {
  it("renders an open live process details group before the final assistant answer exists", () => {
    renderTimeline([
      {
        type: "user_message",
        id: "user-1",
        content: "Find strong PubMed studies.",
        createdAt: "2026-03-11T00:00:00.000Z",
      },
      {
        type: "tool_activity",
        id: "tool-live-1",
        callId: "call-live-1",
        toolName: "search_pubmed",
        status: "done",
        summary: "Found 10 of 10 PubMed results.",
        startedAt: "2026-03-11T00:00:01.000Z",
        updatedAt: "2026-03-11T00:00:02.000Z",
        completedAt: "2026-03-11T00:00:02.000Z",
        createdAt: "2026-03-11T00:00:01.000Z",
      },
      {
        type: "checkpoint",
        id: "checkpoint-live-1",
        label: "PubMed returned 10 results and the strongest matches are being reviewed now for relevance and outcome fit.",
        createdAt: "2026-03-11T00:00:03.000Z",
      },
    ]);

    expect(screen.queryByRole("button", { name: "Show process details" })).toBeNull();
    expect(screen.getByLabelText("Process details")).not.toBeNull();
    expect(screen.getByText("Found 10 of 10 PubMed results.")).not.toBeNull();
    expect(screen.getByText("PubMed returned 10 results and the strongest matches are being reviewed now for relevance and outcome fit.")).not.toBeNull();
  });

  it("renders a collapsed process summary above the final assistant answer", () => {
    renderTimeline([
      {
        type: "tool_activity",
        id: "tool-1",
        callId: "call-1",
        toolName: "search_pubmed",
        status: "done",
        summary: "Found 10 of 10 PubMed results.",
        startedAt: "2026-03-11T00:00:00.000Z",
        updatedAt: "2026-03-11T00:00:02.000Z",
        completedAt: "2026-03-11T00:00:02.000Z",
        createdAt: "2026-03-11T00:00:00.000Z",
      },
      {
        type: "checkpoint",
        id: "checkpoint-1",
        label: "PubMed returned 10 results.",
        createdAt: "2026-03-11T00:00:03.000Z",
      },
      {
        type: "assistant_message",
        id: "assistant-1",
        content: "I found 10 strong studies on this topic.",
        createdAt: "2026-03-11T00:00:04.000Z",
      },
    ]);

    const summaryButton = screen.getByRole("button", { name: "Show process details" });
    expect(summaryButton.textContent).toContain("Process details");
    expect(summaryButton.textContent).toContain("1 tool step, 1 checkpoint");
    expect(screen.getByText("I found 10 strong studies on this topic.")).not.toBeNull();
    expect(screen.queryByText("Found 10 of 10 PubMed results.")).toBeNull();

    const processIndex = document.body.textContent?.indexOf("Process details") ?? -1;
    const answerIndex = document.body.textContent?.indexOf("I found 10 strong studies on this topic.") ?? -1;
    expect(processIndex).toBeGreaterThanOrEqual(0);
    expect(answerIndex).toBeGreaterThan(processIndex);
  });

  it("ignores progress for grouping and keeps it visible outside the collapsed trace", () => {
    renderTimeline([
      {
        type: "tool_activity",
        id: "tool-2",
        callId: "call-2",
        toolName: "search_pubmed",
        status: "done",
        summary: "Found 8 of 18 PubMed results.",
        startedAt: "2026-03-11T00:00:00.000Z",
        updatedAt: "2026-03-11T00:00:02.000Z",
        completedAt: "2026-03-11T00:00:02.000Z",
        createdAt: "2026-03-11T00:00:00.000Z",
      },
      {
        type: "progress",
        id: "progress-1",
        message: "Reviewing PubMed results",
      },
      {
        type: "assistant_message",
        id: "assistant-2",
        content: "I’m reviewing the strongest matches now.",
        createdAt: "2026-03-11T00:00:03.000Z",
      },
    ]);

    expect(screen.getByRole("button", { name: "Show process details" })).not.toBeNull();
    expect(screen.getByText("Reviewing PubMed results")).not.toBeNull();
    expect(screen.queryByText("Found 8 of 18 PubMed results.")).toBeNull();
  });

  it("keeps proposed artifacts inline after the assistant answer instead of moving them into process details", () => {
    renderTimeline([
      {
        type: "artifact",
        id: "artifact-1",
        artifactId: "artifact-1",
        artifactType: "protocol_suggestion",
        status: "proposed",
        title: "Protocol update",
        payload: {
          field: "Population",
          value: "Adults with chest pain",
          rationale: "Tighten the inclusion criteria",
        },
        version: 1,
        createdAt: "2026-03-11T00:00:00.000Z",
      },
      {
        type: "assistant_message",
        id: "assistant-3",
        content: "I drafted a protocol refinement for review.",
        createdAt: "2026-03-11T00:00:01.000Z",
      },
    ]);

    expect(screen.queryByRole("button", { name: "Show process details" })).toBeNull();
    expect(screen.getByText("Protocol update")).not.toBeNull();
    expect(screen.getByText("Adults with chest pain")).not.toBeNull();
    expect(screen.getByRole("button", { name: /accept & save to protocol/i })).not.toBeNull();
  });

  it("expands and collapses settled trace details manually", () => {
    renderTimeline([
      {
        type: "artifact",
        id: "artifact-settled-1",
        artifactId: "artifact-settled-1",
        artifactType: "protocol_suggestion",
        status: "accepted",
        title: "Protocol update",
        payload: {
          field: "Population",
          value: "Adults with chest pain",
          rationale: "Tighten the inclusion criteria",
        },
        version: 1,
        createdAt: "2026-03-11T00:00:00.000Z",
      },
      {
        type: "assistant_message",
        id: "assistant-settled-1",
        content: "I already applied the protocol refinement.",
        createdAt: "2026-03-11T00:00:01.000Z",
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Show process details" }));
    expect(screen.getByLabelText("Process details")).not.toBeNull();
    expect(screen.getByText("Protocol updated: Population")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    expect(screen.getByText("Protocol update")).not.toBeNull();
    expect(screen.getByText("Adults with chest pain")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Hide process details" }));
    expect(screen.queryByLabelText("Process details")).toBeNull();
  });

  it("renders grouped checkpoints without the standalone divider lines inside process details", () => {
    const { container } = renderTimeline([
      {
        type: "tool_activity",
        id: "tool-standalone-checkpoint-1",
        callId: "call-standalone-checkpoint-1",
        toolName: "search_pubmed",
        status: "done",
        summary: "Found 10 of 10 PubMed results.",
        startedAt: "2026-03-11T00:00:00.000Z",
        updatedAt: "2026-03-11T00:00:02.000Z",
        completedAt: "2026-03-11T00:00:02.000Z",
        createdAt: "2026-03-11T00:00:00.000Z",
      },
      {
        type: "checkpoint",
        id: "checkpoint-grouped-1",
        label: "PubMed returned 10 results and the strongest matches are being reviewed now for relevance and outcome fit.",
        createdAt: "2026-03-11T00:00:03.000Z",
      },
      {
        type: "assistant_message",
        id: "assistant-grouped-1",
        content: "I found 10 strong studies on this topic.",
        createdAt: "2026-03-11T00:00:04.000Z",
      },
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Show process details" }));
    const processDetails = screen.getByLabelText("Process details");
    expect(processDetails.textContent).toContain("PubMed returned 10 results");
    expect(processDetails.querySelector(`.${artifactStyles.checkpointLine}`)).toBeNull();
    expect(container.querySelectorAll(`.${artifactStyles.checkpointLine}`)).toHaveLength(0);
  });

  it("keeps ambiguous project-bridge turns fully inline", () => {
    const messages: CopilotMessage[] = [
      {
        id: "tool-message",
        sender: "ai",
        text: "",
        createdAt: "2026-03-11T00:00:00.000Z",
        toolActivity: {
          callId: "call-bridge-1",
          toolName: "search_openalex",
          status: "done",
          summary: "Found 4 of 12 OpenAlex results.",
          startedAt: "2026-03-11T00:00:00.000Z",
          updatedAt: "2026-03-11T00:00:01.000Z",
          completedAt: "2026-03-11T00:00:01.000Z",
        },
      },
      {
        id: "assistant-message",
        sender: "ai",
        text: "I found several relevant OpenAlex papers.",
        createdAt: "2026-03-11T00:00:02.000Z",
      },
      {
        id: "ask-bridge",
        sender: "ai",
        text: "",
        createdAt: "2026-03-11T00:00:03.000Z",
        userInputRequest: {
          callId: "ask-bridge-call",
          question: "Which paper should I inspect first?",
          questionType: "single_choice",
          answered: false,
        },
      },
    ];

    renderTimeline(undefined, messages);

    expect(screen.queryByRole("button", { name: "Show process details" })).toBeNull();
    expect(screen.getByText("Found 4 of 12 OpenAlex results.")).not.toBeNull();
    expect(screen.getByText("Which paper should I inspect first?")).not.toBeNull();
  });
});
