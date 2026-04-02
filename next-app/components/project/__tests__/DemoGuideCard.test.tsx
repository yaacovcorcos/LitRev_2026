// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { DEMO_PROJECT_KEY } from "@/lib/demo/constants";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DemoGuideCard } from "../DemoGuideCard";

const mockUseProjects = vi.fn();

vi.mock("@/contexts/ProjectsContext", () => ({
  useProjects: () => mockUseProjects(),
}));

describe("DemoGuideCard", () => {
  beforeEach(() => {
    mockUseProjects.mockReset();
    window.localStorage.clear();
  });

  it("dismisses the current guide and persists that dismissal", () => {
    mockUseProjects.mockReturnValue({
      getProjectById: () => ({ demoKey: DEMO_PROJECT_KEY }),
    });

    render(
      <DemoGuideCard
        projectId="proj-1"
        guideId="guide-a"
        text="Track your evidence here."
      />,
    );

    expect(screen.getByText("Track your evidence here.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss guide note" }));

    expect(screen.queryByText("Track your evidence here.")).toBeNull();
    expect(window.localStorage.getItem("litrev:demo-guide-dismissed:proj-1:guide-a")).toBe("1");
  });

  it("treats each guide identity as its own dismissal state", () => {
    window.localStorage.setItem("litrev:demo-guide-dismissed:proj-1:guide-a", "1");
    mockUseProjects.mockReturnValue({
      getProjectById: () => ({ demoKey: DEMO_PROJECT_KEY }),
    });

    const { rerender } = render(
      <DemoGuideCard
        projectId="proj-1"
        guideId="guide-a"
        text="Guide A"
      />,
    );

    expect(screen.queryByText("Guide A")).toBeNull();

    rerender(
      <DemoGuideCard
        projectId="proj-1"
        guideId="guide-b"
        text="Guide B"
      />,
    );

    expect(screen.getByText("Guide B")).toBeTruthy();
  });
});
