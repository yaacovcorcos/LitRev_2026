// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
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

  it("shows failed-after timing for failed tool runs", () => {
    renderTimeline([
      {
        type: "tool_activity",
        id: "tool-3",
        callId: "call-3",
        toolName: "extract_pdf",
        status: "failed",
        summary: "PDF parsing failed.",
        startedAt: "2026-03-02T12:20:00.000Z",
        updatedAt: "2026-03-02T12:20:03.000Z",
        completedAt: "2026-03-02T12:20:03.000Z",
        createdAt: "2026-03-02T12:20:00.000Z",
      },
    ]);

    expect(screen.getByText("extract_pdf")).not.toBeNull();
    expect(screen.getByText("Failed")).not.toBeNull();
    expect(screen.getByText("Failed after 3.0s")).not.toBeNull();
    expect(screen.getByText("PDF parsing failed.")).not.toBeNull();
  });

  it("groups adjacent PubMed searches into one compact search sequence card", () => {
    renderTimeline([
      {
        type: "tool_activity",
        id: "pubmed-1",
        callId: "call-pubmed-1",
        toolName: "search_pubmed",
        status: "done",
        queryPreview: "\"retrospective cohort\" disposition decision",
        returnedCount: 10,
        totalResults: 42,
        startedAt: "2026-03-02T12:00:00.000Z",
        updatedAt: "2026-03-02T12:00:02.000Z",
        completedAt: "2026-03-02T12:00:02.000Z",
        createdAt: "2026-03-02T12:00:00.000Z",
      },
      {
        type: "tool_activity",
        id: "pubmed-2",
        callId: "call-pubmed-2",
        toolName: "search_pubmed",
        status: "done",
        queryPreview: "\"retrospective cohort\" disposition decision physicians llm",
        returnedCount: 6,
        totalResults: 18,
        startedAt: "2026-03-02T12:00:03.000Z",
        updatedAt: "2026-03-02T12:00:05.000Z",
        completedAt: "2026-03-02T12:00:05.000Z",
        createdAt: "2026-03-02T12:00:03.000Z",
      },
      {
        type: "tool_activity",
        id: "pubmed-3",
        callId: "call-pubmed-3",
        toolName: "search_pubmed",
        status: "done",
        queryPreview: "\"retrospective cohort\" disposition decision physicians llm admission discharge",
        returnedCount: 4,
        totalResults: 9,
        startedAt: "2026-03-02T12:00:06.000Z",
        updatedAt: "2026-03-02T12:00:08.000Z",
        completedAt: "2026-03-02T12:00:08.000Z",
        createdAt: "2026-03-02T12:00:06.000Z",
      },
    ]);

    expect(screen.getByText("PubMed search")).not.toBeNull();
    expect(screen.getByText("3 searches")).not.toBeNull();
    expect(screen.getByText("The search is narrowing toward a smaller result set.")).not.toBeNull();
    expect(screen.queryByText("search_pubmed")).toBeNull();
    expect(screen.queryByText("1.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand PubMed search sequence" }));

    expect(screen.getByText("1.")).not.toBeNull();
    expect(screen.getByText("10 of 42 results")).not.toBeNull();
    expect(screen.getByText("6 of 18 results")).not.toBeNull();
    expect(screen.getByText("4 of 9 results")).not.toBeNull();
  });

  it("omits the grouped PubMed annotation when the refinement signal is weak", () => {
    renderTimeline([
      {
        type: "tool_activity",
        id: "pubmed-same-1",
        callId: "call-pubmed-same-1",
        toolName: "search_pubmed",
        status: "done",
        queryPreview: "\"retrospective cohort\" disposition decision",
        returnedCount: 10,
        totalResults: 42,
        startedAt: "2026-03-02T12:00:00.000Z",
        updatedAt: "2026-03-02T12:00:02.000Z",
        completedAt: "2026-03-02T12:00:02.000Z",
        createdAt: "2026-03-02T12:00:00.000Z",
      },
      {
        type: "tool_activity",
        id: "pubmed-same-2",
        callId: "call-pubmed-same-2",
        toolName: "search_pubmed",
        status: "done",
        queryPreview: "\"retrospective cohort\" disposition decision",
        returnedCount: 10,
        totalResults: 42,
        startedAt: "2026-03-02T12:00:03.000Z",
        updatedAt: "2026-03-02T12:00:05.000Z",
        completedAt: "2026-03-02T12:00:05.000Z",
        createdAt: "2026-03-02T12:00:03.000Z",
      },
    ]);

    expect(screen.getByText("PubMed search")).not.toBeNull();
    expect(screen.getByText("2 searches")).not.toBeNull();
    expect(screen.queryByText("The search is narrowing toward a smaller result set.")).toBeNull();
    expect(screen.queryByText("The search is broadening to explore a larger result set.")).toBeNull();
    expect(screen.queryByText("The search is still broad and is being refined further.")).toBeNull();
    expect(screen.queryByText("Multiple PubMed searches were used to refine the result set.")).toBeNull();
  });

  it("humanizes a single PubMed receipt without grouping", () => {
    renderTimeline([
      {
        type: "tool_activity",
        id: "pubmed-single",
        callId: "call-pubmed-single",
        toolName: "search_pubmed",
        status: "done",
        queryPreview: "\"retrospective cohort\" disposition decision",
        returnedCount: 10,
        totalResults: 42,
        startedAt: "2026-03-02T12:00:00.000Z",
        updatedAt: "2026-03-02T12:00:02.000Z",
        completedAt: "2026-03-02T12:00:02.000Z",
        createdAt: "2026-03-02T12:00:00.000Z",
      },
    ]);

    expect(screen.getByText("PubMed search")).not.toBeNull();
    expect(screen.getByText("10 of 42 results")).not.toBeNull();
    expect(screen.queryByText("search_pubmed")).toBeNull();
  });
});
