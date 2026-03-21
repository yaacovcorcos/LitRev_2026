// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectDetailClient } from "../ProjectDetailClient";

const {
  mockUseProjects,
  mockUseProjectShell,
} = vi.hoisted(() => ({
  mockUseProjects: vi.fn(),
  mockUseProjectShell: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/contexts/ProjectsContext", () => ({
  useProjects: () => mockUseProjects(),
}));

vi.mock("@/contexts/ProjectShellContext", () => ({
  useProjectShell: () => mockUseProjectShell(),
}));

vi.mock("@/lib/mobile/foundation-reliability", () => ({
  useFoundationRouteReady: vi.fn(),
}));

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("@/components/TopBar", () => ({
  TopBar: ({ title, subtitle }: { title: string; subtitle: string }) => (
    <div>
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  ),
}));

vi.mock("@/components/project/RecentActivityPanel", () => ({
  RecentActivityPanel: () => <div data-testid="recent-activity-panel" />,
}));

vi.mock("@/components/project/DemoGuideCard", () => ({
  DemoGuideCard: () => null,
}));

vi.mock("@/components/ui/EmptyState", () => ({
  EmptyState: ({ title }: { title: string }) => <div>{title}</div>,
  EmptyStateSkeleton: ({ className }: { className?: string }) => <div className={className}>Loading shell</div>,
}));

function makeProject(id: string, name: string) {
  return {
    id,
    name,
    description: `${name} description`,
    status: "ready",
    created: "2026-03-01T00:00:00.000Z",
    modified: "2026-03-06T00:00:00.000Z",
    papers: 12,
    progress: { papers: 12 },
  };
}

function createOverviewStats(criteriaCount = 3) {
  return {
    draft: {
      data: {
        sections: [
          { key: "abstract", label: "Abstract", hasContent: true },
          { key: "methods", label: "Methods", hasContent: false },
        ],
        completedCount: 1,
        totalCount: 2,
      },
      error: null,
    },
    protocol: {
      data: {
        criteriaCount,
        hasResearchQuestion: true,
        updatedAt: "2026-03-06T00:00:00.000Z",
      },
      error: null,
    },
    ledger: {
      data: {
        totalStudies: 10,
        extractedCount: 4,
        screenedCount: 3,
        pendingCount: 3,
      },
      error: null,
    },
  };
}

describe("Project overview page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseProjectShell.mockReturnValue({ isEmbeddedInProjectShell: true });
    mockUseProjects.mockReturnValue({
      getProjectById: (id: string) => (id === "proj-1" ? makeProject(id, "Alpha") : makeProject(id, "Beta")),
      ensureProjectLoaded: vi.fn(),
      isLoadingProjects: false,
      projectsError: null,
    });
  });

  it("renders overview previews from bootstrapped props", () => {
    render(
      <ProjectDetailClient
        projectId="proj-1"
        initialOverviewStats={createOverviewStats()}
      />,
    );

    expect(screen.getByText("3 eligibility criteria defined")).toBeTruthy();
    expect(screen.getByText("4 / 10 extracted")).toBeTruthy();
  });

  it("updates previews from new bootstrapped props without stale client state", () => {
    const view = render(
      <ProjectDetailClient
        projectId="proj-1"
        initialOverviewStats={createOverviewStats(7)}
      />,
    );

    expect(screen.getByText("7 eligibility criteria defined")).toBeTruthy();

    view.rerender(
      <ProjectDetailClient
        projectId="proj-2"
        initialOverviewStats={createOverviewStats(2)}
      />,
    );

    expect(screen.getByText("2 eligibility criteria defined")).toBeTruthy();
    expect(screen.queryByText("7 eligibility criteria defined")).toBeNull();
  });
});
