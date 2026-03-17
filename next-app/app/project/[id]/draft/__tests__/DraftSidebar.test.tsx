// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DraftSidebar } from "../DraftSidebar";

describe("DraftSidebar", () => {
  it("dismisses the overlay when the scrim is clicked", () => {
    const onDismiss = vi.fn();

    render(
      <DraftSidebar collapsed={false} isOverlay onToggleCollapsed={vi.fn()} onDismiss={onDismiss}>
        <div>Evidence content</div>
      </DraftSidebar>,
    );

    fireEvent.click(screen.getByLabelText("Close evidence ledger overlay"));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("dismisses the overlay on Escape", () => {
    const onDismiss = vi.fn();

    render(
      <DraftSidebar collapsed={false} isOverlay onToggleCollapsed={vi.fn()} onDismiss={onDismiss}>
        <div>Evidence content</div>
      </DraftSidebar>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("reopens the evidence ledger from the collapsed rail", () => {
    const onToggleCollapsed = vi.fn();

    render(
      <DraftSidebar collapsed isOverlay={false} onToggleCollapsed={onToggleCollapsed} onDismiss={vi.fn()}>
        <div>Evidence content</div>
      </DraftSidebar>,
    );

    fireEvent.click(screen.getByLabelText("Expand evidence ledger"));

    expect(onToggleCollapsed).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Evidence")).toBeTruthy();
  });
});
