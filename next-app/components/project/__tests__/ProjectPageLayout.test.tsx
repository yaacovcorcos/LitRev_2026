// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProjectPageLayout } from "../ProjectPageLayout";

const mockUseProjectShell = vi.fn();
const mockUseProjectCopilot = vi.fn();

vi.mock("@/contexts/ProjectShellContext", () => ({
  useProjectShell: () => mockUseProjectShell(),
}));

vi.mock("@/contexts/ProjectCopilotContext", () => ({
  useProjectCopilot: () => mockUseProjectCopilot(),
}));

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("@/components/ProjectCopilot", () => ({
  ProjectCopilot: () => <div data-testid="project-copilot">Copilot</div>,
}));

vi.mock("@/components/ui/ResizableSplitter", () => ({
  ResizableSplitter: () => <div data-testid="resizable-splitter" />,
}));

function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    writable: true,
    value: width,
  });
}

describe("ProjectPageLayout", () => {
  it("returns embedded content directly when inside the project shell", () => {
    mockUseProjectShell.mockReturnValue({ isEmbeddedInProjectShell: true });
    mockUseProjectCopilot.mockReturnValue({ isCollapsed: false, panelWidth: 360, setPanelWidth: vi.fn() });

    render(
      <ProjectPageLayout>
        <div>Embedded child</div>
      </ProjectPageLayout>,
    );

    expect(screen.queryByTestId("app-shell")).toBeNull();
    expect(screen.getByText("Embedded child")).toBeTruthy();
  });

  it("lets the child route own scroll and collapses the copilot only on phone when requested", async () => {
    setViewportWidth(390);
    mockUseProjectShell.mockReturnValue({ isEmbeddedInProjectShell: false });
    mockUseProjectCopilot.mockReturnValue({ isCollapsed: false, panelWidth: 360, setPanelWidth: vi.fn() });

    render(
      <ProjectPageLayout
        copilot={{
          page: "protocol",
          contextDisplay: "Protocol",
          inputPlaceholder: "Ask about your protocol…",
          emptyState: { icon: "assignment", title: "Title", description: "Desc", suggestions: [] },
        }}
        contentScrollMode="child"
        copilotCollapseMode="phone-only"
      >
        <div>Protocol child</div>
      </ProjectPageLayout>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("project-page-layout-grid").getAttribute("data-viewport-class")).toBe("phone");
    });

    expect(screen.getByTestId("project-page-layout-grid").getAttribute("data-copilot-collapse-mode")).toBe("phone-only");
    expect(screen.getByTestId("project-page-layout-content").getAttribute("data-scroll-owner")).toBe("child");
    expect(screen.getByTestId("project-copilot")).toBeTruthy();
  });

  it("updates the standalone viewport class when the viewport changes", async () => {
    setViewportWidth(1024);
    mockUseProjectShell.mockReturnValue({ isEmbeddedInProjectShell: false });
    mockUseProjectCopilot.mockReturnValue({ isCollapsed: false, panelWidth: 360, setPanelWidth: vi.fn() });

    render(
      <ProjectPageLayout
        copilot={{
          page: "protocol",
          contextDisplay: "Protocol",
          inputPlaceholder: "Ask about your protocol…",
          emptyState: { icon: "assignment", title: "Title", description: "Desc", suggestions: [] },
        }}
        copilotCollapseMode="phone-only"
      >
        <div>Protocol child</div>
      </ProjectPageLayout>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("project-page-layout-grid").getAttribute("data-viewport-class")).toBe("compact");
    });

    setViewportWidth(390);
    fireEvent(window, new Event("resize"));

    await waitFor(() => {
      expect(screen.getByTestId("project-page-layout-grid").getAttribute("data-viewport-class")).toBe("phone");
    });
  });

  it("keeps the viewport class unknown outside phone-only collapse mode", () => {
    setViewportWidth(390);
    mockUseProjectShell.mockReturnValue({ isEmbeddedInProjectShell: false });
    mockUseProjectCopilot.mockReturnValue({ isCollapsed: false, panelWidth: 360, setPanelWidth: vi.fn() });

    render(
      <ProjectPageLayout
        copilot={{
          page: "protocol",
          contextDisplay: "Protocol",
          inputPlaceholder: "Ask about your protocol…",
          emptyState: { icon: "assignment", title: "Title", description: "Desc", suggestions: [] },
        }}
      >
        <div>Protocol child</div>
      </ProjectPageLayout>,
    );

    expect(screen.getByTestId("project-page-layout-grid").getAttribute("data-viewport-class")).toBe("unknown");
  });
});
