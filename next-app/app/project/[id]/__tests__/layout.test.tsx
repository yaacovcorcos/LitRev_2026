// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProjectLayout from "../layout";

const {
  mockUseParams,
  mockUsePathname,
  mockUseRouter,
  mockUseProjectConversation,
  mockUseProjects,
  mockGetStudyAction,
  mockDeriveProjectShellBootState,
} = vi.hoisted(() => ({
  mockUseParams: vi.fn(),
  mockUsePathname: vi.fn(),
  mockUseRouter: vi.fn(),
  mockUseProjectConversation: vi.fn(),
  mockUseProjects: vi.fn(),
  mockGetStudyAction: vi.fn(),
  mockDeriveProjectShellBootState: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => mockUseParams(),
  usePathname: () => mockUsePathname(),
  useRouter: () => mockUseRouter(),
}));

vi.mock("@/contexts/ProjectConversationContext", () => ({
  ProjectConversationProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useProjectConversation: () => mockUseProjectConversation(),
}));

vi.mock("@/contexts/ProjectShellContext", () => ({
  ProjectShellProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/contexts/CommandPaletteContext", () => ({
  useCommandPalette: () => ({ registerCopilotToggle: vi.fn() }),
}));

vi.mock("@/contexts/ProjectsContext", () => ({
  useProjects: () => mockUseProjects(),
}));

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("@/components/project/ProjectTabBar", () => ({
  ProjectTabBar: ({ activeTab, focusMode }: { activeTab: string | null; focusMode: string }) => (
    <div data-testid="tab-bar" data-active-tab={activeTab ?? ""} data-focus-mode={focusMode} />
  ),
}));

vi.mock("@/components/project/ConversationMainView", () => ({
  ConversationMainView: () => <div data-testid="conversation-main-view" />,
}));

vi.mock("@/components/project/ProjectCopilotPanel", () => ({
  ProjectCopilotPanel: ({ contextDisplay }: { contextDisplay: string }) => (
    <div data-testid="project-copilot">{contextDisplay}</div>
  ),
}));

vi.mock("@/components/ui/ResizableSplitter", () => ({
  ResizableSplitter: () => <div data-testid="resizable-splitter" />,
}));

vi.mock("@/components/PopupChat", () => ({
  PopupChat: () => <div data-testid="popup-chat" />,
}));

vi.mock("@/contexts/PopupChatContext", () => ({
  PopupChatProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/project/DemoBanner", () => ({
  DemoBanner: () => <div data-testid="demo-banner" />,
}));

vi.mock("@/contexts/ProjectDataContext", () => ({
  ProjectDataProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock("@/app/actions/ledger", () => ({
  getStudyAction: (...args: unknown[]) => mockGetStudyAction(...args),
}));

vi.mock("@/lib/project-entry-boot-mode", () => ({
  deriveProjectShellBootState: (...args: unknown[]) => mockDeriveProjectShellBootState(...args),
}));

function setPathname(pathname: string) {
  mockUsePathname.mockReturnValue(pathname);
}

describe("ProjectLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseParams.mockReturnValue({ id: "proj-1" });
    mockUseRouter.mockReturnValue({ push: vi.fn(), replace: vi.fn() });
    mockUseProjects.mockReturnValue({
      getProjectById: () => ({ id: "proj-1", name: "Alpha", demoKey: null }),
      deleteProject: vi.fn(),
    });
    mockUseProjectConversation.mockReturnValue({
      currentConversationId: null,
      isCollapsed: false,
      panelWidth: 360,
      setPanelWidth: vi.fn(),
      toggleCollapsed: vi.fn(),
      setStudyFilter: vi.fn(),
      selectConversation: vi.fn().mockResolvedValue(true),
      newConversation: vi.fn().mockResolvedValue("conv-1"),
    });
    mockDeriveProjectShellBootState.mockReturnValue({
      bootMode: "workspace",
      focusMode: "view",
      activeTab: "ledger",
    });
  });

  it("drops stale study titles immediately when the study route changes", async () => {
    setPathname("/project/proj-1/ledger/study-1");
    mockGetStudyAction.mockResolvedValueOnce({
      success: true,
      data: { title: "Study One" },
    });

    const view = render(
      <ProjectLayout>
        <div>child</div>
      </ProjectLayout>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("project-copilot").textContent).toBe("Study One");
    });

    setPathname("/project/proj-1/ledger/study-2");
    mockGetStudyAction.mockResolvedValueOnce({
      success: true,
      data: { title: "Study Two" },
    });

    view.rerender(
      <ProjectLayout>
        <div>child</div>
      </ProjectLayout>,
    );

    expect(screen.getByTestId("project-copilot").textContent).toBe("Study");

    await waitFor(() => {
      expect(screen.getByTestId("project-copilot").textContent).toBe("Study Two");
    });
  });
});
