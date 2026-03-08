// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SampleReviewCard } from "../SampleReviewCard";
import styles from "@/components/ProjectGrid.module.css";

const {
  mockPush,
  mockRefresh,
  mockOpenOrCreateDemoProjectAction,
  mockUseProjects,
  mockDismissSampleCard,
  mockIsSampleCardDismissed,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockRefresh: vi.fn(async () => {}),
  mockOpenOrCreateDemoProjectAction: vi.fn(),
  mockUseProjects: vi.fn(),
  mockDismissSampleCard: vi.fn(),
  mockIsSampleCardDismissed: vi.fn(() => false),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

vi.mock("@/app/actions/demo", () => ({
  openOrCreateDemoProjectAction: mockOpenOrCreateDemoProjectAction,
}));

vi.mock("@/contexts/ProjectsContext", () => ({
  useProjects: mockUseProjects,
}));

vi.mock("@/lib/demo/sample-card", () => ({
  dismissSampleCard: mockDismissSampleCard,
  isSampleCardDismissed: mockIsSampleCardDismissed,
}));

describe("SampleReviewCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSampleCardDismissed.mockReturnValue(false);
    mockUseProjects.mockReturnValue({
      projects: [],
      refresh: mockRefresh,
    });
  });

  it("uses separate open and dismiss buttons (no nested interactive controls)", async () => {
    mockOpenOrCreateDemoProjectAction.mockResolvedValue({
      success: true,
      data: { id: "demo-project-id" },
    });

    render(<SampleReviewCard viewMode="grid" />);

    const openButton = screen.getByRole("button", { name: "Open sample review" });
    const dismissButton = screen.getByRole("button", { name: "Dismiss sample review card" });
    expect(openButton.contains(dismissButton)).toBe(false);

    fireEvent.click(openButton);

    await waitFor(() => {
      expect(mockOpenOrCreateDemoProjectAction).toHaveBeenCalledTimes(1);
      expect(mockRefresh).toHaveBeenCalledTimes(1);
    });
    expect(mockPush).toHaveBeenCalledWith("/project/demo-project-id");
  });

  it("uses a dedicated sample entry structure instead of reusing the new-project card scaffold", () => {
    render(<SampleReviewCard viewMode="grid" />);

    const card = screen.getByRole("button", { name: "Open sample review" }).parentElement;
    expect(card?.className).toContain(styles.sampleEntryCard);
    expect(card?.className).not.toContain(styles.newProjectCard);
  });

  it("dismisses the card without triggering open behavior", () => {
    render(<SampleReviewCard viewMode="grid" />);

    fireEvent.click(screen.getByRole("button", { name: "Dismiss sample review card" }));

    expect(mockDismissSampleCard).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Open sample review" })).toBeNull();
    expect(mockOpenOrCreateDemoProjectAction).not.toHaveBeenCalled();
  });

  it("renders an inline error when sample opening fails", async () => {
    mockOpenOrCreateDemoProjectAction.mockResolvedValue({
      success: false,
      error: "failure",
    });

    render(<SampleReviewCard viewMode="grid" />);
    fireEvent.click(screen.getByRole("button", { name: "Open sample review" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toContain("Unable to open sample review. Please try again.");
    });
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("hides the entry card when a scoped demo project already exists", () => {
    mockUseProjects.mockReturnValue({
      projects: [
        {
          id: "demo-project-id",
          demoKey: "sample-yoga-anxiety",
          name: "Yoga for Anxiety",
          status: "ready",
          statusText: "Sample",
          modified: "2026-03-09T00:00:00.000Z",
          created: "2026-03-09T00:00:00.000Z",
        },
      ],
      refresh: mockRefresh,
    });

    render(<SampleReviewCard viewMode="grid" />);

    expect(screen.queryByRole("button", { name: "Open sample review" })).toBeNull();
  });
});
