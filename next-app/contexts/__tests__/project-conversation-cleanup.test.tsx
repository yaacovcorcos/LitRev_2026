// @vitest-environment jsdom
import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProjectConversationProvider } from "../ProjectConversationContext";

const { mockAbort } = vi.hoisted(() => ({
  mockAbort: vi.fn(),
}));

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
    panel: { collapsed: false, width: 400 },
  }),
  saveProjectConversationState: vi.fn(),
  createDefaultProjectConversationState: () => ({
    messages: [],
    panel: { collapsed: false, width: 400 },
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
  useProjectConversationStreamActions: (
    { abortControllerRef }: { abortControllerRef: { current: AbortController | null } }
  ) => {
    abortControllerRef.current = { abort: mockAbort } as unknown as AbortController;
    return {
      sendMessage: vi.fn(),
      cancelStream: vi.fn(),
      handleReviewArtifact: vi.fn(),
      handleUndoArtifact: vi.fn(),
      approveArtifactsBatch: vi.fn(),
      executePlan: vi.fn(),
      reconnectRun: vi.fn(),
    };
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <ProjectConversationProvider projectId="project-1">
      {children}
    </ProjectConversationProvider>
  );
}

describe("ProjectConversation cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("aborts the live controller on unmount", () => {
    const { unmount } = render(<div>child</div>, { wrapper });

    expect(mockAbort).not.toHaveBeenCalled();

    unmount();

    expect(mockAbort).toHaveBeenCalledTimes(1);
  });
});
