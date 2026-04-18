// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { Study } from "@/types/ledger";
import { describe, expect, it, vi } from "vitest";
import { AddEvidenceModal } from "../AddEvidenceModal";

vi.mock("next/link", async () => {
  const { nextLinkPrefetchMock } = await import("@/test-utils/next-link-prefetch-mock");
  return nextLinkPrefetchMock;
});

const studies: Study[] = [
  {
    id: "study-1",
    title: "Alpha Trial",
    authors: "A. Author",
    year: 2024,
    status: "active",
    quality: "High",
    details: { journal: "Journal of Alpha Studies" },
  },
  {
    id: "study-2",
    title: "Beta Results",
    authors: "B. Author",
    year: 2025,
    status: "active",
    quality: "High",
    details: { journal: "Journal of Beta Results" },
  },
];

describe("AddEvidenceModal", () => {
  it("resets the search query when the modal closes and reopens", () => {
    const onClose = vi.fn();
    const onAddEvidence = vi.fn();
    const { rerender } = render(
      <AddEvidenceModal
        isOpen
        onClose={onClose}
        studies={studies}
        usedEvidenceIds={[]}
        onAddEvidence={onAddEvidence}
        projectId="proj-1"
      />,
    );

    const searchInput = screen.getByRole("textbox", { name: "Search references" });
    fireEvent.change(searchInput, { target: { value: "beta" } });
    expect(screen.queryByText("Alpha Trial")).toBeNull();
    expect(screen.getByText("Beta Results")).toBeTruthy();

    rerender(
      <AddEvidenceModal
        isOpen={false}
        onClose={onClose}
        studies={studies}
        usedEvidenceIds={[]}
        onAddEvidence={onAddEvidence}
        projectId="proj-1"
      />,
    );

    rerender(
      <AddEvidenceModal
        isOpen
        onClose={onClose}
        studies={studies}
        usedEvidenceIds={[]}
        onAddEvidence={onAddEvidence}
        projectId="proj-1"
      />,
    );

    expect((screen.getByRole("textbox", { name: "Search references" }) as HTMLInputElement).value).toBe("");
    expect(screen.getByText("Alpha Trial")).toBeTruthy();
    expect(screen.getByText("Beta Results")).toBeTruthy();
  });
});
