// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectDetail from "../page";

const {
  mockGetProjectOverviewStatsAction,
  mockUseProjects,
  mockUseProjectShell,
} = vi.hoisted(() => ({
  mockGetProjectOverviewStatsAction: vi.fn(),
  mockUseProjects: vi.fn(),
  mockUseProjectShell: vi.fn(),
}));

let currentProjectId = "proj-1";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: currentProjectId }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/app/actions/stats", () => ({
  getProjectOverviewStatsAction: (...args: unknown[]) => mockGetProjectOverviewStatsAction(...args),
}));

vi.mock("@/contexts/ProjectsContext", () => ({
  useProjects: () => mockUseProjects(),
}));

vi.mock("@/contexts/ProjectShellContext", () => ({
  useProjectShell: () => mockUseProjectShell(),
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

function createOverviewStats() {
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
        criteriaCount: 3,
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("Project overview page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentProjectId = "proj-1";
    mockUseProjectShell.mockReturnValue({ isEmbeddedInProjectShell: true });
    mockUseProjects.mockReturnValue({
      getProjectById: (id: string) => (id === currentProjectId ? makeProject(id, id === "proj-1" ? "Alpha" : "Beta") : undefined),
      isLoadingProjects: false,
      projectsError: null,
    });
  });

  it("loads overview previews with a single combined action", async () => {
    mockGetProjectOverviewStatsAction.mockResolvedValue({
      success: true,
      data: createOverviewStats(),
    });

    render(<ProjectDetail />);

    await waitFor(() => {
      expect(mockGetProjectOverviewStatsAction).toHaveBeenCalledWith("proj-1");
    });

    expect(mockGetProjectOverviewStatsAction).toHaveBeenCalledTimes(1);
    expect(screen.getByText("3 eligibility criteria defined")).toBeTruthy();
    expect(screen.getByText("4 / 10 extracted")).toBeTruthy();
  });

  it("ignores stale overview preview results after switching projects", async () => {
    const first = createDeferred<{ success: true; data: ReturnType<typeof createOverviewStats> }>();
    const second = createDeferred<{ success: true; data: ReturnType<typeof createOverviewStats> }>();

    mockGetProjectOverviewStatsAction
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);

    const view = render(<ProjectDetail />);

    await waitFor(() => {
      expect(mockGetProjectOverviewStatsAction).toHaveBeenCalledWith("proj-1");
    });

    currentProjectId = "proj-2";
    view.rerender(<ProjectDetail />);

    await waitFor(() => {
      expect(mockGetProjectOverviewStatsAction).toHaveBeenCalledWith("proj-2");
    });

    first.resolve({
      success: true,
      data: {
        ...createOverviewStats(),
        protocol: {
          data: {
            criteriaCount: 7,
            hasResearchQuestion: true,
            updatedAt: "2026-03-06T00:00:00.000Z",
          },
          error: null,
        },
      },
    });

    second.resolve({
      success: true,
      data: {
        ...createOverviewStats(),
        protocol: {
          data: {
            criteriaCount: 2,
            hasResearchQuestion: true,
            updatedAt: "2026-03-06T00:00:00.000Z",
          },
          error: null,
        },
      },
    });

    await waitFor(() => {
      expect(screen.getByText("2 eligibility criteria defined")).toBeTruthy();
    });

    expect(screen.queryByText("7 eligibility criteria defined")).toBeNull();
  });
});
