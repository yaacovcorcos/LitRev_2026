// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

  it("renders settled artifacts as read-only cards without stale approval controls", () => {
    const items: TimelineItem[] = [
      {
        type: "artifact",
        id: "settled-study",
        artifactId: "settled-study",
        artifactType: "study_proposal",
        status: "accepted",
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
        createdAt: "2026-02-21T00:10:00.000Z",
      },
      {
        type: "artifact",
        id: "settled-memory",
        artifactId: "settled-memory",
        artifactType: "memory_proposal",
        status: "accepted",
        title: "Memory",
        payload: {
          memoryType: "project",
          key: "eligibility_core",
          value: "Prefer trial populations with prespecified subgroup reporting.",
        },
        version: 1,
        createdAt: "2026-02-21T00:11:00.000Z",
      },
      {
        type: "artifact",
        id: "settled-draft",
        artifactId: "settled-draft",
        artifactType: "draft_diff",
        status: "rejected",
        title: "Draft",
        payload: {
          section: "Introduction",
          content: "Draft text",
          citations: [],
          wordCount: 2,
        },
        version: 1,
        createdAt: "2026-02-21T00:12:00.000Z",
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

    expect(screen.queryByRole("button", { name: /^keep$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^exclude/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^remember$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /dismiss/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /accept & save to draft/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^undo$/i })).toBeNull();

    for (const button of screen.getAllByRole("button", { name: "Expand" })) {
      fireEvent.click(button);
    }

    expect(screen.getAllByText("Approved.").length).toBeGreaterThan(0);
    expect(screen.getByText("Rejected.")).not.toBeNull();
  });

  it("renders retry for generic retryable error cards without offering resume", () => {
    const onRetryLastMessage = vi.fn();
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
        onResumeRun={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(onRetryLastMessage).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /resume/i })).toBeNull();
  });

  it("confirms destructive study exclusion before dispatching the review action", async () => {
    const onReviewArtifact = vi.fn();
    const items: TimelineItem[] = [
      {
        type: "artifact",
        id: "study-proposal-1",
        artifactId: "study-proposal-1",
        artifactType: "study_proposal",
        status: "proposed",
        title: "Example Study",
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
    ];

    render(
      <TimelineRenderer
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
        onReviewArtifact={onReviewArtifact}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^exclude/i }));
    fireEvent.click(screen.getByRole("button", { name: /wrong population/i }));

    expect(screen.getByText("Exclude study?")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^exclude$/i }));

    await waitFor(() => {
      expect(onReviewArtifact).toHaveBeenCalledWith(
        "study-proposal-1",
        "rejected",
        "Wrong population",
        undefined,
      );
    });
  });

  it("dispatches positive study updates without a confirmation dialog", async () => {
    const onReviewArtifact = vi.fn();
    const items: TimelineItem[] = [
      {
        type: "artifact",
        id: "study-update-1",
        artifactId: "study-update-1",
        artifactType: "study_update",
        status: "proposed",
        title: "Study update",
        payload: {
          studyId: "study-1",
          studyTitle: "Example Study",
          snapshotAt: "2026-03-17T10:00:00.000Z",
          idempotencyKey: "idempotency-key",
          patch: { details: { abstract: "Updated abstract" } },
          changes: [
            {
              field: "details.abstract",
              label: "Abstract",
              operation: "set",
              typedOldValue: "Old abstract",
              typedNewValue: "Updated abstract",
              displayOld: "Old abstract",
              displayNew: "Updated abstract",
            },
          ],
          rationale: "User asked",
        },
        version: 1,
        createdAt: "2026-03-17T10:00:00.000Z",
      },
    ];

    render(
      <TimelineRenderer
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
        onReviewArtifact={onReviewArtifact}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /apply changes/i }));

    await waitFor(() => {
      expect(onReviewArtifact).toHaveBeenCalledWith("study-update-1", "accepted", undefined, undefined);
    });
    expect(screen.queryByText("Reject proposal?")).toBeNull();
  });

  it("shows inline undo for accepted study updates and confirms before dispatching", async () => {
    const onUndoArtifact = vi.fn();
    const items: TimelineItem[] = [
      {
        type: "artifact",
        id: "study-update-accepted",
        artifactId: "study-update-accepted",
        artifactType: "study_update",
        status: "accepted",
        title: "Study update",
        payload: {
          studyId: "study-1",
          studyTitle: "Example Study",
          snapshotAt: "2026-03-17T10:00:00.000Z",
          idempotencyKey: "idempotency-key",
          patch: { details: { abstract: "Updated abstract" } },
          changes: [
            {
              field: "details.abstract",
              label: "Abstract",
              operation: "set",
              typedOldValue: "Old abstract",
              typedNewValue: "Updated abstract",
              displayOld: "Old abstract",
              displayNew: "Updated abstract",
            },
          ],
          rationale: "User asked",
        },
        version: 1,
        createdAt: "2026-03-17T10:00:00.000Z",
      },
    ];

    render(
      <TimelineRenderer
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
        onUndoArtifact={onUndoArtifact}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    fireEvent.click(screen.getByRole("button", { name: /^undo$/i }));

    expect(screen.getByText("Undo applied change?")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^undo$/i }));

    await waitFor(() => {
      expect(onUndoArtifact).toHaveBeenCalledWith("study-update-accepted");
    });
  });

  it("routes reconnect and stop-and-retry actions to the clicked error card", () => {
    const onReconnectRun = vi.fn();
    const onStopAndRetryRun = vi.fn();
    const items: TimelineItem[] = [
      {
        type: "error",
        id: "err-reconnect",
        message: "Connection lost and recovery timed out. Choose how to continue.",
        retryable: false,
        errorMeta: {
          kind: "runtime",
          code: "RUN_RECOVERY_TIMEOUT",
          retryable: false,
          source: "runtime",
          message: "Connection lost and recovery timed out. Choose how to continue.",
          recoveryRecommendation: "reconnect",
          activeRunId: "run-1",
        },
        createdAt: "2026-02-28T00:00:00.000Z",
      },
      {
        type: "error",
        id: "err-reconnect-2",
        message: "Connection lost for a later run.",
        retryable: false,
        errorMeta: {
          kind: "runtime",
          code: "RUN_RECOVERY_TIMEOUT",
          retryable: false,
          source: "runtime",
          message: "Connection lost for a later run.",
          recoveryRecommendation: "reconnect",
          activeRunId: "run-2",
        },
        createdAt: "2026-02-28T00:00:30.000Z",
      },
      {
        type: "error",
        id: "err-stop",
        message: "The active run is still holding this conversation. Choose how to continue.",
        retryable: false,
        errorMeta: {
          kind: "runtime",
          code: "RUN_RECOVERY_REQUIRES_USER_ACTION",
          retryable: false,
          source: "runtime",
          message: "The active run is still holding this conversation. Choose how to continue.",
          recoveryRecommendation: "stop_and_retry",
          activeRunId: "run-1",
        },
        createdAt: "2026-02-28T00:01:00.000Z",
      },
    ];

    render(
      <TimelineRenderer
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
        onReconnectRun={onReconnectRun}
        onStopAndRetryRun={onStopAndRetryRun}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: /reconnect/i })[0]!);
    fireEvent.click(screen.getByRole("button", { name: /stop & retry/i }));

    expect(onReconnectRun).toHaveBeenCalledTimes(1);
    expect(onReconnectRun).toHaveBeenCalledWith(expect.objectContaining({
      id: "err-reconnect",
      errorMeta: expect.objectContaining({ activeRunId: "run-1" }),
    }));
    expect(onStopAndRetryRun).toHaveBeenCalledTimes(1);
    expect(onStopAndRetryRun).toHaveBeenCalledWith(expect.objectContaining({
      id: "err-stop",
      errorMeta: expect.objectContaining({ activeRunId: "run-1" }),
    }));
    expect(screen.queryByRole("button", { name: /^retry$/i })).toBeNull();
  });

  it("routes continue actions to the clicked error card for proven durable state", () => {
    const onContinueFromDurableStateRun = vi.fn();
    const items: TimelineItem[] = [
      {
        type: "error",
        id: "err-continue",
        message: "Saved work is available. Continue from the latest durable state.",
        retryable: false,
        errorMeta: {
          kind: "runtime",
          code: "RUN_RECOVERY_REQUIRES_USER_ACTION",
          retryable: false,
          source: "runtime",
          message: "Saved work is available. Continue from the latest durable state.",
          recoveryRecommendation: "continue_from_durable_state",
          runId: "run-continue",
          activeRunId: "run-continue",
        },
        createdAt: "2026-03-14T00:00:00.000Z",
      },
    ];

    render(
      <TimelineRenderer
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
        onContinueFromDurableStateRun={onContinueFromDurableStateRun}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(onContinueFromDurableStateRun).toHaveBeenCalledTimes(1);
    expect(onContinueFromDurableStateRun).toHaveBeenCalledWith(expect.objectContaining({
      id: "err-continue",
      errorMeta: expect.objectContaining({ runId: "run-continue" }),
    }));
  });

  it("routes continue actions to the clicked error card for checkpoint continuation", () => {
    const onContinueFromDurableStateRun = vi.fn();
    const items: TimelineItem[] = [
      {
        type: "error",
        id: "err-checkpoint",
        message: "Saved progress is available. Continue from the latest checkpoint.",
        retryable: false,
        errorMeta: {
          kind: "runtime",
          code: "RUN_RECOVERY_REQUIRES_USER_ACTION",
          retryable: false,
          source: "runtime",
          message: "Saved progress is available. Continue from the latest checkpoint.",
          recoveryRecommendation: "continue_from_checkpoint",
          runId: "run-checkpoint",
          activeRunId: "run-checkpoint",
        },
        createdAt: "2026-03-14T00:00:00.000Z",
      },
    ];

    render(
      <TimelineRenderer
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
        onContinueFromDurableStateRun={onContinueFromDurableStateRun}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /continue/i }));

    expect(onContinueFromDurableStateRun).toHaveBeenCalledTimes(1);
    expect(onContinueFromDurableStateRun).toHaveBeenCalledWith(expect.objectContaining({
      id: "err-checkpoint",
      errorMeta: expect.objectContaining({ runId: "run-checkpoint" }),
    }));
  });

  it("renders resume only for plan execution errors", () => {
    const onResumeRun = vi.fn();
    const items: TimelineItem[] = [
      {
        type: "error",
        id: "err-plan",
        message: "Plan execution failed",
        retryable: false,
        errorMeta: {
          kind: "plan_execution",
          code: "PLAN_EXECUTION_FAILED",
          retryable: false,
          source: "plan_execution",
          message: "Plan execution failed",
        },
        createdAt: "2026-02-28T00:00:00.000Z",
      },
    ];

    render(
      <TimelineRenderer
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
        onResumeRun={onResumeRun}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /resume/i }));
    expect(onResumeRun).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /^retry$/i })).toBeNull();
  });

  it("does not render retry/resume actions for non-retryable non-plan error cards", () => {
    const items: TimelineItem[] = [
      {
        type: "error",
        id: "err-2",
        message: "The model returned invalid arguments for update_protocol.",
        retryable: false,
        errorMeta: {
          kind: "tool_call_parse",
          code: "TOOL_CALL_ARGS_PARSE_FAILED",
          retryable: false,
          source: "provider_tool_call",
          message: "The model returned invalid arguments for update_protocol.",
        },
        createdAt: "2026-02-28T00:00:00.000Z",
      },
    ];

    render(
      <TimelineRenderer
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
        onRetryLastMessage={vi.fn()}
        onResumeRun={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /resume/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reconnect/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /stop & retry/i })).toBeNull();
  });

  it("fails closed for advisory plans without execution metadata", () => {
    const items: TimelineItem[] = [
      {
        type: "artifact",
        id: "plan-legacy",
        artifactId: "plan-legacy",
        artifactType: "plan",
        status: "proposed",
        title: "Legacy Plan",
        payload: {
          steps: [{ label: "Search PubMed", toolName: "search_pubmed", status: "pending" }],
          estimatedActions: 1,
        },
        version: 1,
        createdAt: "2026-03-10T00:00:00.000Z",
      },
    ];

    render(
      <TimelineRenderer
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
        onExecutePlan={vi.fn()}
        onReviewArtifact={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /^run/i })).toBeNull();
    expect(screen.queryByLabelText(/select step 1/i)).toBeNull();
    expect(screen.getByText("Advisory plan. Review only.")).not.toBeNull();
  });

  it("renders run for executable plans with execution metadata", () => {
    const items: TimelineItem[] = [
      {
        type: "artifact",
        id: "plan-executable",
        artifactId: "plan-executable",
        artifactType: "plan",
        status: "proposed",
        title: "Executable Plan",
        payload: {
          steps: [{ label: "Search PubMed", toolName: "search_pubmed", status: "pending" }],
          estimatedActions: 1,
          execution: {
            originAgentMode: "search",
            allowedToolNames: ["search_pubmed"],
            createdFromConversationId: "conv-1",
            createdFromProjectId: "project-1",
            enforceOrder: true,
          },
        },
        version: 1,
        createdAt: "2026-03-10T00:00:00.000Z",
      },
    ];

    render(
      <TimelineRenderer
        items={items}
        isLoading={false}
        emptyState={{ icon: "chat", title: "Empty", description: "Empty", suggestions: [] }}
        onSuggestionClick={vi.fn()}
        onExecutePlan={vi.fn()}
        onReviewArtifact={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: /^run/i })).not.toBeNull();
  });

  it("renders auto-applied study updates without review controls", () => {
    const items: TimelineItem[] = [
      {
        type: "artifact",
        id: "a-study-auto",
        artifactId: "artifact-study-auto",
        artifactType: "study_update",
        status: "auto_applied",
        title: "Study metadata update",
        payload: {
          studyId: "study-1",
          studyTitle: "Example study",
          snapshotAt: "2026-03-17T00:00:00.000Z",
          idempotencyKey: "idempotency-key",
          patch: { details: { abstract: "Updated abstract" } },
          changes: [
            {
              field: "details.abstract",
              label: "Abstract",
              operation: "set",
              typedOldValue: "Old abstract",
              typedNewValue: "Updated abstract",
              displayOld: "Old abstract",
              displayNew: "Updated abstract",
            },
          ],
          rationale: "User asked",
        },
        version: 1,
        createdAt: "2026-03-17T00:00:00.000Z",
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

    fireEvent.click(screen.getByRole("button", { name: /expand/i }));

    expect(screen.getByText("Changes already applied.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /apply changes/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /reject/i })).toBeNull();
  });
});
