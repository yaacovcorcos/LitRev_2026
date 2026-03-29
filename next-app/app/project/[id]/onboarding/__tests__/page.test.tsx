// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectOnboardingPage from "../page";
import { DEFAULT_ONBOARDING_STEP_STATUSES } from "@/lib/durable-route-state";
import { createDefaultProtocolData } from "@/types/protocol";

const {
  mockGetProjectOnboardingStateAction,
  mockGetProtocolAction,
  mockGuidedSetupAvailable,
  mockProjectOnboardingClient,
} = vi.hoisted(() => ({
  mockGetProjectOnboardingStateAction: vi.fn(),
  mockGetProtocolAction: vi.fn(),
  mockGuidedSetupAvailable: vi.fn(() => false),
  mockProjectOnboardingClient: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => <a href={href} {...props}>{children}</a>,
}));

vi.mock("@/app/actions/onboarding", () => ({
  getProjectOnboardingStateAction: (...args: unknown[]) => mockGetProjectOnboardingStateAction(...args),
}));

vi.mock("@/app/actions/protocols", () => ({
  getProtocolAction: (...args: unknown[]) => mockGetProtocolAction(...args),
}));

vi.mock("../ProjectOnboardingClient", () => ({
  ProjectOnboardingClient: (props: unknown) => {
    mockProjectOnboardingClient(props);
    return <div>Onboarding client</div>;
  },
}));

vi.mock("@/components/ui/EmptyState", () => ({
  EmptyState: ({
    title,
    description,
    primaryAction,
    secondaryAction,
  }: {
    title: string;
    description?: string;
    primaryAction?: { label: string; href?: string };
    secondaryAction?: { label: string; href?: string };
  }) => (
    <div>
      <h1>{title}</h1>
      {description ? <p>{description}</p> : null}
      {primaryAction?.href ? <a href={primaryAction.href}>{primaryAction.label}</a> : null}
      {secondaryAction?.href ? <a href={secondaryAction.href}>{secondaryAction.label}</a> : null}
    </div>
  ),
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

describe("Project onboarding page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuidedSetupAvailable.mockReturnValue(false);
    mockGetProtocolAction.mockResolvedValue({ success: true, data: createDefaultProtocolData() });
    mockGetProjectOnboardingStateAction.mockResolvedValue({
      success: true,
      data: {
        stepStatuses: DEFAULT_ONBOARDING_STEP_STATUSES,
        derivedProfile: null,
      },
    });
  });

  it("shows a hold state and skips onboarding bootstrap when guided setup is unavailable", async () => {
    render(await ProjectOnboardingPage({ params: Promise.resolve({ id: "proj-1" }) }));

    expect(screen.getByText("Guided setup is on hold")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open workspace" }).getAttribute("href")).toBe("/project/proj-1");
    expect(mockGetProtocolAction).not.toHaveBeenCalled();
    expect(mockGetProjectOnboardingStateAction).not.toHaveBeenCalled();
    expect(mockProjectOnboardingClient).not.toHaveBeenCalled();
  });

  it("boots the onboarding client when guided setup is enabled", async () => {
    mockGuidedSetupAvailable.mockReturnValue(true);

    render(await ProjectOnboardingPage({ params: Promise.resolve({ id: "proj-1" }) }));

    expect(screen.getByText("Onboarding client")).toBeTruthy();
    expect(mockGetProtocolAction).toHaveBeenCalledWith("proj-1");
    expect(mockGetProjectOnboardingStateAction).toHaveBeenCalledWith("proj-1");
    expect(mockProjectOnboardingClient).toHaveBeenCalled();
  });
});
