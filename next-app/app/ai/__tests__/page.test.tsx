// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import AIView from "../page";

const {
  mockListConversations,
  mockGetGlobalWorkspaceContextAction,
  mockUseProjects,
  mockPush,
} = vi.hoisted(() => ({
  mockListConversations: vi.fn(),
  mockGetGlobalWorkspaceContextAction: vi.fn(),
  mockUseProjects: vi.fn(),
  mockPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    return function DynamicStub(props: {
      children?: ReactNode;
      historyGroups?: Array<{ title: string; items: Array<{ id: string; title: string | null }> }>;
      onSelectConversation?: (conversationId: string) => void;
      isHistoryLoading?: boolean;
      projects?: Array<{ id: string; name: string }>;
      onSelectProject?: (projectId: string | null) => void;
    }) {
      if (props.projects && props.onSelectProject) {
        return (
          <div>
            <button type="button" onClick={() => props.onSelectProject?.(null)}>
              Global scope
            </button>
            {props.projects.map((project) => (
              <button key={project.id} type="button" onClick={() => props.onSelectProject?.(project.id)}>
                {project.name}
              </button>
            ))}
          </div>
        );
      }
      if (props.historyGroups) {
        return (
          <div>
            {props.isHistoryLoading ? <span>Loading conversations...</span> : null}
            {props.historyGroups.flatMap((group) =>
              group.items.map((item) => (
                <button key={item.id} type="button" onClick={() => props.onSelectConversation?.(item.id)}>
                  {item.title ?? "New conversation"}
                </button>
              ))
            )}
          </div>
        );
      }
      return props.children ?? null;
    };
  },
}));

vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div data-testid="app-shell">{children}</div>,
}));

vi.mock("@/components/copilot/CopilotInputCoreClient", () => ({
  CopilotInputCoreClient: ({ onReady }: { onReady?: () => void }) => (
    <button type="button" onClick={() => onReady?.()}>
      composer ready
    </button>
  ),
}));

vi.mock("@/contexts/ProjectsContext", () => ({
  useProjects: () => mockUseProjects(),
}));

vi.mock("@/app/actions/conversations", () => ({
  listConversations: (...args: unknown[]) => mockListConversations(...args),
  createConversation: vi.fn(),
  getConversation: vi.fn(),
  archiveConversation: vi.fn(),
  branchConversation: vi.fn(),
  updateConversationTitle: vi.fn(),
}));

vi.mock("@/app/actions/ai-assistant", () => ({
  getGlobalWorkspaceContextAction: (...args: unknown[]) => mockGetGlobalWorkspaceContextAction(...args),
}));

vi.mock("@/app/actions/agent", () => ({
  reviewArtifactAction: vi.fn(),
}));

vi.mock("@/app/actions/summarize-conversation", () => ({
  summarizeConversationAction: vi.fn(),
}));

vi.mock("@/lib/mobile/feature-flags", () => ({
  isMobileAiV2Enabled: () => false,
}));

vi.mock("@/lib/mobile/telemetry", () => ({
  isMobileTelemetryContext: () => false,
  recordMobileMetric: vi.fn(),
}));

function installMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

describe("/ai page deferred hydration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMatchMedia();
    window.localStorage.clear();
    mockUseProjects.mockReturnValue({
      projects: [
        { id: "proj-1", name: "Alpha" },
        { id: "proj-2", name: "Beta" },
      ],
    });
    mockListConversations.mockResolvedValue({
      success: true,
      data: [
        {
          id: "conv-1",
          title: "First chat",
          projectId: null,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-02T00:00:00.000Z",
        },
      ],
    });
    mockGetGlobalWorkspaceContextAction.mockResolvedValue({
      success: true,
      data: {
        contextText: "workspace context",
        projectCount: 2,
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not load conversations until the history sidebar is opened", async () => {
    render(<AIView />);

    expect(mockListConversations).not.toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Open chat history"));

    await waitFor(() => {
      expect(mockListConversations).toHaveBeenCalledWith({
        projectId: undefined,
        page: "ai",
      });
    });

    expect(screen.getByText("First chat")).toBeTruthy();
  });

  it("defers global workspace context until after composer-ready idle time", async () => {
    render(<AIView />);

    expect(mockGetGlobalWorkspaceContextAction).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "composer ready" }));
      await new Promise((resolve) => window.setTimeout(resolve, 200));
    });
    expect(mockGetGlobalWorkspaceContextAction).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(mockGetGlobalWorkspaceContextAction).toHaveBeenCalledTimes(1);
    }, { timeout: 1000 });
  });

  it("ignores stale conversation-list responses after a scope change", async () => {
    vi.useFakeTimers();

    let resolveGlobal: ((value: unknown) => void) | null = null;
    let resolveProject: ((value: unknown) => void) | null = null;

    mockListConversations
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveGlobal = resolve;
      }))
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveProject = resolve;
      }));

    render(<AIView />);

    fireEvent.click(screen.getByRole("button", { name: "composer ready" }));
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    fireEvent.click(screen.getByRole("button", { name: "Beta" }));
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(mockListConversations).toHaveBeenNthCalledWith(1, {
      projectId: undefined,
      page: "ai",
    });
    expect(mockListConversations).toHaveBeenNthCalledWith(2, {
      projectId: "proj-2",
      page: "ai",
    });

    await act(async () => {
      resolveProject?.({
        success: true,
        data: [{
          id: "project-conv",
          title: "Beta chat",
          projectId: "proj-2",
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-02T00:00:00.000Z",
        }],
      });
      await Promise.resolve();
    });

    await act(async () => {
      resolveGlobal?.({
        success: true,
        data: [{
          id: "global-conv",
          title: "Global chat",
          projectId: null,
          createdAt: "2026-03-01T00:00:00.000Z",
          updatedAt: "2026-03-02T00:00:00.000Z",
        }],
      });
      await Promise.resolve();
    });

    fireEvent.click(screen.getByLabelText("Open chat history"));

    expect(screen.getByText("Beta chat")).toBeTruthy();
    expect(screen.queryByText("Global chat")).toBeNull();
  });
});
