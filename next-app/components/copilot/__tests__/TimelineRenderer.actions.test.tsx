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

describe("TimelineRenderer action affordances", () => {
  it("does not render unsupported artifact actions as clickable controls", () => {
    const items: TimelineItem[] = [
      {
        type: "artifact",
        id: "a1",
        artifactId: "artifact-study",
        artifactType: "study_proposal",
        status: "proposed",
        title: "Study",
        payload: {
          title: "Example Study",
          authors: "Doe et al.",
          year: 2024,
          source: "semantic_scholar",
          recommendation: "keep",
          confidence: 0.82,
        },
        version: 1,
        createdAt: "2026-02-21T00:00:00.000Z",
      },
      {
        type: "artifact",
        id: "a2",
        artifactId: "artifact-batch",
        artifactType: "screening_batch",
        status: "proposed",
        title: "Batch",
        payload: {
          studies: [
            {
              title: "Study A",
              authors: "Smith",
              year: 2023,
              source: "semantic_scholar",
              recommendation: "keep",
              confidence: 0.7,
            },
          ],
          summary: {
            total: 1,
            keepCount: 1,
            excludeCount: 0,
            maybeCount: 0,
          },
        },
        version: 1,
        createdAt: "2026-02-21T00:01:00.000Z",
      },
      {
        type: "artifact",
        id: "a3",
        artifactId: "artifact-draft",
        artifactType: "draft_diff",
        status: "proposed",
        title: "Draft",
        payload: {
          section: "Introduction",
          content: "Draft text",
          citations: [],
          wordCount: 2,
        },
        version: 1,
        createdAt: "2026-02-21T00:02:00.000Z",
      },
    ];

    render(
      <TimelineRenderer
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
        onReviewArtifact={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /maybe/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /review each/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /redo/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /edit first/i })).toBeNull();

    // Override select must be absent when no override handler is wired.
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("renders retry/resume actions for recoverable error cards", () => {
    const onRetryLastMessage = vi.fn();
    const onResumeRun = vi.fn();
    const items: TimelineItem[] = [
      {
        type: "error",
        id: "err-1",
        message: "Tool call failed",
        retryable: true,
        createdAt: "2026-02-28T00:00:00.000Z",
      },
    ];

    render(
      <TimelineRenderer
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
        onRetryLastMessage={onRetryLastMessage}
        onResumeRun={onResumeRun}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    fireEvent.click(screen.getByRole("button", { name: /resume/i }));

    expect(onRetryLastMessage).toHaveBeenCalledTimes(1);
    expect(onResumeRun).toHaveBeenCalledTimes(1);
  });
});
