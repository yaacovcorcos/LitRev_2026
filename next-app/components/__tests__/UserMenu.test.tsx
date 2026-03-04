// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { UserMenu } from "../UserMenu";

const { mockUseSession, mockSignOut, mockRouterReplace, mockRouterRefresh } = vi.hoisted(
  () => ({
    mockUseSession: vi.fn(),
    mockSignOut: vi.fn(),
    mockRouterReplace: vi.fn(),
    mockRouterRefresh: vi.fn(),
  }),
);

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    useSession: mockUseSession,
    signOut: mockSignOut,
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
    refresh: mockRouterRefresh,
  }),
}));

describe("UserMenu", () => {
  beforeEach(() => {
    mockUseSession.mockReset();
    mockSignOut.mockReset();
    mockRouterReplace.mockReset();
    mockRouterRefresh.mockReset();
  });

  it("renders a fallback sign-out button when session has no user", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });

    render(<ThemeProvider><UserMenu /></ThemeProvider>);

    const pill = screen.getByRole("button", { name: /account menu for account/i });
    expect(pill).toBeTruthy();

    fireEvent.click(pill);
    expect(screen.getByRole("menuitem", { name: /sign out/i })).toBeTruthy();
  });

  it("signs out and redirects to login", async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          name: "Ada Lovelace",
          email: "ada@example.com",
          image: null,
        },
      },
      isPending: false,
    });
    mockSignOut.mockResolvedValue({ error: null });

    render(<ThemeProvider><UserMenu /></ThemeProvider>);

    fireEvent.click(screen.getByRole("button", { name: /account menu for/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));

    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
      expect(mockRouterReplace).toHaveBeenCalledWith("/login");
      expect(mockRouterRefresh).toHaveBeenCalledTimes(1);
    });
  });

  it("shows an error when sign out fails", async () => {
    mockUseSession.mockReturnValue({
      data: {
        user: {
          name: "Ada Lovelace",
          email: "ada@example.com",
          image: null,
        },
      },
      isPending: false,
    });
    mockSignOut.mockResolvedValue({
      error: { message: "Sign out failed from API" },
    });

    render(<ThemeProvider><UserMenu /></ThemeProvider>);

    fireEvent.click(screen.getByRole("button", { name: /account menu for/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /sign out/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Sign out failed from API");
    expect(mockRouterReplace).not.toHaveBeenCalled();
  });

  it("cycles theme through light, light-carbon, and dark", () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });

    render(<ThemeProvider><UserMenu /></ThemeProvider>);

    fireEvent.click(screen.getByRole("button", { name: /account menu for account/i }));

    const themeButton = screen.getByRole("menuitem", { name: /theme: light/i });
    expect(themeButton.textContent).toContain("Light");

    fireEvent.click(themeButton);
    expect(screen.getByRole("menuitem", { name: /theme: light carbon/i }).textContent).toContain("Light Carbon");
    expect(localStorage.getItem("litrev-theme")).toBe("light-carbon");

    fireEvent.click(screen.getByRole("menuitem", { name: /theme: light carbon/i }));
    expect(screen.getByRole("menuitem", { name: /theme: dark/i }).textContent).toContain("Dark");
    expect(localStorage.getItem("litrev-theme")).toBe("dark");

    fireEvent.click(screen.getByRole("menuitem", { name: /theme: dark/i }));
    expect(screen.getByRole("menuitem", { name: /theme: light/i }).textContent).toContain("Light");
    expect(localStorage.getItem("litrev-theme")).toBe("light");
  });
});
