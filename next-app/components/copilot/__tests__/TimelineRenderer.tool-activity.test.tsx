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
  it("prefers semantic receipt fields when present", () => {
    renderTimeline([
      {
        type: "tool_activity",
        id: "tool-semantic-1",
        callId: "call-semantic-1",
        toolName: "delegate_search",
        status: "done",
        displayLabel: "Delegated search",
        inputPreview: "Find recent omega-3 cognition trials",
        outcomeSummary: "Queued PubMed and OpenAlex searches and shortlisted 4 studies.",
        sourceBadge: "Search agent",
        detailItems: ["3 delegated tool calls", "Stop reason: completed"],
        summary: "older fallback summary",
        startedAt: "2026-03-02T12:00:00.000Z",
        updatedAt: "2026-03-02T12:00:02.000Z",
        completedAt: "2026-03-02T12:00:02.000Z",
        createdAt: "2026-03-02T12:00:00.000Z",
      },
    ]);

    expect(screen.getByText("Delegated search")).not.toBeNull();
    expect(screen.getByText("Search agent")).not.toBeNull();
    expect(screen.getByText("Find recent omega-3 cognition trials")).not.toBeNull();
    expect(screen.getByText("3 delegated tool calls")).not.toBeNull();
    expect(screen.getByText("Stop reason: completed")).not.toBeNull();
    expect(screen.getAllByText("Queued PubMed and OpenAlex searches and shortlisted 4 studies.").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("older fallback summary")).toBeNull();
  });

  it("shows completion duration for finished tool runs", () => {
    renderTimeline([
      {
        type: "tool_activity",
        id: "tool-1",
        callId: "call-1",
        toolName: "search_openalex",
        status: "done",
        summary: "Found 5 of 18 OpenAlex results.",
        queryPreview: "\"retrospective cohort\" AND disposition decision",
        returnedCount: 5,
        totalResults: 18,
        resultIdentifiers: ["DOI 10.1000/example", "OpenAlex W123"],
        startedAt: "2026-03-02T12:00:00.000Z",
        updatedAt: "2026-03-02T12:00:02.000Z",
        completedAt: "2026-03-02T12:00:02.000Z",
        createdAt: "2026-03-02T12:00:00.000Z",
      },
    ]);

    expect(screen.getByText("OpenAlex")).not.toBeNull();
    expect(screen.getByText("Done")).not.toBeNull();
    expect(screen.getByText("Completed in 2.0s")).not.toBeNull();
    expect(screen.getByText("\"retrospective cohort\" AND disposition decision")).not.toBeNull();
    expect(screen.getByText("5 of 18 results")).not.toBeNull();
    expect(screen.getByText("DOI 10.1000/example · OpenAlex W123")).not.toBeNull();
    expect(screen.getAllByText("Found 5 of 18 OpenAlex results.").length).toBeGreaterThanOrEqual(1);
  });

  it("uses returned-only wording when total results are unknown", () => {
    renderTimeline([
      {
        type: "tool_activity",
        id: "tool-returned-only",
        callId: "call-returned-only",
        toolName: "search_openalex",
        status: "done",
        summary: "Returned 5 OpenAlex results.",
        queryPreview: "\"retrospective cohort\" AND disposition decision",
        returnedCount: 5,
        resultIdentifiers: ["DOI 10.1000/example", "OpenAlex W123"],
        startedAt: "2026-03-02T12:00:00.000Z",
        updatedAt: "2026-03-02T12:00:02.000Z",
        completedAt: "2026-03-02T12:00:02.000Z",
        createdAt: "2026-03-02T12:00:00.000Z",
      },
    ]);

    expect(screen.getByText("OpenAlex")).not.toBeNull();
    expect(screen.getByText("Returned 5 results")).not.toBeNull();
    expect(screen.getByText("DOI 10.1000/example · OpenAlex W123")).not.toBeNull();
    expect(screen.getAllByText("Returned 5 OpenAlex results.").length).toBeGreaterThanOrEqual(1);
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
    expect(screen.getAllByText("PDF parsing failed.").length).toBeGreaterThanOrEqual(1);
  });

  it("groups adjacent PubMed searches into one compact search sequence card", () => {
    renderTimeline([
      {
        type: "tool_activity",
        id: "pubmed-1",
        callId: "call-pubmed-1",
        toolName: "search_pubmed",
        status: "done",
        summary: "Found 10 of 42 PubMed results.",
        queryPreview: "\"retrospective cohort\" disposition decision",
        returnedCount: 10,
        totalResults: 42,
        resultIdentifiers: ["PMID 40123456", "PMID 39887711"],
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
        summary: "Found 6 of 18 PubMed results.",
        queryPreview: "\"retrospective cohort\" disposition decision physicians llm",
        returnedCount: 6,
        totalResults: 18,
        resultIdentifiers: ["PMID 39887711", "PMID 38990000"],
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
        summary: "Found 4 of 9 PubMed results.",
        queryPreview: "\"retrospective cohort\" disposition decision physicians llm admission discharge",
        returnedCount: 4,
        totalResults: 9,
        resultIdentifiers: ["PMID 38990000", "PMID 37770000"],
        startedAt: "2026-03-02T12:00:06.000Z",
        updatedAt: "2026-03-02T12:00:08.000Z",
        completedAt: "2026-03-02T12:00:08.000Z",
        createdAt: "2026-03-02T12:00:06.000Z",
      },
    ]);

    expect(screen.getByText("PubMed")).not.toBeNull();
    expect(screen.getByText("3 searches")).not.toBeNull();
    expect(screen.getByText("The search is narrowing toward a smaller total result set.")).not.toBeNull();
    expect(screen.queryByText("search_pubmed")).toBeNull();
    expect(screen.queryByText("1.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand PubMed search sequence" }));

    expect(screen.getByText("1.")).not.toBeNull();
    expect(screen.getByText("10 of 42 results")).not.toBeNull();
    expect(screen.getByText("6 of 18 results")).not.toBeNull();
    expect(screen.getByText("4 of 9 results")).not.toBeNull();
    expect(screen.getAllByText("Found 10 of 42 PubMed results.").length).toBeGreaterThanOrEqual(1);
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

    expect(screen.getByText("PubMed")).not.toBeNull();
    expect(screen.getByText("2 searches")).not.toBeNull();
    expect(screen.queryByText("The search is narrowing toward a smaller total result set.")).toBeNull();
    expect(screen.queryByText("The search is broadening to explore a larger total result set.")).toBeNull();
    expect(screen.queryByText("The total result set is still broad and is being refined further.")).toBeNull();
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
        summary: "Found 10 of 42 PubMed results.",
        queryPreview: "\"retrospective cohort\" disposition decision",
        returnedCount: 10,
        totalResults: 42,
        resultIdentifiers: ["PMID 40123456", "PMID 39887711"],
        startedAt: "2026-03-02T12:00:00.000Z",
        updatedAt: "2026-03-02T12:00:02.000Z",
        completedAt: "2026-03-02T12:00:02.000Z",
        createdAt: "2026-03-02T12:00:00.000Z",
      },
    ]);

    expect(screen.getByText("PubMed")).not.toBeNull();
    expect(screen.getByText("10 of 42 results")).not.toBeNull();
    expect(screen.getByText("PMID 40123456 · PMID 39887711")).not.toBeNull();
    expect(screen.getAllByText("Found 10 of 42 PubMed results.").length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("search_pubmed")).toBeNull();
  });
});
