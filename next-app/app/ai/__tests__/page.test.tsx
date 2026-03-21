// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import AIView from "../page";

const {
  mockListConversations,
  mockCreateConversation,
  mockGetConversation,
  mockGetGlobalWorkspaceContextAction,
  mockUseProjects,
  mockPush,
  mockProcessAIStream,
  mockPollRunRecovery,
  mockFetch,
  mockIsProgressiveAnswerStreamingEnabled,
} = vi.hoisted(() => ({
  mockListConversations: vi.fn(),
  mockCreateConversation: vi.fn(),
  mockGetConversation: vi.fn(),
  mockGetGlobalWorkspaceContextAction: vi.fn(),
  mockUseProjects: vi.fn(),
  mockPush: vi.fn(),
  mockProcessAIStream: vi.fn(),
  mockPollRunRecovery: vi.fn(),
  mockFetch: vi.fn(),
  mockIsProgressiveAnswerStreamingEnabled: vi.fn(() => false),
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
      items?: Array<{
        type: string;
        id: string;
        content?: string;
        deliveryState?: string;
        message?: string;
        label?: string;
        question?: string;
        errorMeta?: { recoveryRecommendation?: string; activeRunId?: string; runId?: string };
      }>;
      suppressedProgressId?: string | null;
      onReconnectRun?: (item: { type: string; id: string; errorMeta?: { activeRunId?: string; runId?: string } }) => void;
      onContinueFromDurableStateRun?: (item: { type: string; id: string; errorMeta?: { activeRunId?: string; runId?: string } }) => void;
      onStopAndRetryRun?: (item: { type: string; id: string; errorMeta?: { activeRunId?: string; runId?: string } }) => void;
      onRetryLastMessage?: () => void;
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
      if (props.items) {
        return (
          <div>
            <div data-testid="timeline-suppressed-progress">{props.suppressedProgressId ?? ""}</div>
            {props.items.map((item) => {
              if (item.type === "user_message") {
                return <div key={item.id}>{item.content}</div>;
              }
              if (item.type === "assistant_message") {
                return <div key={item.id}>{item.deliveryState === "reserved" ? `reserved:${item.id}` : item.content}</div>;
              }
              if (item.type === "progress" && item.id !== props.suppressedProgressId) {
                return <div key={item.id}>{item.message}</div>;
              }
              if (item.type === "checkpoint") {
                return <div key={item.id}>{item.label}</div>;
              }
              if (item.type === "user_input_request") {
                return <div key={item.id}>{item.question}</div>;
              }
              if (item.type === "error") {
                return (
                  <div key={item.id}>
                    <span>{item.message}</span>
                    {item.errorMeta?.recoveryRecommendation === "reconnect" ? (
                      <button type="button" onClick={() => props.onReconnectRun?.(item)}>
                        Reconnect
                      </button>
                    ) : null}
                    {item.errorMeta?.recoveryRecommendation === "stop_and_retry" ? (
                      <button type="button" onClick={() => props.onStopAndRetryRun?.(item)}>
                        Stop & Retry
                      </button>
                    ) : null}
                    {item.errorMeta?.recoveryRecommendation === "continue_from_durable_state"
                      || item.errorMeta?.recoveryRecommendation === "continue_from_checkpoint" ? (
                      <button type="button" onClick={() => props.onContinueFromDurableStateRun?.(item)}>
                        Continue
                      </button>
                    ) : null}
                    {item.errorMeta?.recoveryRecommendation === "retry" ? (
                      <button type="button" onClick={() => props.onRetryLastMessage?.()}>
                        Retry
                      </button>
                    ) : null}
                  </div>
                );
              }
              return null;
            })}
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
  CopilotInputCoreClient: ({
    onReady,
    sendMessage,
    onQueueFollowUp,
    hasQueuedFollowUp,
    attachedStack,
    interactionLocked,
  }: {
    onReady?: () => void;
    sendMessage?: (text: string, page: "ai") => void | Promise<void>;
    onQueueFollowUp?: (payload: { text: string; page: "ai" }) => void | Promise<void>;
    hasQueuedFollowUp?: boolean;
    attachedStack?: "none" | "attached";
    interactionLocked?: boolean;
  }) => (
    <div
      data-testid="ai-composer"
      data-attached-stack={attachedStack ?? "none"}
      data-interaction-locked={interactionLocked ? "yes" : "no"}
    >
      <button type="button" onClick={() => onReady?.()}>
        composer ready
      </button>
      <button type="button" onClick={() => void sendMessage?.("Recover this run", "ai")}>
        send message
      </button>
      <button type="button" onClick={() => void onQueueFollowUp?.({ text: "Queue this next", page: "ai" })}>
        queue next
      </button>
      <div data-testid="ai-has-queued">{hasQueuedFollowUp ? "yes" : "no"}</div>
    </div>
  ),
}));

vi.mock("@/contexts/ProjectsContext", () => ({
  useProjects: () => mockUseProjects(),
}));

vi.mock("@/app/actions/conversations", () => ({
  listConversations: (...args: unknown[]) => mockListConversations(...args),
  createConversation: (...args: unknown[]) => mockCreateConversation(...args),
  getConversation: (...args: unknown[]) => mockGetConversation(...args),
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

vi.mock("@/lib/ai/stream-processor", () => ({
  processAIStream: (...args: unknown[]) => mockProcessAIStream(...args),
}));

vi.mock("@/lib/ai/run-recovery-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/ai/run-recovery-client")>("@/lib/ai/run-recovery-client");
  return {
    ...actual,
    pollRunRecovery: (...args: unknown[]) => mockPollRunRecovery(...args),
  };
});

vi.mock("@/lib/feature-flags", () => ({
  isProgressiveAnswerStreamingEnabled: () => mockIsProgressiveAnswerStreamingEnabled(),
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
    vi.stubGlobal("fetch", mockFetch);
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
    mockCreateConversation.mockResolvedValue({
      success: true,
      data: { id: "conv-new" },
    });
    mockGetConversation.mockResolvedValue({
      success: true,
      data: {
        id: "conv-1",
        title: "First chat",
        messages: [],
      },
    });
    mockFetch.mockResolvedValue({
      ok: true,
      body: {
        getReader: () => ({ read: vi.fn(), cancel: vi.fn() }),
      },
    });
    mockProcessAIStream.mockResolvedValue({
      runStatus: null,
      stopReason: null,
      terminalReason: "failed_network",
      errorMessage: null,
      errorMeta: null,
      actualModel: null,
      actualModelSource: "unknown",
    });
    mockPollRunRecovery.mockResolvedValue({
      outcome: "retry",
      response: null,
      lastAppliedSequence: -1,
    });
    mockIsProgressiveAnswerStreamingEnabled.mockReturnValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
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

  it("renders attached live progress above the composer without duplicating the inline progress row", async () => {
    mockProcessAIStream.mockImplementationOnce(async ({ onChunk }: {
      onChunk: (chunk: unknown) => void | Promise<void>;
    }) => {
      await onChunk({
        type: "progress",
        progressMessage: "Reviewing PubMed results",
        progressCurrent: 2,
        progressTotal: 3,
      });
      return {
        runStatus: null,
        stopReason: null,
        terminalReason: "failed_network",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      };
    });

    render(<AIView />);

    fireEvent.click(screen.getByRole("button", { name: "send message" }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeTruthy();
    });

    const status = screen.getByRole("status");
    const sendButton = screen.getByRole("button", { name: "send message" });
    const lane = document.querySelector('[data-composer-stack-lane="true"]');
    expect(lane?.contains(status)).toBe(true);
    expect(lane?.contains(screen.getByTestId("ai-composer"))).toBe(true);
    expect(status.getAttribute("data-stack-position")).toBe("top");
    expect(screen.getByTestId("ai-composer").getAttribute("data-attached-stack")).toBe("attached");
    expect(screen.getByText("Reviewing PubMed results")).toBeTruthy();
    expect(screen.getByText("2 of 3")).toBeTruthy();
    expect(screen.getByRole("progressbar")).toBeTruthy();
    expect(status.compareDocumentPosition(sendButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("timeline-suppressed-progress").textContent).not.toBe("");
    expect(screen.queryAllByText("Reviewing PubMed results")).toHaveLength(1);
  });

  it("does not append a false terminal failure after a recovered completed run", async () => {
    mockProcessAIStream.mockImplementation(async ({ onChunk }: {
      onChunk: (chunk: unknown) => void | Promise<void>;
    }) => {
      await onChunk({ type: "run_start", runId: "run-1", conversationId: "conv-new" });
      return {
        runStatus: null,
        stopReason: null,
        terminalReason: "failed_network",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      };
    });
    mockPollRunRecovery.mockImplementation(async ({ onTerminal }: {
      onTerminal: (chunk: unknown) => Promise<void>;
    }) => {
      await onTerminal({ type: "content", content: "Recovered answer." });
      await onTerminal({ type: "run_end", runStatus: "completed", stopReason: null });
      return {
        outcome: "recovered",
        response: {
          conversationId: "conv-new",
          runId: "run-1",
          runStatus: "completed",
          isActive: false,
          runPhase: "finalize",
          phaseEnteredAt: "2026-03-11T11:19:00.000Z",
          lastActivityAt: "2026-03-11T11:20:00.000Z",
          lastSequence: 2,
          replayableEvents: [],
          terminalEvent: {
            chunk: { type: "run_end", runStatus: "completed", stopReason: null },
          },
          recoveryRecommendation: "terminal",
          abnormalEndClassification: null,
        },
        lastAppliedSequence: 2,
      };
    });

    render(<AIView />);

    fireEvent.click(screen.getByRole("button", { name: "send message" }));

    await waitFor(() => {
      expect(screen.getByText("Recovered answer.")).toBeTruthy();
    });

    expect(screen.queryByText("Run interrupted. Reconnecting to the active run…")).toBeNull();
    expect(screen.queryByText("The stream ended unexpectedly. Retry to continue.")).toBeNull();
    expect(screen.queryByText("Run interrupted and recovery failed. You can retry safely now.")).toBeNull();
  });

  it("keeps recovered paused runs in a question state without a red failure", async () => {
    mockProcessAIStream.mockImplementation(async ({ onChunk }: {
      onChunk: (chunk: unknown) => void | Promise<void>;
    }) => {
      await onChunk({ type: "run_start", runId: "run-2", conversationId: "conv-new" });
      return {
        runStatus: null,
        stopReason: null,
        terminalReason: "failed_network",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      };
    });
    mockPollRunRecovery.mockImplementation(async ({ onReplay, onTerminal }: {
      onReplay: (chunk: unknown) => Promise<void>;
      onTerminal: (chunk: unknown) => Promise<void>;
    }) => {
      await onReplay({
        type: "checkpoint",
        checkpointLabel: "PubMed returned 18 results. Reviewing the strongest matches now.",
      });
      await onReplay({
        type: "user_input_required",
        userInputRequest: {
          callId: "ask-1",
          question: "Which study should I inspect first?",
          questionType: "single_choice",
        },
      });
      await onTerminal({ type: "run_end", runStatus: "paused", stopReason: "paused_for_input" });
      return {
        outcome: "recovered",
        response: {
          conversationId: "conv-new",
          runId: "run-2",
          runStatus: "paused",
          isActive: false,
          runPhase: "ask",
          phaseEnteredAt: "2026-03-11T11:24:00.000Z",
          lastActivityAt: "2026-03-11T11:25:00.000Z",
          lastSequence: 3,
          replayableEvents: [],
          terminalEvent: {
            chunk: { type: "run_end", runStatus: "paused", stopReason: "paused_for_input" },
          },
          recoveryRecommendation: "terminal",
          abnormalEndClassification: null,
        },
        lastAppliedSequence: 3,
      };
    });

    render(<AIView />);

    fireEvent.click(screen.getByRole("button", { name: "send message" }));

    await waitFor(() => {
      expect(screen.getByText("Which study should I inspect first?")).toBeTruthy();
    });

    expect(screen.getByText("PubMed returned 18 results. Reviewing the strongest matches now.")).toBeTruthy();
    expect(screen.queryByText("Run interrupted. Reconnecting to the active run…")).toBeNull();
    expect(screen.queryByText("The stream ended unexpectedly. Retry to continue.")).toBeNull();
    expect(screen.queryByText("Run interrupted and recovery failed. You can retry safely now.")).toBeNull();
    expect(screen.queryByRole("button", { name: "Continue" })).toBeNull();
  });

  it("replaces a reconnect checkpoint with stronger same-run stop-and-retry truth", async () => {
    mockProcessAIStream.mockImplementation(async ({ onChunk }: {
      onChunk: (chunk: unknown) => void | Promise<void>;
    }) => {
      await onChunk({ type: "run_start", runId: "run-3", conversationId: "conv-new" });
      await onChunk({
        type: "tool_result",
        toolName: "pubmed_search",
        toolResult: { callId: "tool-1", result: { ok: true } },
      });
      return {
        runStatus: null,
        stopReason: null,
        terminalReason: "failed_network",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      };
    });
    mockPollRunRecovery.mockResolvedValue({
      outcome: "needs_user_action",
      response: {
        conversationId: "conv-new",
        runId: "run-3",
        runStatus: "running",
        isActive: true,
        runPhase: "act",
        phaseEnteredAt: "2026-03-13T11:24:00.000Z",
        lastActivityAt: "2026-03-13T11:25:00.000Z",
        lastDurableProgressAt: "2026-03-13T11:20:00.000Z",
        finalizationState: "not_started",
        lastSequence: 2,
        replayableEvents: [],
        terminalEvent: null,
        recoveryRecommendation: "stop_and_retry",
        abnormalEndClassification: "no_forward_durable_progress",
      },
      lastAppliedSequence: 2,
    });

    render(<AIView />);

    fireEvent.click(screen.getByRole("button", { name: "send message" }));

    await waitFor(() => {
      expect(screen.getByText("The active run stopped making durable progress. Choose how to continue.")).toBeTruthy();
    });

    expect(screen.queryByText("Run interrupted. Reconnecting to the active run…")).toBeNull();
    expect(screen.queryByText("The stream ended unexpectedly. Retry to continue.")).toBeNull();
    expect(screen.queryAllByText("The active run stopped making durable progress. Choose how to continue.")).toHaveLength(1);
  });

  it("continues from the existing durable state without appending a duplicate user message", async () => {
    mockProcessAIStream
      .mockImplementationOnce(async ({ onChunk }: {
        onChunk: (chunk: unknown) => void | Promise<void>;
      }) => {
        await onChunk({ type: "run_start", runId: "run-4", conversationId: "conv-new" });
        return {
          runStatus: null,
          stopReason: null,
          terminalReason: "failed_network",
          errorMessage: null,
          errorMeta: null,
          actualModel: null,
          actualModelSource: "unknown",
        };
      })
      .mockImplementationOnce(async () => ({
        runStatus: null,
        stopReason: null,
        terminalReason: "completed",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      }));
    mockPollRunRecovery.mockResolvedValueOnce({
      outcome: "needs_user_action",
      response: {
        conversationId: "conv-new",
        runId: "run-4",
        runStatus: "running",
        isActive: true,
        runPhase: "finalize",
        phaseEnteredAt: "2026-03-14T10:24:00.000Z",
        lastActivityAt: "2026-03-14T10:25:00.000Z",
        lastDurableProgressAt: "2026-03-14T10:20:00.000Z",
        finalizationState: "failed",
        lastSequence: 2,
        replayableEvents: [],
        terminalEvent: null,
        recoveryRecommendation: "continue_from_durable_state",
        abnormalEndClassification: "finalization_failed",
      },
      lastAppliedSequence: 2,
    });

    render(<AIView />);

    fireEvent.click(screen.getByRole("button", { name: "send message" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    });

    expect(screen.getAllByText("Recover this run")).toHaveLength(1);

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    const secondRequest = mockFetch.mock.calls[1]?.[1] as { body?: string };
    const parsedBody = JSON.parse(secondRequest.body ?? "{}");
    expect(parsedBody.options).toMatchObject({
      continueFromRunId: "run-4",
      replaceRunId: "run-4",
      persistUserMessage: false,
      persistedUserMessageContent: "Recover this run",
    });
    expect(screen.getAllByText("Recover this run")).toHaveLength(1);
  });

  it("continues from the latest checkpoint without appending a duplicate user message", async () => {
    mockProcessAIStream
      .mockImplementationOnce(async ({ onChunk }: {
        onChunk: (chunk: unknown) => void | Promise<void>;
      }) => {
        await onChunk({ type: "run_start", runId: "run-5", conversationId: "conv-new" });
        return {
          runStatus: null,
          stopReason: null,
          terminalReason: "failed_network",
          errorMessage: null,
          errorMeta: null,
          actualModel: null,
          actualModelSource: "unknown",
        };
      })
      .mockImplementationOnce(async () => ({
        runStatus: null,
        stopReason: null,
        terminalReason: "completed",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      }));
    mockPollRunRecovery.mockResolvedValueOnce({
      outcome: "needs_user_action",
      response: {
        conversationId: "conv-new",
        runId: "run-5",
        runStatus: "running",
        isActive: true,
        runPhase: "finalize",
        phaseEnteredAt: "2026-03-14T10:24:00.000Z",
        lastActivityAt: "2026-03-14T10:25:00.000Z",
        lastDurableProgressAt: "2026-03-14T10:20:00.000Z",
        finalizationState: "failed",
        lastSequence: 2,
        replayableEvents: [],
        terminalEvent: null,
        recoveryRecommendation: "continue_from_checkpoint",
        abnormalEndClassification: "finalization_failed",
      },
      lastAppliedSequence: 2,
    });

    render(<AIView />);

    fireEvent.click(screen.getByRole("button", { name: "send message" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
    });

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Continue" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    const secondRequest = mockFetch.mock.calls[1]?.[1] as { body?: string };
    const parsedBody = JSON.parse(secondRequest.body ?? "{}");
    expect(parsedBody.options).toMatchObject({
      continueFromRunId: "run-5",
      replaceRunId: "run-5",
      persistUserMessage: false,
      persistedUserMessageContent: "Recover this run",
    });
  });

  it("elevates live progress above the composer and suppresses the matching inline timeline row", async () => {
    mockProcessAIStream.mockImplementation(async ({ onChunk }: {
      onChunk: (chunk: unknown) => void | Promise<void>;
    }) => {
      await onChunk({ type: "progress", progressMessage: "Searching PubMed", progressCurrent: 1, progressTotal: 3 });
      return {
        runStatus: null,
        stopReason: null,
        terminalReason: "failed_network",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      };
    });

    render(<AIView />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "send message" }));
    });

    await waitFor(() => {
      expect(screen.getByRole("status")).toBeTruthy();
    });

    expect(screen.getByText("Searching PubMed")).toBeTruthy();
    expect(screen.getByTestId("timeline-suppressed-progress").textContent).toMatch(/^progress-/);
    const timelineText = screen.getByTestId("timeline-suppressed-progress").parentElement?.textContent ?? "";
    expect(timelineText).not.toContain("Searching PubMedSearching PubMed");
  });

  it("renders a queued follow-up cap between live progress and the composer", async () => {
    mockProcessAIStream.mockImplementationOnce(async ({ onChunk }: {
      onChunk: (chunk: unknown) => void | Promise<void>;
    }) => {
      await onChunk({
        type: "progress",
        progressMessage: "Reading protocol...",
        progressCurrent: 1,
        progressTotal: 2,
      });
      return {
        runStatus: null,
        stopReason: null,
        terminalReason: "failed_network",
        errorMessage: null,
        errorMeta: null,
        actualModel: null,
        actualModelSource: "unknown",
      };
    });

    render(<AIView />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "composer ready" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "send message" }));
      await Promise.resolve();
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "queue next" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("ai-has-queued").textContent).toBe("yes");
      expect(screen.getByText("Reading protocol...")).toBeTruthy();
      expect(screen.getByText("Queued next message")).toBeTruthy();
      expect(screen.getByText("Queue this next")).toBeTruthy();
    });

    const progress = screen.getByText("Reading protocol...").closest("[data-stack-position]");
    const queued = screen.getByText("Queued next message").closest("[data-stack-position]");
    const composerState = screen.getByTestId("ai-composer");
    const lane = document.querySelector('[data-composer-stack-lane="true"]');

    expect(lane?.contains(progress!)).toBe(true);
    expect(lane?.contains(queued!)).toBe(true);
    expect(lane?.contains(composerState)).toBe(true);
    expect(progress?.getAttribute("data-stack-position")).toBe("top");
    expect(queued?.getAttribute("data-stack-position")).toBe("middle");
    expect(composerState.getAttribute("data-attached-stack")).toBe("attached");
    expect(progress).toBeTruthy();
    expect(queued).toBeTruthy();
    expect(progress!.compareDocumentPosition(queued!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(queued!.compareDocumentPosition(composerState) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("allows queueing before the first conversation id exists", async () => {
    render(<AIView />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "queue next" }));
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.getByTestId("ai-has-queued").textContent).toBe("yes");
      expect(screen.getByText("Queued next message")).toBeTruthy();
      expect(screen.getByText("Queue this next")).toBeTruthy();
    });

    const lane = document.querySelector('[data-composer-stack-lane="true"]');
    expect(lane?.contains(screen.getByText("Queued next message"))).toBe(true);
    expect(lane?.contains(screen.getByTestId("ai-composer"))).toBe(true);
    expect(screen.getByText("Queued next message").closest("[data-stack-position]")?.getAttribute("data-stack-position")).toBe("top");
    expect(screen.getByTestId("ai-composer").getAttribute("data-attached-stack")).toBe("attached");
  });

  it("renders the pending approval bar above the composer for settled proposals", async () => {
    mockGetConversation.mockResolvedValueOnce({
      success: true,
      data: {
        id: "conv-1",
        title: "First chat",
        messages: [],
        artifacts: [
          {
            id: "cproposal1",
            type: "memory_proposal",
            status: "proposed",
            title: "Memory 1",
            payload: {},
            version: 1,
            createdAt: "2026-03-17T00:00:00.000Z",
          },
          {
            id: "cproposal2",
            type: "draft_diff",
            status: "proposed",
            title: "Draft 2",
            payload: { section: "Intro", content: "Body", citations: [], wordCount: 1 },
            version: 1,
            createdAt: "2026-03-17T00:00:01.000Z",
          },
        ],
      },
    });

    render(<AIView />);

    fireEvent.click(screen.getByLabelText("Open chat history"));
    await waitFor(() => {
      expect(screen.getByText("First chat")).toBeTruthy();
    });
    fireEvent.click(screen.getByText("First chat"));

    await waitFor(() => {
      expect(screen.getByText("2 pending proposals")).toBeTruthy();
    });

    const lane = document.querySelector('[data-composer-stack-lane="true"]');
    const barText = screen.getByText("2 pending proposals");
    const composer = screen.getByTestId("ai-composer");

    expect(lane?.contains(barText)).toBe(true);
    expect(lane?.contains(composer)).toBe(true);
    expect(barText.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(composer.getAttribute("data-attached-stack")).toBe("attached");
  });

  it("keeps the composer standalone when no attached caps are present", () => {
    render(<AIView />);

    const lane = document.querySelector('[data-composer-stack-lane="true"]');
    expect(lane?.contains(screen.getByTestId("ai-composer"))).toBe(true);
    expect(screen.getByTestId("ai-composer").getAttribute("data-attached-stack")).toBe("none");
    expect(screen.queryByText("Queued next message")).toBeNull();
  });
});
