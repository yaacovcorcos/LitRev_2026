// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
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
});
