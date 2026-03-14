// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DraftSidebar } from "../DraftSidebar";

describe("DraftSidebar", () => {
  it("dismisses the overlay when the scrim is clicked", () => {
    const onDismiss = vi.fn();

    render(
      <DraftSidebar
        collapsed={false}
        activeView="sections"
        isOverlay
        onToggleCollapsed={vi.fn()}
        onDismiss={onDismiss}
        onViewChange={vi.fn()}
        sectionsPane={<div>Sections content</div>}
        evidencePane={<div>Evidence content</div>}
      />,
    );

    fireEvent.click(screen.getByLabelText("Close draft sidebar overlay"));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses the overlay on Escape", () => {
    const onDismiss = vi.fn();

    render(
      <DraftSidebar
        collapsed={false}
        activeView="sections"
        isOverlay
        onToggleCollapsed={vi.fn()}
        onDismiss={onDismiss}
        onViewChange={vi.fn()}
        sectionsPane={<div>Sections content</div>}
        evidencePane={<div>Evidence content</div>}
      />,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("opens the requested view from the collapsed rail", () => {
    const onViewChange = vi.fn();
    const onToggleCollapsed = vi.fn();

    render(
      <DraftSidebar
        collapsed
        activeView="sections"
        isOverlay={false}
        onToggleCollapsed={onToggleCollapsed}
        onDismiss={vi.fn()}
        onViewChange={onViewChange}
        sectionsPane={<div>Sections content</div>}
        evidencePane={<div>Evidence content</div>}
      />,
    );

    fireEvent.click(screen.getByLabelText("Show evidence"));

    expect(onViewChange).toHaveBeenCalledWith("evidence");
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
  });
});
