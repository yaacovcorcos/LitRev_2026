// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesignLabProjectSurface } from "../DesignLabProjectSurface";

const mockSearchParams = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams(),
}));

vi.mock("@/components/ui/EmptyState", () => ({
  EmptyState: ({
    title,
    description,
    primaryAction,
  }: {
    title: string;
    description?: string;
    primaryAction?: { label: string };
  }) => (
    <div>
      <div>{title}</div>
      {description ? <div>{description}</div> : null}
      {primaryAction ? <div>{primaryAction.label}</div> : null}
    </div>
  ),
}));

function createParams(query = "") {
  return new URLSearchParams(query);
}

describe("DesignLabProjectSurface", () => {
  it("renders the active overview surface by default", () => {
    mockSearchParams.mockReturnValue(createParams());

    render(<DesignLabProjectSurface surface="overview" />);

    expect(screen.getAllByText("Dietary Patterns and Sleep Quality")).toHaveLength(2);
    expect(screen.getByText("Workstreams")).toBeTruthy();
    expect(screen.getByText("Recent activity")).toBeTruthy();
  });

  it("renders the empty-state variant when requested", () => {
    mockSearchParams.mockReturnValue(createParams("state=empty"));

    render(<DesignLabProjectSurface surface="ledger" />);

    expect(screen.getByText("Ledger has no imported evidence yet")).toBeTruthy();
    expect(screen.getByText("Switch to active state")).toBeTruthy();
  });
});
