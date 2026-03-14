// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DraftTopBar } from "../DraftToolbar";

function createProps(overrides: Partial<Parameters<typeof DraftTopBar>[0]> = {}) {
  return {
    projectName: "Demo",
    activeSection: null,
    mode: "full" as const,
    canUseSectionMode: false,
    orderedSections: [],
    availableSections: [],
    draggingKey: null,
    dragOverKey: null,
    dragOverPosition: null,
    sectionTabRefs: { current: {} },
    addSectionRef: { current: null },
    addSectionInputRef: { current: null },
    isAddSectionOpen: false,
    setAddSectionOpen: vi.fn(),
    customSectionName: "",
    setCustomSectionName: vi.fn(),
    onSelectSection: vi.fn(),
    onSectionKeyDown: vi.fn(),
    onToggleMode: vi.fn(),
    onAddSection: vi.fn(),
    onAddCustomSection: vi.fn(),
    onDragStart: vi.fn(),
    onDragOver: vi.fn(),
    onDrop: vi.fn(),
    onDragEnd: vi.fn(),
    hasDraftContent: false,
    onExportClick: vi.fn(),
    saveStatus: "saved" as const,
    ...overrides,
  };
}

describe("DraftTopBar", () => {
  it("keeps section mode disabled until a named section exists", () => {
    render(<DraftTopBar {...createProps()} />);

    expect(screen.getByRole("button", { name: "Section" }).getAttribute("disabled")).not.toBeNull();
    expect(screen.getByText("No sections yet")).toBeTruthy();
  });

  it("only enables export once the draft has content", () => {
    const onExportClick = vi.fn();
    render(<DraftTopBar {...createProps({ hasDraftContent: true, onExportClick })} />);

    const exportButton = screen.getByRole("button", { name: /export/i });
    expect(exportButton.getAttribute("disabled")).toBeNull();

    fireEvent.click(exportButton);
    expect(onExportClick).toHaveBeenCalledTimes(1);
  });
});
