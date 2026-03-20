// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DraftTopBar } from "../DraftToolbar";

function createProps(overrides: Partial<Parameters<typeof DraftTopBar>[0]> = {}) {
  return {
    projectName: "Demo",
    activeSection: "abstract",
    mode: "section" as const,
    canUseSectionMode: true,
    orderedSections: [{ id: "abstract", label: "Abstract", placeholder: "Add abstract" }],
    availableSections: [{ id: "introduction", label: "Introduction", placeholder: "Add introduction" }],
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
    onRemoveSection: vi.fn(),
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
  it("renders seeded section tabs with section mode active", () => {
    render(<DraftTopBar {...createProps()} />);

    expect(screen.getByRole("tab", { name: "Abstract" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Section" }).getAttribute("disabled")).toBeNull();
  });

  it("only enables export once the draft has content", () => {
    const onExportClick = vi.fn();
    render(<DraftTopBar {...createProps({ hasDraftContent: true, onExportClick })} />);

    const exportButton = screen.getByRole("button", { name: /export/i });
    expect(exportButton.getAttribute("disabled")).toBeNull();

    fireEvent.click(exportButton);
    expect(onExportClick).toHaveBeenCalledTimes(1);
  });

  it("enables section mode when named sections exist", () => {
    render(
      <DraftTopBar
        {...createProps({
          orderedSections: [{ id: "abstract", label: "Abstract", placeholder: "Add abstract" }],
          activeSection: "abstract",
        })}
      />,
    );

    expect(screen.getByRole("tab", { name: "Abstract" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Section" }).getAttribute("disabled")).toBeNull();
  });

  it("disables section mode when no writable sections exist", () => {
    render(
      <DraftTopBar
        {...createProps({
          activeSection: null,
          mode: "full",
          canUseSectionMode: false,
          orderedSections: [],
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Section" }).getAttribute("disabled")).not.toBeNull();
  });
});
