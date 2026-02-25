// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TimelineRenderer } from "../TimelineRenderer";
import type { TimelineItem } from "@/types/timeline";
import type { ArtifactType, ArtifactStatus } from "@/types/artifacts";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "project-1" }),
}));

vi.mock("@/app/actions/ledger", () => ({
  addMentionedStudyAction: vi.fn(async () => ({ success: true, data: { created: true, study: { id: "s1" } } })),
}));

vi.mock("@/lib/agent/feature-flags", async () => {
  const actual = await vi.importActual<typeof import("@/lib/agent/feature-flags")>("@/lib/agent/feature-flags");
  return {
    ...actual,
    isChatStudyMentionsEnabled: () => false,
  };
});

const defaultProps = {
  isLoading: false,
  emptyState: { icon: "chat", title: "Empty", description: "Empty", suggestions: [] },
  onSuggestionClick: vi.fn(),
};

function makeArtifact(
  id: string,
  artifactType: ArtifactType,
  status: ArtifactStatus = "proposed",
): TimelineItem {
  const payloadByType: Record<ArtifactType, unknown> = {
    study_proposal: {
      title: `Study ${id}`,
      authors: "Doe et al.",
      year: 2024,
      source: "semantic_scholar",
      recommendation: "keep",
      confidence: 0.8,
    },
    study_update: {
      studyId: `study-${id}`,
      studyTitle: `Study ${id}`,
      snapshotAt: "2026-02-21T00:00:00.000Z",
      idempotencyKey: `key-${id}`,
      patch: { top: { title: `Study ${id}` } },
      changes: [{
        field: "title",
        label: "Title",
        operation: "set",
        typedOldValue: "Old",
        typedNewValue: "New",
        displayOld: "Old",
        displayNew: "New",
      }],
      rationale: "Updated",
    },
    draft_diff: {
      section: "Introduction",
      content: "Draft content",
      citations: [],
      wordCount: 2,
    },
    screening_batch: {
      studies: [],
      summary: { total: 0, keepCount: 0, excludeCount: 0, maybeCount: 0 },
    },
    protocol_suggestion: {
      field: "population",
      value: "Adults",
      rationale: "Focus",
    },
    scoping_report: {
      topic: "Topic",
      searchesRun: [],
      landscape: {
        majorThemes: [],
        evidenceGaps: [],
        methodologicalPatterns: [],
        evidenceDensity: "sparse",
      },
      recommendedQuestions: [],
      nextStep: "Next",
    },
    criteria_card: {
      inclusion: ["Adults"],
      exclusion: ["Animals"],
    },
    evidence_table: {
      columns: [],
      rows: [],
    },
    plan: {
      steps: [{ label: "Step 1", status: "pending" }],
      estimatedActions: 1,
    },
    memory_proposal: {
      memoryType: "project",
      key: "priority",
      value: "Stay focused",
    },
    memory_forget_proposal: {
      memoryType: "project",
      key: "old-priority",
      mode: "archive",
      matches: [{ id: "m1", label: "key", value: "old value" }],
    },
  };

  return {
    type: "artifact",
    id: `msg-${id}`,
    artifactId: `artifact-${id}`,
    artifactType,
    status,
    title: `Artifact ${id}`,
    payload: payloadByType[artifactType],
    version: 1,
    createdAt: "2026-02-21T00:00:00.000Z",
  };
}

describe("TimelineRenderer approve-all bar", () => {
  it("hides the bar when fewer than 2 approvable artifacts are pending", () => {
    render(
      <TimelineRenderer
        {...defaultProps}
        items={[makeArtifact("1", "memory_proposal", "proposed")]}
        onReviewArtifact={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /approve all pending proposals/i })).toBeNull();
  });

  it("shows the bar with a correct pending count for 2+ approvable artifacts", () => {
    render(
      <TimelineRenderer
        {...defaultProps}
        items={[
          makeArtifact("1", "memory_proposal", "proposed"),
          makeArtifact("2", "draft_diff", "proposed"),
        ]}
        onReviewArtifact={vi.fn()}
      />,
    );

    expect(screen.getByText("2 pending proposals")).toBeDefined();
    expect(screen.getByRole("button", { name: /approve all pending proposals/i })).toBeDefined();
  });

  it("excludes non-approvable or non-proposed artifacts from the pending count", () => {
    render(
      <TimelineRenderer
        {...defaultProps}
        items={[
          makeArtifact("1", "plan", "proposed"),
          makeArtifact("2", "scoping_report", "proposed"),
          makeArtifact("3", "memory_proposal", "accepted"),
          makeArtifact("4", "memory_forget_proposal", "proposed"),
        ]}
        onReviewArtifact={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /approve all pending proposals/i })).toBeNull();
  });

  it("invokes onApproveArtifactsBatch with pending artifact IDs", async () => {
    const batch = vi.fn(async (artifactIds: string[]) => ({
      approvedCount: artifactIds.length,
      failedArtifactIds: [],
      stopped: false,
    }));

    render(
      <TimelineRenderer
        {...defaultProps}
        items={[
          makeArtifact("1", "memory_proposal", "proposed"),
          makeArtifact("2", "draft_diff", "proposed"),
        ]}
        onReviewArtifact={vi.fn()}
        onApproveArtifactsBatch={batch}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /approve all pending proposals/i }));

    await waitFor(() => {
      expect(batch).toHaveBeenCalledOnce();
      expect(batch).toHaveBeenCalledWith(
        ["artifact-1", "artifact-2"],
        expect.objectContaining({
          shouldStop: expect.any(Function),
          onProgress: expect.any(Function),
          conversationId: undefined,
        }),
      );
    });
  });

  it("keeps the bar visible while approving even when pending count drops", async () => {
    let resolveBatch: (value: { approvedCount: number; failedArtifactIds: string[]; stopped: boolean }) => void = () => {};
    const batch = vi.fn(() => new Promise<{ approvedCount: number; failedArtifactIds: string[]; stopped: boolean }>((resolve) => {
      resolveBatch = resolve;
    }));

    const proposedItems = [
      makeArtifact("1", "memory_proposal", "proposed"),
      makeArtifact("2", "draft_diff", "proposed"),
    ];

    const acceptedItems = [
      makeArtifact("1", "memory_proposal", "accepted"),
      makeArtifact("2", "draft_diff", "accepted"),
    ];

    const { rerender } = render(
      <TimelineRenderer
        {...defaultProps}
        items={proposedItems}
        onReviewArtifact={vi.fn()}
        onApproveArtifactsBatch={batch}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /approve all pending proposals/i }));
    expect(screen.getByText(/approving 0\/2/i)).toBeDefined();

    rerender(
      <TimelineRenderer
        {...defaultProps}
        items={acceptedItems}
        onReviewArtifact={vi.fn()}
        onApproveArtifactsBatch={batch}
      />,
    );

    expect(screen.getByText(/approving 0\/2/i)).toBeDefined();

    resolveBatch({ approvedCount: 2, failedArtifactIds: [], stopped: false });

    await waitFor(() => {
      expect(screen.getByText("All approved.")).toBeDefined();
    });
  });

  it("propagates Stop to the batch callback through shouldStop", async () => {
    let resolveBatch: (value: { approvedCount: number; failedArtifactIds: string[]; stopped: boolean }) => void = () => {};
    let shouldStop: (() => boolean) | undefined;
    const batch = vi.fn((_: string[], options?: { shouldStop?: () => boolean }) => new Promise<{ approvedCount: number; failedArtifactIds: string[]; stopped: boolean }>((resolve) => {
      shouldStop = options?.shouldStop;
      resolveBatch = resolve;
    }));

    render(
      <TimelineRenderer
        {...defaultProps}
        items={[
          makeArtifact("1", "memory_proposal", "proposed"),
          makeArtifact("2", "draft_diff", "proposed"),
        ]}
        onReviewArtifact={vi.fn()}
        onApproveArtifactsBatch={batch}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /approve all pending proposals/i }));
    const stopButton = await screen.findByRole("button", { name: /stop approving remaining proposals/i });
    fireEvent.click(stopButton);

    expect(shouldStop?.()).toBe(true);

    resolveBatch({ approvedCount: 1, failedArtifactIds: ["artifact-2"], stopped: true });
    await waitFor(() => {
      expect(screen.getByText("Stopped. Approved 1/2.")).toBeDefined();
    });
  });

  it("falls back to sequential onReviewArtifact when batch callback is not provided", async () => {
    const review = vi.fn(async () => {});

    render(
      <TimelineRenderer
        {...defaultProps}
        items={[
          makeArtifact("1", "memory_proposal", "proposed"),
          makeArtifact("2", "draft_diff", "proposed"),
        ]}
        onReviewArtifact={review}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /approve all pending proposals/i }));

    await waitFor(() => {
      expect(review).toHaveBeenCalledTimes(2);
    });
    expect(review).toHaveBeenNthCalledWith(1, "artifact-1", "accepted");
    expect(review).toHaveBeenNthCalledWith(2, "artifact-2", "accepted");
  });

  it("hides the bar when no review callbacks are provided", () => {
    render(
      <TimelineRenderer
        {...defaultProps}
        items={[
          makeArtifact("1", "memory_proposal", "proposed"),
          makeArtifact("2", "draft_diff", "proposed"),
        ]}
      />,
    );

    expect(screen.queryByRole("button", { name: /approve all pending proposals/i })).toBeNull();
  });

  it("renders in both panel and page variants", () => {
    const items = [
      makeArtifact("1", "memory_proposal", "proposed"),
      makeArtifact("2", "draft_diff", "proposed"),
    ];

    const { rerender } = render(
      <TimelineRenderer
        {...defaultProps}
        items={items}
        variant="panel"
        onReviewArtifact={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /approve all pending proposals/i })).toBeDefined();

    rerender(
      <TimelineRenderer
        {...defaultProps}
        items={items}
        variant="page"
        onReviewArtifact={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /approve all pending proposals/i })).toBeDefined();
  });
});
