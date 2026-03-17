// @vitest-environment jsdom
import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ArtifactType, ArtifactStatus } from "@/types/artifacts";
import type { TimelineItem } from "@/types/timeline";
import { ComposerPendingApprovalBar } from "../ComposerPendingApprovalBar";
import { getValidPendingApprovalArtifacts, usePendingApprovalBarState } from "../usePendingApprovalBarState";

type TimelineArtifactItem = Extract<TimelineItem, { type: "artifact" }>;

function makeArtifact(
  artifactId: string,
  artifactType: ArtifactType,
  status: ArtifactStatus = "proposed",
): TimelineArtifactItem {
  return {
    type: "artifact",
    id: `artifact-${artifactId}`,
    artifactId,
    artifactType,
    status,
    title: `Artifact ${artifactId}`,
    payload: {},
    version: 1,
    createdAt: "2026-03-17T00:00:00.000Z",
  };
}

describe("pending approval derivation", () => {
  it("only includes proposed reviewable persisted artifacts", () => {
    const pending = getValidPendingApprovalArtifacts([
      makeArtifact("cproposal1", "memory_proposal", "proposed"),
      makeArtifact("cproposal2", "draft_diff", "proposed"),
      makeArtifact("cautoapplied", "study_update", "auto_applied"),
      makeArtifact("caccepted", "memory_forget_proposal", "accepted"),
      makeArtifact("cplan", "plan", "proposed"),
      {
        ...makeArtifact("cart123", "study_update", "proposed"),
        id: "artifact-art-123",
        artifactId: "art-123",
      },
    ]);

    expect(pending.map((item) => item.artifactId)).toEqual(["cproposal1", "cproposal2"]);
  });
});

describe("usePendingApprovalBarState", () => {
  it("hides the bar when fewer than 2 valid proposals remain", () => {
    const { result } = renderHook(() => usePendingApprovalBarState({
      timeline: [makeArtifact("cproposal1", "memory_proposal", "proposed")],
      conversationId: "conv-1",
      isLoading: false,
      hasActiveProgress: false,
      approveArtifactsBatch: vi.fn(),
    }));

    expect(result.current.showBar).toBe(false);
    expect(result.current.pendingCount).toBe(1);
  });

  it("hides the idle bar while the host is still loading or showing active progress", () => {
    const timeline = [
      makeArtifact("cproposal1", "memory_proposal", "proposed"),
      makeArtifact("cproposal2", "draft_diff", "proposed"),
    ];

    const { result, rerender } = renderHook(
      ({ isLoading, hasActiveProgress }) => usePendingApprovalBarState({
        timeline,
        conversationId: "conv-1",
        isLoading,
        hasActiveProgress,
        approveArtifactsBatch: vi.fn(),
      }),
      {
        initialProps: { isLoading: true, hasActiveProgress: false },
      },
    );

    expect(result.current.showBar).toBe(false);

    rerender({ isLoading: false, hasActiveProgress: true });
    expect(result.current.showBar).toBe(false);

    rerender({ isLoading: false, hasActiveProgress: false });
    expect(result.current.showBar).toBe(true);
  });

  it("approves the filtered valid artifact set and reports progress", async () => {
    const batch = vi.fn(async (artifactIds: string[], options?: { onProgress?: (completed: number, total: number) => void }) => {
      options?.onProgress?.(1, artifactIds.length);
      options?.onProgress?.(artifactIds.length, artifactIds.length);
      return {
        approvedCount: artifactIds.length,
        failedArtifactIds: [],
        stopped: false,
      };
    });

    const { result } = renderHook(() => usePendingApprovalBarState({
      timeline: [
        makeArtifact("cproposal1", "memory_proposal", "proposed"),
        makeArtifact("cproposal2", "draft_diff", "proposed"),
        {
          ...makeArtifact("art-123", "study_update", "proposed"),
          id: "artifact-art-123",
        },
      ],
      conversationId: "conv-1",
      isLoading: false,
      hasActiveProgress: false,
      approveArtifactsBatch: batch,
    }));

    await act(async () => {
      await result.current.approveAll();
    });

    expect(batch).toHaveBeenCalledWith(
      ["cproposal1", "cproposal2"],
      expect.objectContaining({
        shouldStop: expect.any(Function),
        onProgress: expect.any(Function),
        conversationId: "conv-1",
      }),
    );
    expect(result.current.state).toBe("finished");
    expect(result.current.resultText).toBe("All approved.");
  });

  it("propagates stop through the batch shouldStop callback", async () => {
    let shouldStop: (() => boolean) | undefined;
    let resolveBatch: ((value: { approvedCount: number; failedArtifactIds: string[]; stopped: boolean }) => void) | null = null;
    const batch = vi.fn((_: string[], options?: { shouldStop?: () => boolean }) => new Promise<{ approvedCount: number; failedArtifactIds: string[]; stopped: boolean }>((resolve) => {
      shouldStop = options?.shouldStop;
      resolveBatch = resolve;
    }));

    const { result } = renderHook(() => usePendingApprovalBarState({
      timeline: [
        makeArtifact("cproposal1", "memory_proposal", "proposed"),
        makeArtifact("cproposal2", "draft_diff", "proposed"),
      ],
      conversationId: "conv-1",
      isLoading: false,
      hasActiveProgress: false,
      approveArtifactsBatch: batch,
    }));

    await act(async () => {
      void result.current.approveAll();
    });

    act(() => {
      result.current.stopApproval();
    });

    expect(shouldStop?.()).toBe(true);

    await act(async () => {
      resolveBatch?.({ approvedCount: 1, failedArtifactIds: ["cproposal2"], stopped: true });
    });

    expect(result.current.resultText).toBe("Stopped. Approved 1/2.");
  });
});

describe("ComposerPendingApprovalBar", () => {
  it("renders idle and approving states with the expected controls", async () => {
    const onApproveAll = vi.fn();
    const onStop = vi.fn();
    const { rerender } = render(
      <ComposerPendingApprovalBar
        pendingCount={2}
        state="idle"
        progress={{ completed: 0, total: 2 }}
        resultText="All approved."
        onApproveAll={onApproveAll}
        onStop={onStop}
      />,
    );

    expect(screen.getByText("2 pending proposals")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /approve all pending proposals/i }));
    expect(onApproveAll).toHaveBeenCalledTimes(1);

    rerender(
      <ComposerPendingApprovalBar
        pendingCount={2}
        state="approving"
        progress={{ completed: 1, total: 2 }}
        resultText="All approved."
        onApproveAll={onApproveAll}
        onStop={onStop}
        stackPosition="middle"
      />,
    );

    expect(screen.getByText("Approving 1/2...")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(onStop).toHaveBeenCalledTimes(1);

    rerender(
      <ComposerPendingApprovalBar
        pendingCount={2}
        state="finished"
        progress={{ completed: 2, total: 2 }}
        resultText="All approved."
        onApproveAll={onApproveAll}
        onStop={onStop}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("All approved.")).toBeTruthy();
    });
  });
});
