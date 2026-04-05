// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Study } from "@/types/ledger";
import { LedgerStudyPreviewPanel } from "../LedgerStudyPreviewPanel";

function makeStudy(overrides: Partial<Study> = {}): Study {
  return {
    id: "study-1",
    title: "Example Study",
    authors: "Smith, Lee",
    year: 2024,
    status: "pending",
    quality: "Medium",
    details: {
      abstract: "A concise abstract for preview testing.",
      journal: "JAMA",
      ...overrides.details,
    },
    ...overrides,
  };
}

describe("LedgerStudyPreviewPanel", () => {
  it("renders the snapshot and actions for the selected study", () => {
    const study = makeStudy();
    const onClose = vi.fn();
    const onOpenFiles = vi.fn();

    render(
      <LedgerStudyPreviewPanel
        study={study}
        detailHref="/project/project-1/ledger/study-1?filter=meets-criteria"
        onClose={onClose}
        onOpenFiles={onOpenFiles}
      />,
    );

    expect(screen.getByRole("dialog", { name: "Example Study preview" })).toBeDefined();
    expect(screen.getByText("Study Preview")).toBeDefined();
    expect(screen.getByText("A concise abstract for preview testing.")).toBeDefined();
    expect(
      screen
        .getByRole("link", { name: /Open full study/i })
        .getAttribute("href"),
    ).toBe("/project/project-1/ledger/study-1?filter=meets-criteria");

    fireEvent.click(screen.getByRole("button", { name: /Manage files/i }));
    expect(onOpenFiles).toHaveBeenCalledWith(study);
  });

  it("closes from escape and explicit close controls", () => {
    const study = makeStudy();
    const onClose = vi.fn();

    render(
      <LedgerStudyPreviewPanel
        study={study}
        detailHref="/project/project-1/ledger/study-1"
        onClose={onClose}
        onOpenFiles={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(
      screen.getByRole("button", { name: "Close preview for Example Study" }),
    );

    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
