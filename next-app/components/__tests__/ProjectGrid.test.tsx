// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectGrid } from "../ProjectGrid";

vi.mock("next/link", async () => {
  const { nextLinkPrefetchMock } = await import("@/test-utils/next-link-prefetch-mock");
  return nextLinkPrefetchMock;
});

vi.mock("@/components/project/SampleReviewCard", () => ({
  SampleReviewCard: () => null,
}));

describe("ProjectGrid", () => {
  it("renders the create-new entry as a semantic button", () => {
    const onNewProject = vi.fn();

    render(
      <ProjectGrid
        projects={[]}
        viewMode="grid"
        onNewProject={onNewProject}
        showSampleCard={false}
      />,
    );

    const createButton = screen.getByRole("button", { name: "Create New Project" });
    fireEvent.click(createButton);

    expect(onNewProject).toHaveBeenCalledTimes(1);
  });

  it("disables route prefetch on project cards", () => {
    render(
      <ProjectGrid
        projects={[
          {
            id: "project-1",
            name: "Alpha Review",
            status: "ready",
            statusText: "Status: Review Ready",
            modified: "2026-03-01T00:00:00.000Z",
            created: "2026-03-01T00:00:00.000Z",
          },
        ]}
        viewMode="grid"
        onNewProject={() => {}}
        showSampleCard={false}
      />,
    );

    const projectLink = screen.getByRole("link", { name: "Open project Alpha Review" });
    expect(projectLink.getAttribute("href")).toBe("/project/project-1");
    expect(projectLink.getAttribute("data-prefetch")).toBe("false");
  });
});
