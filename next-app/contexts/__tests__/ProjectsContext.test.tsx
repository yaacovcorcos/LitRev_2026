// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectsProvider, useProjects } from "@/contexts/ProjectsContext";

const mocks = vi.hoisted(() => ({
  listProjectsAction: vi.fn(),
  listHomeProjectsAction: vi.fn(),
  runLegacyClaimBootstrapAction: vi.fn(),
  useSession: vi.fn(),
  usePathname: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: mocks.usePathname,
}));

vi.mock("@/app/actions/projects", () => ({
  createProjectAction: vi.fn(),
  deleteProjectAction: vi.fn(),
  getProjectAction: vi.fn(),
  listProjectsAction: mocks.listProjectsAction,
}));

vi.mock("@/app/actions/home", () => ({
  listHomeProjectsAction: mocks.listHomeProjectsAction,
  runLegacyClaimBootstrapAction: mocks.runLegacyClaimBootstrapAction,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: mocks.useSession,
  },
}));

function Consumer() {
  const { projects, homeBootstrapState } = useProjects();
  return (
    <div>
      <span data-testid="count">{projects.length}</span>
      <span data-testid="state">{homeBootstrapState}</span>
    </div>
  );
}

function injectTemplateBootstrap(bootstrap: object) {
  document.body.innerHTML = `<template id="litrev-home-bootstrap">${JSON.stringify(bootstrap).replace(/</g, "\\u003c")}</template>`;
}

describe("ProjectsProvider homepage seed behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.body.innerHTML = "";
    window.__litrevHomeBootstrap = undefined;

    mocks.usePathname.mockReturnValue("/");
    mocks.useSession.mockReturnValue({
      data: { user: { id: "u1", name: "Alex Doe" } },
      isPending: false,
    });
    mocks.listProjectsAction.mockResolvedValue({ success: true, data: [] });
    mocks.listHomeProjectsAction.mockResolvedValue({ success: true, data: [] });
    mocks.runLegacyClaimBootstrapAction.mockResolvedValue({ success: true, data: null });
  });

  it("uses a fresh homepage seed without issuing an initial home refresh", async () => {
    injectTemplateBootstrap({
      authState: "authenticated",
      homeBootstrapState: "loaded_nonempty",
      initialProjects: [
        {
          id: "p-seeded",
          name: "Seeded Project",
          status: "ready",
          statusText: "Status: Review Ready",
          modified: "2026-03-11T08:00:00.000Z",
          created: "2026-03-11T08:00:00.000Z",
        },
      ],
      initialProjectsLoaded: true,
      loadedAt: Date.now(),
      userName: "Alex Doe",
      error: null,
    });

    render(
      <ProjectsProvider>
        <Consumer />
      </ProjectsProvider>,
    );

    expect(screen.getByTestId("count").textContent).toBe("1");
    expect(screen.getByTestId("state").textContent).toBe("loaded_nonempty");

    await waitFor(() => {
      expect(mocks.listHomeProjectsAction).not.toHaveBeenCalled();
    });
  });

  it("refreshes a stale homepage seed in the background", async () => {
    injectTemplateBootstrap({
      authState: "authenticated",
      homeBootstrapState: "loaded_empty",
      initialProjects: [],
      initialProjectsLoaded: true,
      loadedAt: Date.now() - 20_000,
      userName: "Alex Doe",
      error: null,
    });
    mocks.listHomeProjectsAction.mockResolvedValue({
      success: true,
      data: [
        {
          id: "p-refreshed",
          name: "Fresh Project",
          status: "ready",
          statusText: "Status: Review Ready",
          modified: "2026-03-11T08:00:00.000Z",
          created: "2026-03-11T08:00:00.000Z",
        },
      ],
    });

    render(
      <ProjectsProvider>
        <Consumer />
      </ProjectsProvider>,
    );

    await waitFor(() => {
      expect(mocks.listHomeProjectsAction).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("count").textContent).toBe("1");
      expect(screen.getByTestId("state").textContent).toBe("loaded_nonempty");
    });
  });
});
