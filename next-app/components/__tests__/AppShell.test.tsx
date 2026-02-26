// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../AppShell";

const {
  mockUsePathname,
  mockRouterPush,
  mockRouterReplace,
  mockRouterRefresh,
  mockSignOut,
} = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
  mockRouterPush: vi.fn(),
  mockRouterReplace: vi.fn(),
  mockRouterRefresh: vi.fn(),
  mockSignOut: vi.fn(),
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

vi.mock("@/contexts/CommandPaletteContext", () => ({
  useCommandPalette: () => ({ registerSidebarToggle: vi.fn() }),
}));

vi.mock("../SlimHeader", () => ({
  SlimHeader: () => null,
}));

vi.mock("../MobileNav", () => ({
  MobileNav: ({
    onSignOut,
  }: {
    onSignOut?: () => void;
  }) => (
    <button type="button" data-testid="mobile-signout" onClick={onSignOut}>
      Sign out
    </button>
  ),
}));

vi.mock("../Sidebar", () => ({
  Sidebar: ({ collapsed }: { collapsed: boolean }) => (
    <div data-testid="sidebar" data-collapsed={collapsed ? "true" : "false"} />
  ),
}));

describe("AppShell default sidebar collapse", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
    mockRouterPush.mockReset();
    mockRouterReplace.mockReset();
    mockRouterRefresh.mockReset();
    mockSignOut.mockReset();
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
      expect(mockRouterReplace).toHaveBeenCalledWith("/login");
      expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
    });
  });
});
