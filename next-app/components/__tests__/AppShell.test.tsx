// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../AppShell";

const {
  mockUsePathname,
  mockRouterPush,
  mockRouterReplace,
  mockRouterRefresh,
  mockSignOut,
  mockFetch,
} = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
  mockRouterPush: vi.fn(),
  mockRouterReplace: vi.fn(),
  mockRouterRefresh: vi.fn(),
  mockSignOut: vi.fn(),
  mockFetch: vi.fn(),
}));
const { mockClearAllContextCaptureHistory } = vi.hoisted(() => ({
  mockClearAllContextCaptureHistory: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockRouterPush,
    replace: mockRouterReplace,
    refresh: mockRouterRefresh,
  }),
  usePathname: mockUsePathname,
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signOut: mockSignOut,
  },
}));

vi.mock("@/lib/context-capture/history", () => ({
  clearAllContextCaptureHistory: mockClearAllContextCaptureHistory,
}));

vi.mock("@/contexts/CommandPaletteContext", () => ({
  useCommandPalette: () => ({ registerSidebarToggle: vi.fn() }),
}));

vi.mock("../SlimHeader", () => ({
  SlimHeader: () => null,
}));

vi.mock("../MobileNav", () => ({
  MobileNav: ({
    onSignOut,
    links,
  }: {
    onSignOut?: () => void;
    links: Array<{ navKey: string }>;
  }) => (
    <div>
      <button type="button" data-testid="mobile-signout" onClick={onSignOut}>
        Sign out
      </button>
      <span data-testid="mobile-has-admin">
        {links.some((link) => link.navKey === "admin") ? "yes" : "no"}
      </span>
    </div>
  ),
}));

vi.mock("../Sidebar", () => ({
  Sidebar: ({
    collapsed,
    mainLinks,
  }: {
    collapsed: boolean;
    mainLinks: Array<{ navKey: string }>;
  }) => (
    <div
      data-testid="sidebar"
      data-collapsed={collapsed ? "true" : "false"}
      data-has-admin={mainLinks.some((link) => link.navKey === "admin") ? "true" : "false"}
    />
  ),
}));

describe("AppShell default sidebar collapse", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    mockRouterRefresh.mockReset();
    mockSignOut.mockReset();
    mockFetch.mockReset();
    mockClearAllContextCaptureHistory.mockReset();
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ isPlatformAdmin: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults expanded on the projects homepage", () => {
    mockUsePathname.mockReturnValue("/");

    render(
      <AppShell activeNav="projects">
        <div>content</div>
      </AppShell>,
    );

    expect(screen.getByTestId("sidebar").getAttribute("data-collapsed")).toBe("false");
  });

  it("defaults collapsed on non-home routes", () => {
    mockUsePathname.mockReturnValue("/library");

    render(
      <AppShell activeNav="library">
        <div>content</div>
      </AppShell>,
    );

    expect(screen.getByTestId("sidebar").getAttribute("data-collapsed")).toBe("true");
  });

  it("respects explicit initiallyCollapsed override", () => {
    mockUsePathname.mockReturnValue("/library");

    render(
      <AppShell activeNav="library" initiallyCollapsed={false}>
        <div>content</div>
      </AppShell>,
    );

    expect(screen.getByTestId("sidebar").getAttribute("data-collapsed")).toBe("false");
  });

  it("handles mobile sign out and redirects to login", async () => {
    mockUsePathname.mockReturnValue("/");
    mockSignOut.mockResolvedValue({ error: null });

    render(
      <AppShell activeNav="projects">
        <div>content</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByTestId("mobile-signout"));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockClearAllContextCaptureHistory).toHaveBeenCalledTimes(1);
      expect(mockRouterReplace).toHaveBeenCalledWith("/login");
      expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("hides admin nav when admin status is false", async () => {
    mockUsePathname.mockReturnValue("/");
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ isPlatformAdmin: false }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <AppShell activeNav="projects">
        <div>content</div>
      </AppShell>,
    );

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId("sidebar").getAttribute("data-has-admin")).toBe("false");
      expect(screen.getByTestId("mobile-has-admin").textContent).toBe("no");
    });
  });

  it("shows admin nav when admin status is true", async () => {
    mockUsePathname.mockReturnValue("/");
    mockFetch.mockResolvedValue(
      new Response(JSON.stringify({ isPlatformAdmin: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    render(
      <AppShell activeNav="projects">
        <div>content</div>
      </AppShell>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("sidebar").getAttribute("data-has-admin")).toBe("true");
      expect(screen.getByTestId("mobile-has-admin").textContent).toBe("yes");
    });
  });

  it("forces admin nav without status fetch when forceAdminNav is true", async () => {
    mockUsePathname.mockReturnValue("/admin");

    render(
      <AppShell activeNav="admin" forceAdminNav>
        <div>admin</div>
      </AppShell>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("sidebar").getAttribute("data-has-admin")).toBe("true");
    });
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
