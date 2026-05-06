// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthScreen } from "../AuthScreen";

const {
  mockMagicLink,
  mockRouterReplace,
  mockSocial,
  mockUseSearchParams,
  mockUseSession,
} = vi.hoisted(() => ({
  mockMagicLink: vi.fn(),
  mockRouterReplace: vi.fn(),
  mockSocial: vi.fn(),
  mockUseSearchParams: vi.fn(),
  mockUseSession: vi.fn(),
}));

vi.mock("next/link", async () => {
  const { nextLinkPrefetchMock } = await import("@/test-utils/next-link-prefetch-mock");
  return nextLinkPrefetchMock;
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockRouterReplace,
  }),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      magicLink: mockMagicLink,
      social: mockSocial,
    },
    useSession: mockUseSession,
  },
}));

vi.mock("@/lib/mobile/foundation-reliability", () => ({
  recordFoundationRouteFlowCompleted: vi.fn(),
  useFoundationRouteReady: vi.fn(),
}));

describe("AuthScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseSession.mockReturnValue({ data: null, isPending: false });
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    mockMagicLink.mockResolvedValue({ error: null });
    mockSocial.mockResolvedValue({ error: null });
  });

  it("requests a magic link that can return new users to the protected callback", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("callbackUrl=/ai"));

    render(<AuthScreen mode="signup" />);

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "new-reader@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /create with\s*magic link/i }));

    await waitFor(() => {
      expect(mockMagicLink).toHaveBeenCalledWith({
        email: "new-reader@example.com",
        callbackURL: "/ai",
        errorCallbackURL: "/login?callbackUrl=%2Fai",
        newUserCallbackURL: "/ai",
      });
    });
  });

  it("explains expired magic-link callbacks on the login screen", () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams("callbackUrl=/ai&error=EXPIRED_TOKEN"),
    );

    render(<AuthScreen mode="signin" />);

    expect(screen.getByRole("alert").textContent).toContain(
      "That sign-in link expired. Send yourself a new magic link.",
    );
  });

  it("shows a safe fallback for unknown magic-link callback errors", () => {
    mockUseSearchParams.mockReturnValue(
      new URLSearchParams("callbackUrl=/ai&error=new_provider_error"),
    );

    render(<AuthScreen mode="signin" />);

    expect(screen.getByRole("alert").textContent).toContain(
      "We could not complete sign-in. Please send a new magic link.",
    );
  });
});
