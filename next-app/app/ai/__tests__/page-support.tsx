// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, vi } from "vitest";

import AIView from "../page";

const aiViewMocks = vi.hoisted(() => ({
  mockListConversations: vi.fn(),
  mockCreateConversation: vi.fn(),
  mockGetConversation: vi.fn(),
  mockGetGlobalWorkspaceContextAction: vi.fn(),
  mockUseProjects: vi.fn(),
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
  mockUseSearchParams: vi.fn(),
  mockProcessAIStream: vi.fn(),
  mockPollRunRecovery: vi.fn(),
  mockFetch: vi.fn(),
  mockIsProgressiveAnswerStreamingEnabled: vi.fn(() => false),
  mockReviewArtifactAction: vi.fn(),
  mockSummarizeConversationAction: vi.fn(),
}));

const {
  mockListConversations,
  mockCreateConversation,
  mockGetConversation,
  mockGetGlobalWorkspaceContextAction,
  mockUseProjects,
  mockPush,
  mockReplace,
  mockUseSearchParams,
  mockProcessAIStream,
  mockPollRunRecovery,
  mockFetch,
  mockIsProgressiveAnswerStreamingEnabled,
  mockReviewArtifactAction,
  mockSummarizeConversationAction,
} = aiViewMocks;

let matchMediaMatches = false;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
  useSearchParams: () => mockUseSearchParams(),
}));

vi.mock("next/dynamic", () => ({
  default: () => {
    return function DynamicStub(props: {
      children?: ReactNode;
      historyGroups?: Array<{ title: string; items: Array<{ id: string; title: string | null }> }>;
      onSelectConversation?: (conversationId: string) => void;
      isHistoryLoading?: boolean;
      projects?: Array<{ id: string; name: string }>;
      returnProject?: { id: string; name: string; href: string } | null;
      onSelectProject?: (projectId: string | null) => void;
      emptyState?: {
        icon?: string;
        title: string;
        description?: string;
        suggestions: Array<{ label: string; prompt: string }>;
        layout?: "default" | "minimal";
      };
      items?: Array<{
        type: string;
        id: string;
        artifactId?: string;
        status?: string;
        callId?: string;
        content?: string;
        deliveryState?: string;
        message?: string;
        label?: string;
        question?: string;
        retryable?: boolean;
        errorMeta?: { recoveryRecommendation?: string; activeRunId?: string; runId?: string };
      }>;
      suppressedProgressId?: string | null;
      onReconnectRun?: (item: { type: string; id: string; errorMeta?: { activeRunId?: string; runId?: string } }) => void;
      onContinueFromDurableStateRun?: (item: { type: string; id: string; errorMeta?: { activeRunId?: string; runId?: string } }) => void;
      onStopAndRetryRun?: (item: { type: string; id: string; errorMeta?: { activeRunId?: string; runId?: string } }) => void;
      onRetryLastMessage?: () => void;
      onReviewArtifact?: (
        artifactId: string,
        status: "accepted" | "rejected",
        note?: string,
        editedPayload?: Record<string, unknown>,
      ) => void | Promise<void>;
      onAnswerUserInput?: (
        callId: string,
        answer: string,
        page?: "ai",
        section?: string,
        resolution?: "answered" | "accept_recommended" | "cancelled",
      ) => void;
    }) {
      if (props.projects && props.onSelectProject) {
        return (
          <div>
            {props.returnProject ? (
              <a href={props.returnProject.href}>Back to {props.returnProject.name}</a>
            ) : null}
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
              )),
            )}
          </div>
        );
      }

      if (props.items) {
        if (props.items.length === 0 && props.emptyState) {
          return (
            <div>
              <div data-testid="ai-empty-state" data-layout={props.emptyState.layout ?? "default"}>
                <span data-testid="ai-empty-state-icon">{props.emptyState.icon ?? ""}</span>
                <h3>{props.emptyState.title}</h3>
                {props.emptyState.description ? <p>{props.emptyState.description}</p> : null}
                <div data-testid="ai-empty-state-suggestion-count">{props.emptyState.suggestions.length}</div>
                {props.emptyState.suggestions.map((suggestion) => (
                  <button key={suggestion.label} type="button">
                    {suggestion.label}
                  </button>
                ))}
              </div>
              <div data-testid="timeline-suppressed-progress">{props.suppressedProgressId ?? ""}</div>
            </div>
          );
        }

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
              if (item.type === "artifact") {
                const artifactId = item.artifactId;
                return (
                  <div key={item.id}>
                    <span>{`artifact:${item.status}`}</span>
                    {artifactId ? (
                      <button type="button" onClick={() => void props.onReviewArtifact?.(artifactId, "accepted")}>
                        review artifact
                      </button>
                    ) : null}
                  </div>
                );
              }
              if (item.type === "user_input_request") {
                return (
                  <div key={item.id}>
                    <span>{item.question}</span>
                    <button
                      type="button"
                      onClick={() => item.callId && props.onAnswerUserInput?.(item.callId, "Broaden the search first.", "ai")}
                    >
                      answer user input
                    </button>
                    <button
                      type="button"
                      onClick={() => item.callId && props.onAnswerUserInput?.(item.callId, "Cancelled by the user.", "ai", undefined, "cancelled")}
                    >
                      cancel user input
                    </button>
                  </div>
                );
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
                    {(!item.errorMeta?.recoveryRecommendation && item.retryable)
                      || item.errorMeta?.recoveryRecommendation === "retry" ? (
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
  AppShell: ({ children, mobileFullBleed }: { children: ReactNode; mobileFullBleed?: boolean }) => (
    <div data-testid="app-shell" data-mobile-full-bleed={mobileFullBleed ? "true" : "false"}>
      {children}
    </div>
  ),
}));

vi.mock("@/components/chat/ChatComposerCoreClient", () => ({
  ChatComposerCoreClient: ({
    onReady,
    sendMessage,
    onQueueFollowUp,
    hasQueuedFollowUp,
    attachedStack,
    interactionLocked,
    hideModelControl,
    compactMobileChrome,
    cancelStream,
    onCompress,
    canCompress,
    isCompressing,
  }: {
    onReady?: () => void;
    sendMessage?: (text: string, page: "ai") => void | Promise<void>;
    onQueueFollowUp?: (payload: { text: string; page: "ai" }) => void | Promise<void>;
    hasQueuedFollowUp?: boolean;
    attachedStack?: "none" | "attached";
    interactionLocked?: boolean;
    hideModelControl?: boolean;
    compactMobileChrome?: boolean;
    cancelStream?: () => void;
    onCompress?: () => void | Promise<void>;
    canCompress?: boolean;
    isCompressing?: boolean;
  }) => (
    <div
      data-testid="ai-composer"
      data-attached-stack={attachedStack ?? "none"}
      data-interaction-locked={interactionLocked ? "yes" : "no"}
      data-hide-model-control={hideModelControl ? "yes" : "no"}
      data-compact-mobile-chrome={compactMobileChrome ? "yes" : "no"}
      data-can-compress={canCompress ? "yes" : "no"}
      data-is-compressing={isCompressing ? "yes" : "no"}
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
      <button type="button" onClick={() => cancelStream?.()}>
        stop generation
      </button>
      {onCompress ? (
        <button type="button" onClick={() => void onCompress()}>
          compress history
        </button>
      ) : null}
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
  reviewArtifactAction: (...args: unknown[]) => mockReviewArtifactAction(...args),
}));

vi.mock("@/app/actions/summarize-conversation", () => ({
  summarizeConversationAction: (...args: unknown[]) => mockSummarizeConversationAction(...args),
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
      matches: matchMediaMatches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
}

export function installAiViewTestLifecycle() {
  beforeEach(() => {
    vi.clearAllMocks();
    matchMediaMatches = false;
    installMatchMedia();
    window.localStorage.clear();
    mockUseSearchParams.mockReturnValue(new URLSearchParams());
    vi.stubGlobal("fetch", mockFetch);
    mockUseProjects.mockReturnValue({
      isLoadingProjects: false,
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
    mockSummarizeConversationAction.mockResolvedValue({
      success: true,
      data: { newConversationId: "conv-summary" },
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
}

export function setAiViewPhoneViewport(matches: boolean) {
  matchMediaMatches = matches;
  installMatchMedia();
}

export function getAiViewMocks() {
  return aiViewMocks;
}

export function renderAiView() {
  return render(<AIView />);
}

export function readFetchRequestBody(callIndex: number): Record<string, unknown> {
  const requestInit = mockFetch.mock.calls[callIndex]?.[1] as { body?: string } | undefined;
  return JSON.parse(requestInit?.body ?? "{}");
}

export async function flushZeroTimeout() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
}

export async function runAllTimersAndFlush() {
  await act(async () => {
    vi.runAllTimers();
    await Promise.resolve();
    await Promise.resolve();
  });
}
