// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimelineRenderer } from "../TimelineRenderer";
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

function renderTimeline(items: TimelineItem[]) {
  render(
    <TimelineRenderer
      items={items}
      isLoading={false}
      emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
      onSuggestionClick={vi.fn()}
    />
  );
}

describe("TimelineRenderer tool activity cards", () => {
  it("shows completion duration for finished tool runs", () => {
    renderTimeline([
      {
        type: "tool_activity",
        id: "tool-1",
        callId: "call-1",
        toolName: "search_openalex",
        status: "done",
        summary: "Fetched 42 studies.",
        startedAt: "2026-03-02T12:00:00.000Z",
        updatedAt: "2026-03-02T12:00:02.000Z",
        completedAt: "2026-03-02T12:00:02.000Z",
        createdAt: "2026-03-02T12:00:00.000Z",
      },
    ]);

    expect(screen.getByText("search_openalex")).not.toBeNull();
    expect(screen.getByText("Done")).not.toBeNull();
    expect(screen.getByText("Completed in 2.0s")).not.toBeNull();
    expect(screen.getByText("Fetched 42 studies.")).not.toBeNull();
  });

  it("shows in-progress timing for running tools", () => {
    renderTimeline([
      {
        type: "tool_activity",
        id: "tool-2",
        callId: "call-2",
        toolName: "extract_pdf",
        status: "running",
        startedAt: "2026-03-02T12:10:00.000Z",
        updatedAt: "2026-03-02T12:10:01.000Z",
        createdAt: "2026-03-02T12:10:00.000Z",
      },
    ]);

    expect(screen.getByText("extract_pdf")).not.toBeNull();
    expect(screen.getByText("Running")).not.toBeNull();
    expect(screen.getByText("In progress")).not.toBeNull();
  });
});
