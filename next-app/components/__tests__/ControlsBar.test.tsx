// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ControlsBar } from "../ControlsBar";

describe("ControlsBar", () => {
  it("applies extension-point class names without changing base semantics", () => {
    render(
      <ControlsBar
        sortMode="modified"
        viewMode="grid"
        onSortChange={vi.fn()}
        onViewChange={vi.fn()}
        className="test-root"
        viewControlsClassName="test-view-controls"
        rightActionClassName="test-right-action"
        sortButtonClassName="test-sort-button"
        viewTogglesClassName="test-view-toggles"
        rightAction={<span>Resume</span>}
      />,
    );

    expect(screen.getByRole("button", { name: /sort by/i }).className).toContain("test-sort-button");
    expect(screen.getByRole("button", { name: /grid view/i }).parentElement?.className).toContain("test-view-toggles");
    expect(screen.getByText("Resume").parentElement?.className).toContain("test-right-action");
    expect(screen.getByText("Resume").closest("div")?.parentElement?.className).toContain("test-view-controls");
  });
});
