// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockUseCommandPalette = vi.fn();
const mockUseProjectShell = vi.fn();
const mockUseProjectConversationSafe = vi.fn();
const mockUseHydrated = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ id: "project-1" }),
}));

vi.mock("@/contexts/CommandPaletteContext", () => ({
  useCommandPalette: () => mockUseCommandPalette(),
}));

vi.mock("@/contexts/ProjectShellContext", () => ({
  useProjectShell: () => mockUseProjectShell(),
}));

vi.mock("@/contexts/ProjectConversationContext", () => ({
  useProjectConversationSafe: () => mockUseProjectConversationSafe(),
}));

vi.mock("@/hooks/useGlobalShortcuts", () => ({
  useGlobalShortcuts: vi.fn(),
}));

vi.mock("@/hooks/useHydrated", () => ({
  useHydrated: () => mockUseHydrated(),
}));

vi.mock("@/lib/commands/registry", () => ({
  getGroupedCommands: vi.fn(() => ({
    navigation: [],
    agent: [],
    mode: [],
  })),
}));

import { CommandPalette } from "@/components/CommandPalette";

describe("CommandPalette", () => {
  beforeEach(() => {
    document.body.style.overflow = "";
    mockUseCommandPalette.mockReturnValue({
      isOpen: true,
      close: vi.fn(),
      sidebarToggle: null,
      copilotToggle: null,
    });
    mockUseProjectShell.mockReturnValue({
      isEmbeddedInProjectShell: true,
      activeTab: "overview",
      focusMode: "conversation",
      setActiveTab: vi.fn(),
      returnToConversation: vi.fn(),
    });
    mockUseProjectConversationSafe.mockReturnValue({
      isCollapsed: false,
      sendMessage: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    document.body.style.overflow = "";
  });

  it("stays hidden until hydration completes", () => {
    mockUseHydrated.mockReturnValue(false);

    render(<CommandPalette />);

    expect(screen.queryByRole("textbox", { name: "" })).toBeNull();
    expect(document.body.style.overflow).toBe("");
  });

  it("locks body scroll when opened after hydration and restores it on unmount", async () => {
    mockUseHydrated.mockReturnValue(true);

    const { unmount } = render(<CommandPalette />);

    await waitFor(() => {
      expect(screen.getByRole("combobox", { name: "Command palette" })).toBeTruthy();
    });
    expect(document.body.style.overflow).toBe("hidden");

    unmount();

    expect(document.body.style.overflow).toBe("");
  });
});
