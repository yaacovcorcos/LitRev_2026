// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HomeClient } from "../HomeClient";
import type { HomeWorkspaceBootstrap } from "@/types/home-bootstrap";

const {
  mockPush,
  mockReplace,
  mockRefreshRouter,
  mockUseProjects,
  mockUseSession,
  mockProjectGrid,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockRefreshRouter: vi.fn(),
  mockUseProjects: vi.fn(),
  mockUseSession: vi.fn(),
  mockProjectGrid: vi.fn(({ showSampleCard }: { showSampleCard?: boolean }) => (
    <div data-testid="project-grid">{showSampleCard !== false ? "sample:on" : "sample:off"}</div>
  )),
}));

vi.mock("next/link", async () => {
  const { nextLinkPrefetchMock } = await import("@/test-utils/next-link-prefetch-mock");
  return nextLinkPrefetchMock;
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: mockRefreshRouter,
  }),
}));

vi.mock("@/contexts/ProjectsContext", () => ({
  useProjects: mockUseProjects,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: mockUseSession,
  },
}));

vi.mock("@/app/actions/demo", () => ({
  openOrCreateDemoProjectAction: vi.fn(async () => ({ success: true, data: { id: "demo-project" } })),
}));

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("@/components/TopBar", () => ({
  TopBar: ({ title, actions }: { title: string; actions?: ReactNode }) => (
    <div>
      <div>{title}</div>
      {actions}
    </div>
  ),
}));

vi.mock("@/components/ControlsBar", () => ({
  ControlsBar: ({ rightAction }: { rightAction?: ReactNode }) => (
    <div data-testid="controls-bar">
      {rightAction}
    </div>
  ),
}));

vi.mock("@/components/ProjectGrid", () => ({
  ProjectGrid: (props: { showSampleCard?: boolean }) => mockProjectGrid(props),
}));

vi.mock("@/components/Modal", () => ({
  Modal: ({ isOpen, children }: { isOpen: boolean; children: ReactNode }) => (
    <div data-testid="modal">{isOpen ? children : null}</div>
  ),
}));

describe("Home entry UX", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();

    mockUseSession.mockReturnValue({
      data: { user: { name: "Alex Doe" } },
      isPending: false,
    });

    mockUseProjects.mockReturnValue({
      projects: [],
      authState: "authenticated",
      homeBootstrapState: "loaded_empty",
      usedSeededBootstrap: true,
      addProject: vi.fn(async () => null),
      isInitialized: true,
      isLoadingProjects: false,
      projectsError: null,
      refresh: vi.fn(async () => {}),
      migrationStatus: "done",
      migrationError: null,
      retryMigration: vi.fn(async () => {}),
    });
  });

  const makeBootstrap = (overrides: Partial<HomeWorkspaceBootstrap> = {}): HomeWorkspaceBootstrap => ({
    authState: "authenticated",
    homeBootstrapState: "loaded_empty",
    initialProjects: [],
    initialProjectsLoaded: true,
    loadedAt: Date.now(),
    userName: "Alex Doe",
    error: null,
    ...overrides,
  });

  it("shows a dedicated new-user welcome screen and can enter workspace", async () => {
    const { container } = render(<HomeClient bootstrap={makeBootstrap()} shouldOpenFromQuery={false} />);

    expect(screen.queryByTestId("app-shell")).toBeNull();
    expect(screen.getByText("Start a new review")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enter workspace without creating a project" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Enter workspace without creating a project" }));

    await waitFor(() => {
      expect(screen.getByTestId("app-shell")).toBeTruthy();
    });
    expect(screen.getByTestId("project-grid").textContent).toContain("sample:on");
    expect(container.querySelector('.surface-root[data-surface-height="shell"]')).toBeTruthy();
    expect(container.querySelector('.surface-scroll-body[data-surface-padding="responsive"]')).toBeTruthy();
  });

  it("shows a continue card for returning users with a valid last project", () => {
    window.localStorage.setItem("litrev:lastProjectId", "p2");
    mockUseProjects.mockReturnValue({
      projects: [
        {
          id: "p1",
          name: "First Project",
          status: "ready",
          statusText: "Status: Review Ready",
          modified: "2026-02-20T00:00:00.000Z",
          created: "2026-02-20T00:00:00.000Z",
        },
        {
          id: "p2",
          name: "Second Project",
          status: "ready",
          statusText: "Status: Review Ready",
          modified: "2026-02-21T00:00:00.000Z",
          created: "2026-02-21T00:00:00.000Z",
        },
      ],
      authState: "authenticated",
      homeBootstrapState: "loaded_nonempty",
      usedSeededBootstrap: true,
      addProject: vi.fn(async () => null),
      isInitialized: true,
      isLoadingProjects: false,
      projectsError: null,
      refresh: vi.fn(async () => {}),
      migrationStatus: "done",
      migrationError: null,
      retryMigration: vi.fn(async () => {}),
    });

    render(
      <HomeClient
        bootstrap={makeBootstrap({
          homeBootstrapState: "loaded_nonempty",
          initialProjects: [
            {
              id: "p1",
              name: "First Project",
              status: "ready",
              statusText: "Status: Review Ready",
              modified: "2026-02-20T00:00:00.000Z",
              created: "2026-02-20T00:00:00.000Z",
            },
            {
              id: "p2",
              name: "Second Project",
              status: "ready",
              statusText: "Status: Review Ready",
              modified: "2026-02-21T00:00:00.000Z",
              created: "2026-02-21T00:00:00.000Z",
            },
          ],
        })}
        shouldOpenFromQuery={false}
      />,
    );

    const continueLink = screen.getByRole("link", { name: "Back to Second Project" });
    expect(continueLink.getAttribute("href")).toBe("/project/p2");
    expect(continueLink.getAttribute("data-prefetch")).toBe("false");
  });

  it("keeps existing users in the workspace state when seeded projects are available", () => {
    mockUseProjects.mockReturnValue({
      projects: [
        {
          id: "p-home",
          name: "Server Seeded Project",
          status: "ready",
          statusText: "Status: Review Ready",
          modified: "2026-02-21T00:00:00.000Z",
          created: "2026-02-21T00:00:00.000Z",
        },
      ],
      authState: "authenticated",
      homeBootstrapState: "loaded_nonempty",
      usedSeededBootstrap: true,
      addProject: vi.fn(async () => null),
      isInitialized: true,
      isLoadingProjects: false,
      projectsError: null,
      refresh: vi.fn(async () => {}),
      migrationStatus: "done",
      migrationError: null,
      retryMigration: vi.fn(async () => {}),
    });

    render(
      <HomeClient
        bootstrap={makeBootstrap({
          homeBootstrapState: "loaded_nonempty",
          initialProjects: [
            {
              id: "p-home",
              name: "Server Seeded Project",
              status: "ready",
              statusText: "Status: Review Ready",
              modified: "2026-02-21T00:00:00.000Z",
              created: "2026-02-21T00:00:00.000Z",
            },
          ],
        })}
        shouldOpenFromQuery={false}
      />,
    );

    expect(screen.queryByText("Start a new review")).toBeNull();
    expect(screen.getByTestId("app-shell")).toBeTruthy();
  });

  it("holds guided setup in the create modal while keeping blank creation available", async () => {
    const addProject = vi.fn(async (project: { name: string; description?: string }) => ({
      ...project,
      id: "proj-new",
      status: "ready",
      statusText: "Status: Review Ready",
      modified: "2026-03-29T00:00:00.000Z",
      created: "2026-03-29T00:00:00.000Z",
      papers: 0,
    }));

    mockUseProjects.mockReturnValue({
      projects: [],
      authState: "authenticated",
      homeBootstrapState: "loaded_empty",
      usedSeededBootstrap: true,
      addProject,
      isInitialized: true,
      isLoadingProjects: false,
      projectsError: null,
      refresh: vi.fn(async () => {}),
      migrationStatus: "done",
      migrationError: null,
      retryMigration: vi.fn(async () => {}),
    });

    render(<HomeClient bootstrap={makeBootstrap()} shouldOpenFromQuery={true} />);

    const guidedButton = screen.getByRole("button", { name: "Guided setup" });
    expect(guidedButton.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("Guided setup is on hold. Coming soon. Create a blank project for now.")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Held setup project" } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: "Review later" } });
    fireEvent.click(screen.getByRole("button", { name: "Create blank" }));

    await waitFor(() => {
      expect(addProject).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/project/proj-new");
    });
    expect(mockPush).not.toHaveBeenCalledWith("/project/proj-new/onboarding");
  });
});
