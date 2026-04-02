// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArtifactWrapper } from "../ArtifactWrapper";

describe("ArtifactWrapper", () => {
  it("keeps accepted artifacts visible briefly after approval before collapsing them into summary history", () => {
    vi.useFakeTimers();

    const { rerender } = render(
      <ArtifactWrapper
        artifactId="artifact-1"
        artifactType="protocol_suggestion"
        status="proposed"
        title="Protocol update"
        version={1}
        onReview={vi.fn()}
        summaryText="Saved to protocol"
      >
        <div>Approved.</div>
      </ArtifactWrapper>,
    );

    rerender(
      <ArtifactWrapper
        artifactId="artifact-1"
        artifactType="protocol_suggestion"
        status="accepted"
        title="Protocol update"
        version={1}
        onReview={vi.fn()}
        summaryText="Saved to protocol"
      >
        <div>Approved.</div>
      </ArtifactWrapper>,
    );

    expect(screen.getByText("Approved.")).not.toBeNull();
    expect(screen.queryByText("Saved to protocol")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText("Approved.")).toBeNull();
    expect(screen.getByText("Saved to protocol")).not.toBeNull();

    vi.useRealTimers();
  });

  it("renders a settled undo affordance while an accepted artifact is still visible", () => {
    vi.useFakeTimers();
    const onUndo = vi.fn();

    const { rerender } = render(
      <ArtifactWrapper
        artifactId="artifact-2"
        artifactType="study_update"
        status="proposed"
        title="Study update"
        version={1}
        onReview={vi.fn()}
        summaryText="Study updated"
      >
        <div>Body</div>
      </ArtifactWrapper>,
    );

    rerender(
      <ArtifactWrapper
        artifactId="artifact-2"
        artifactType="study_update"
        status="accepted"
        title="Study update"
        version={1}
        onReview={vi.fn()}
        summaryText="Study updated"
        settledLabel="Approved."
        settledAction={{ label: "Undo", onClick: onUndo }}
      >
        <div>Body</div>
      </ArtifactWrapper>,
    );

    expect(screen.getByText("Approved.")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /undo/i }));
    expect(onUndo).toHaveBeenCalledTimes(1);

    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(screen.queryByText("Approved.")).toBeNull();
    expect(screen.getByText("Study updated")).not.toBeNull();

    vi.useRealTimers();
  });

  it("collapses auto-applied artifacts without waiting when no settled action is present", () => {
    vi.useFakeTimers();

    const { rerender } = render(
      <ArtifactWrapper
        artifactId="artifact-3"
        artifactType="study_update"
        status="proposed"
        title="Study update"
        version={1}
        onReview={vi.fn()}
        summaryText="Study updated"
      >
        <div>Body</div>
      </ArtifactWrapper>,
    );

    rerender(
      <ArtifactWrapper
        artifactId="artifact-3"
        artifactType="study_update"
        status="auto_applied"
        title="Study update"
        version={1}
        onReview={vi.fn()}
        summaryText="Study updated"
      >
        <div>Body</div>
      </ArtifactWrapper>,
    );

    expect(screen.getByText("Body")).not.toBeNull();

    act(() => {
      vi.runOnlyPendingTimers();
    });

    expect(screen.queryByText("Body")).toBeNull();
    expect(screen.getByText("Study updated")).not.toBeNull();

    vi.useRealTimers();
  });
});
