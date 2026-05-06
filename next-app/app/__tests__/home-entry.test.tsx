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
  mockGuidedSetupAvailable,
} = vi.hoisted(() => ({
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockRefreshRouter: vi.fn(),
  mockUseProjects: vi.fn(),
  mockUseSession: vi.fn(),
  mockProjectGrid: vi.fn(
    ({ onNewProject, showSampleCard }: { onNewProject: () => void; showSampleCard?: boolean }) => (
      <div data-testid="project-grid">
        <button type="button" onClick={onNewProject}>Create New Project</button>
        {showSampleCard !== false ? "sample:on" : "sample:off"}
      </div>
    ),
  ),
  mockGuidedSetupAvailable: vi.fn(() => false),
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

vi.mock("@/lib/guided-setup-availability", () => ({
  GUIDED_SETUP_HOLD_COPY: {
    launcherDescription: "Guided setup is on hold. Coming soon. Create a blank project for now.",
    routeTitle: "Guided setup is on hold",
    routeDescription:
      "This setup flow is temporarily unavailable while it is being reworked. You can continue in the project workspace for now.",
    workspaceActionLabel: "Open workspace",
    dashboardActionLabel: "Back to dashboard",
  },
  isGuidedSetupAvailable: () => mockGuidedSetupAvailable(),
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
  ProjectGrid: (props: { onNewProject: () => void; showSampleCard?: boolean }) => mockProjectGrid(props),
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
    mockGuidedSetupAvailable.mockReturnValue(false);

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

  it("opens the workspace shell immediately for new authenticated users", async () => {
    const { container } = render(<HomeClient bootstrap={makeBootstrap()} shouldOpenFromQuery={false} />);

    await waitFor(() => {
      expect(screen.getByTestId("app-shell")).toBeTruthy();
    });
    expect(screen.queryByText("Start a new review")).toBeNull();
    expect(screen.queryByRole("button", { name: "Enter workspace without creating a project" })).toBeNull();
    expect(screen.getByTestId("project-grid").textContent).toContain("sample:on");
    expect(container.querySelector('.surface-root[data-surface-height="shell"]')).toBeTruthy();
    expect(container.querySelector('.surface-scroll-body[data-surface-padding="responsive"]')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("keeps Home in the workspace shell when client auth is ahead of stale bootstrap auth", async () => {
    mockUseProjects.mockReturnValue({
      projects: [],
      authState: "unauthenticated",
      homeBootstrapState: "unauthenticated",
      usedSeededBootstrap: true,
      addProject: vi.fn(async () => null),
      isInitialized: true,
      isLoadingProjects: false,
      projectsError: null,
      refresh: vi.fn(async () => {}),
      migrationStatus: "pending",
      migrationError: null,
      retryMigration: vi.fn(async () => {}),
    });

    render(
      <HomeClient
        bootstrap={makeBootstrap({
          authState: "unauthenticated",
          homeBootstrapState: "unauthenticated",
          userName: null,
        })}
        shouldOpenFromQuery={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("app-shell")).toBeTruthy();
    });
    expect(screen.queryByText("Start a new review")).toBeNull();
    expect(screen.queryByRole("button", { name: "Enter workspace without creating a project" })).toBeNull();
    expect(screen.getByRole("button", { name: "Create New Project" })).toBeTruthy();
  });

  it("keeps Home in the workspace shell when bootstrap auth is ahead of stale client auth", async () => {
    mockUseSession.mockReturnValue({
      data: null,
      isPending: false,
    });
    mockUseProjects.mockReturnValue({
      projects: [],
      authState: "unauthenticated",
      homeBootstrapState: "unauthenticated",
      usedSeededBootstrap: true,
      addProject: vi.fn(async () => null),
      isInitialized: true,
      isLoadingProjects: false,
      projectsError: null,
      refresh: vi.fn(async () => {}),
      migrationStatus: "pending",
      migrationError: null,
      retryMigration: vi.fn(async () => {}),
    });

    render(
      <HomeClient
        bootstrap={makeBootstrap({
          authState: "authenticated",
          homeBootstrapState: "loaded_empty",
          userName: "Preview User",
        })}
        shouldOpenFromQuery={false}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId("app-shell")).toBeTruthy();
    });
    expect(screen.queryByText("Start a new review")).toBeNull();
    expect(screen.queryByText("Welcome, Preview")).toBeNull();
    expect(screen.queryByRole("button", { name: "Enter workspace without creating a project" })).toBeNull();
    expect(screen.getByRole("button", { name: "Create New Project" })).toBeTruthy();
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

    const guidedButton = screen.getByRole("button", { name: (name) => name.includes("Guided setup") });
    expect(guidedButton.hasAttribute("disabled")).toBe(true);
    expect(screen.queryByText("Guided setup is on hold. Coming soon. Create a blank project for now.")).toBeNull();

    fireEvent.mouseEnter(guidedButton.parentElement as HTMLElement);
    expect(screen.getByText("Guided setup is on hold. Coming soon. Create a blank project for now.")).toBeTruthy();
    fireEvent.mouseLeave(guidedButton.parentElement as HTMLElement);
    expect(screen.queryByText("Guided setup is on hold. Coming soon. Create a blank project for now.")).toBeNull();

    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Held setup project" } });
    fireEvent.change(screen.getByLabelText(/Description/), { target: { value: "Review later" } });
    fireEvent.click(screen.getByRole("button", { name: "Create blank" }));

    await waitFor(() => {
      expect(addProject).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/project/proj-new");
    });
    expect(mockPush).not.toHaveBeenCalledWith("/project/proj-new/onboarding");
  });

  it("offers guided setup as an explicit create-modal action when available", async () => {
    mockGuidedSetupAvailable.mockReturnValue(true);
    const addProject = vi.fn(async (project: { name: string; description?: string }) => ({
      ...project,
      id: "proj-guided",
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

    render(<HomeClient bootstrap={makeBootstrap()} shouldOpenFromQuery={false} />);

    expect(mockPush).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create New Project" }));
    expect(screen.getByRole("button", { name: "Guided setup" }).hasAttribute("disabled")).toBe(false);

    fireEvent.change(screen.getByLabelText("Project name"), { target: { value: "Guided project" } });
    fireEvent.click(screen.getByRole("button", { name: "Guided setup" }));

    await waitFor(() => {
      expect(addProject).toHaveBeenCalled();
      expect(mockPush).toHaveBeenCalledWith("/project/proj-guided/onboarding");
    });
  });
});
