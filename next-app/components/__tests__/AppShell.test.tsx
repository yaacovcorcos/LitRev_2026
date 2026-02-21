// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "../AppShell";

const { mockUsePathname } = vi.hoisted(() => ({
  mockUsePathname: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: mockUsePathname,
}));

vi.mock("@/contexts/CommandPaletteContext", () => ({
  useCommandPalette: () => ({ registerSidebarToggle: vi.fn() }),
}));

vi.mock("../SlimHeader", () => ({
  SlimHeader: () => null,
}));

vi.mock("../MobileNav", () => ({
  MobileNav: () => null,
}));

vi.mock("../Sidebar", () => ({
  Sidebar: ({ collapsed }: { collapsed: boolean }) => (
    <div data-testid="sidebar" data-collapsed={collapsed ? "true" : "false"} />
  ),
}));

describe("AppShell default sidebar collapse", () => {
  beforeEach(() => {
    mockUsePathname.mockReset();
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
});
