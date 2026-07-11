// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  getAiViewMocks,
  installAiViewTestLifecycle,
  renderAiView,
} from "./page-support";

installAiViewTestLifecycle();

const {
  mockGetGlobalWorkspaceContextAction,
  mockGetConversation,
  mockListConversations,
  mockSummarizeConversationAction,
  mockPush,
  mockReplace,
  mockUseProjects,
  mockUseSearchParams,
} = getAiViewMocks();

const COMPRESSION_ACTION_FAILED_MESSAGE =
  "LitRev could not compress this conversation. Your original chat is still here; try again.";
const COMPRESSION_LOAD_FAILED_MESSAGE =
  "LitRev compressed this conversation, but could not load the new summary. Your original chat is still here; open chat history or try again.";

describe("/ai page history and hydration", () => {
  it("hydrates the URL-addressed conversation after refresh", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("conversation=conv-1"));
    mockGetConversation.mockResolvedValueOnce({
      success: true,
      data: {
        id: "conv-1",
        title: "First chat",
        messages: [{
          id: "msg-1",
          role: "user",
          content: "Restored from the URL",
          createdAt: "2026-03-02T00:00:00.000Z",
        }],
        artifacts: [],
      },
    });

    renderAiView();
    fireEvent.click(screen.getByLabelText("Open chat history"));

    await waitFor(() => {
      expect(mockGetConversation).toHaveBeenCalledWith("conv-1");
      expect(screen.getByText("Restored from the URL")).toBeTruthy();
    });
  });

  it("restores a persisted cancelled run as a neutral stopped status", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("conversation=conv-1"));
    mockGetConversation.mockResolvedValueOnce({
      success: true,
      data: {
        id: "conv-1",
        title: "First chat",
        messages: [{
          id: "msg-cancelled",
          role: "user",
          content: "Keep this cancelled prompt",
          createdAt: "2026-03-02T00:00:00.000Z",
        }],
        artifacts: [],
        latestRun: {
          id: "run-cancelled",
          status: "cancelled",
          startedAt: "2026-03-02T00:00:01.000Z",
          completedAt: "2026-03-02T00:00:02.000Z",
        },
      },
    });

    renderAiView();
    fireEvent.click(screen.getByLabelText("Open chat history"));

    await waitFor(() => {
      expect(screen.getByText("Keep this cancelled prompt")).toBeTruthy();
      expect(screen.getByText("Stopped by you. Completed work is preserved.")).toBeTruthy();
      expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    });
  });

  it("writes selected conversation identity into browser history", async () => {
    renderAiView();
    fireEvent.click(screen.getByLabelText("Open chat history"));

    await waitFor(() => {
      expect(screen.getByText("First chat")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("First chat"));

    expect(mockPush).toHaveBeenCalledWith("/ai?conversation=conv-1");
    await waitFor(() => {
      expect(mockGetConversation).toHaveBeenCalledTimes(1);
    });
  });

  it("normalizes an unknown project scope to the safe global route", async () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("project=missing-project"));

    renderAiView();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/ai");
    });
    expect(screen.getByRole("button", { name: "Global scope" })).toBeTruthy();
  });

  it("normalizes an unknown project scope when the account has no projects", async () => {
    mockUseProjects.mockReturnValue({ projects: [], isLoadingProjects: false });
    mockUseSearchParams.mockReturnValue(new URLSearchParams("project=missing-project"));

    renderAiView();

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/ai");
    });
    expect(screen.getByRole("button", { name: "Global scope" })).toBeTruthy();
  });

  it("does not load conversations until the history sidebar is opened", async () => {
    renderAiView();

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
    renderAiView();

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

  it("offers a return link to the last opened project without changing AI scope", async () => {
    window.localStorage.setItem("litrev:lastProjectId", "proj-2");

    renderAiView();

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Back to Beta" }).getAttribute("href")).toBe("/project/proj-2");
    });

    expect(screen.getByRole("button", { name: "Global scope" })).toBeTruthy();
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

    renderAiView();

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

  it("keeps the source conversation visible when compressed summary loading fails", async () => {
    mockGetConversation
      .mockResolvedValueOnce({
        success: true,
        data: {
          id: "conv-1",
          title: "First chat",
          messages: [{
            id: "msg-1",
            role: "user",
            content: "Original question",
            createdAt: "2026-03-02T00:00:00.000Z",
          }],
          artifacts: [],
        },
      })
      .mockResolvedValueOnce({
        success: false,
        error: "summary conversation unavailable",
      });

    renderAiView();

    fireEvent.click(screen.getByLabelText("Open chat history"));
    await waitFor(() => {
      expect(screen.getByText("First chat")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("First chat"));
    await waitFor(() => {
      expect(screen.getByText("Original question")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "compress history" }));

    await waitFor(() => {
      expect(screen.getByText("Original question")).toBeTruthy();
      expect(screen.getByText(COMPRESSION_LOAD_FAILED_MESSAGE)).toBeTruthy();
    });

    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("keeps the source conversation visible with accurate messaging when compression fails to start", async () => {
    mockGetConversation.mockResolvedValueOnce({
      success: true,
      data: {
        id: "conv-1",
        title: "First chat",
        messages: [{
          id: "msg-1",
          role: "user",
          content: "Original question",
          createdAt: "2026-03-02T00:00:00.000Z",
        }],
        artifacts: [],
      },
    });
    mockSummarizeConversationAction.mockResolvedValueOnce({
      success: false,
      error: "compression service unavailable",
    });

    renderAiView();

    fireEvent.click(screen.getByLabelText("Open chat history"));
    await waitFor(() => {
      expect(screen.getByText("First chat")).toBeTruthy();
    });

    fireEvent.click(screen.getByText("First chat"));
    await waitFor(() => {
      expect(screen.getByText("Original question")).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "compress history" }));

    await waitFor(() => {
      expect(screen.getByText("Original question")).toBeTruthy();
      expect(screen.getByText(COMPRESSION_ACTION_FAILED_MESSAGE)).toBeTruthy();
    });

    expect(screen.queryByText(COMPRESSION_LOAD_FAILED_MESSAGE)).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });
});
