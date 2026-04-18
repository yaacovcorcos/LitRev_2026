// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectConversationProvider, useProjectConversation } from "../ProjectConversationContext";

const renderSnapshots: Array<{ collapsed: boolean; width: number }> = [];

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock("@/lib/project-conversation-storage", () => ({
  loadProjectConversationState: () => ({
    messages: [],
    panel: { collapsed: true, width: 444 },
  }),
  saveProjectConversationState: vi.fn(),
  createDefaultProjectConversationState: () => ({
    version: 1,
    messages: [],
    panel: { collapsed: false, width: 360 },
  }),
}));

vi.mock("@/app/actions/files", () => ({
  uploadChatAttachmentAction: vi.fn(),
  extractTextFromExistingFileAction: vi.fn(),
}));

vi.mock("@/app/actions/agent", () => ({
  getAutonomyConfigAction: vi.fn(async () => ({
    success: true,
    config: { preset: "assisted", toolOverrides: {} },
  })),
  updateAutonomyAction: vi.fn(),
}));

vi.mock("@/hooks/useProjectConversationManager", () => ({
  useProjectConversationManager: () => ({
    conversations: [],
    currentConversationId: null,
    isLoadingConversations: false,
    showConversationList: false,
    toggleConversationList: vi.fn(),
    selectConversation: vi.fn(),
    newConversation: vi.fn(),
    renameConversation: vi.fn(),
    deleteConversation: vi.fn(),
    branchConversation: vi.fn(),
    loadConversations: vi.fn(),
    setStudyFilter: vi.fn(),
    setCurrentConversationId: vi.fn(),
    setConversations: vi.fn(),
    markConversationActivity: vi.fn(),
    summarizeAndRefresh: vi.fn(),
    isSummarizing: false,
    isConversationLoading: false,
    hasMore: false,
    isLoadingOlder: false,
    loadOlderMessages: vi.fn(),
    currentConversationIdRef: { current: null },
    studyFilterRef: { current: null },
  }),
}));

vi.mock("@/hooks/useProjectConversationStreamActions", () => ({
  useProjectConversationStreamActions: () => ({
    sendMessage: vi.fn(),
    cancelStream: vi.fn(),
    handleReviewArtifact: vi.fn(),
    handleUndoArtifact: vi.fn(),
    approveArtifactsBatch: vi.fn(),
    executePlan: vi.fn(),
    reconnectRun: vi.fn(),
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ProjectConversationProvider projectId="project-1">
      {children}
    </ProjectConversationProvider>
  );
}

function Probe() {
  const { isCollapsed, panelWidth } = useProjectConversation();
  renderSnapshots.push({ collapsed: isCollapsed, width: panelWidth });
  return (
    <div data-testid="panel-state">
      {isCollapsed ? "collapsed" : "expanded"}:{panelWidth}
    </div>
  );
}

describe("ProjectConversation hydration boot", () => {
  beforeEach(() => {
    renderSnapshots.length = 0;
    window.localStorage.clear();
  });

  it("renders the server-safe default panel state before applying the persisted panel snapshot", async () => {
    render(<Probe />, { wrapper });

    expect(renderSnapshots[0]).toEqual({ collapsed: false, width: 360 });

    await waitFor(() => {
      expect(screen.getByTestId("panel-state").textContent).toBe("collapsed:444");
    });

    expect(renderSnapshots.at(-1)).toEqual({ collapsed: true, width: 444 });
  });
});
