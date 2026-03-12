"use client";

import { AppShell } from "@/components/AppShell";
import { CopilotInputCoreClient } from "@/components/copilot/CopilotInputCoreClient";
import { ComposerActiveProgressBar } from "@/components/copilot/ComposerActiveProgressBar";
import { useProjects } from "@/contexts/ProjectsContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { AgentMode } from "@/types/agent";
import type {
  AIErrorEnvelope,
  AIStreamChunk,
  ChoiceOption,
  ConversationContext,
  ConversationContextAttachment,
  ConversationMessageAttachment,
  CopilotPage,
  ReasoningMode,
  UserInputRequest,
} from "@/types/ai";
import type { ArtifactStatus, ArtifactType } from "@/types/artifacts";
import type { TimelineItem } from "@/types/timeline";
import { processAIStream } from "@/lib/ai/stream-processor";
import { routeToAgent } from "@/lib/agent/router";
import { dispatchProjectDataChanged, getChangedDomainsForAcceptedArtifact } from "@/lib/project-data-events";
import { isNavigationSafe } from "@/lib/ai/navigation-safety";
import {
  buildUnexpectedTerminalErrorState,
  buildClientErrorState,
  clearRunScopedRenderedErrors,
  formatStreamErrorForUI,
  hasCanonicalFailureFallbackText,
  hasRenderedErrorMatch,
  reconcileRunScopedRenderedErrors,
  shouldSuppressClientFallback,
} from "@/lib/ai/stream-error-ui";
import {
  ABNORMAL_END_TOOL_FAILURE_SUMMARY,
  createAiStreamRuntime,
  shouldFailRunningToolsOnAbnormalEnd,
} from "@/lib/ai/ai-stream-runtime";
import { createInitialSharedStreamState, type SharedStreamIntent } from "@/lib/ai/shared-stream-reducer";
import { normalizeTimelineProgressItems, selectActiveProgress } from "@/lib/ai/active-progress";
import { generateChatUnificationRequestKey, recordChatUnificationMetric } from "@/lib/ai/chat-unification-telemetry";
import {
  isSuccessfulTerminalReason,
  terminalReasonFromRunEnd,
  terminalReasonFromThrownError,
  type StreamTerminalReason,
} from "@/lib/ai/stream-lifecycle";
import { recordReliabilityMetric } from "@/lib/ai/reliability-telemetry";
import type { RetryModelExpectation } from "@/types/chat-unification";
import {
  createRecoveryErrorEnvelope,
  pollRunRecovery,
  RUN_RECOVERY_FAILED_MESSAGE,
  RUN_RECOVERY_INTERRUPTED_TOOL_SUMMARY,
  RUN_RECOVERY_RECONNECT_SUMMARY,
  RUN_RECOVERY_TIMEOUT_MESSAGE,
} from "@/lib/ai/run-recovery-client";
import { isMobileAiV2Enabled } from "@/lib/mobile/feature-flags";
import { PHONE_MEDIA_QUERY } from "@/lib/mobile/breakpoints";
import { isMobileTelemetryContext, recordMobileMetric } from "@/lib/mobile/telemetry";
import {
  getReasoningModePreference,
  setReasoningModePreference,
} from "@/lib/ai/reasoning-visibility";
import { resolveReasoningRequest } from "@/lib/ai/reasoning-request";
import {
  DEFAULT_SELECTABLE_MODEL_ID,
  USER_SELECTABLE_MODELS,
  getReasoningSupportTier,
  type ReasoningSupportTier,
  type SelectableModelId,
} from "@/lib/ai/config";
import { useRouter } from "next/navigation";
import styles from "./ai-view.module.css";

const AiTimelineRenderer = dynamic(() =>
  import("@/components/copilot/TimelineRenderer").then((module) => module.TimelineRenderer)
);
const AiHistorySidebarContent = dynamic(() =>
  import("./AiHistorySidebarContent").then((module) => module.AiHistorySidebarContent)
);
const AiChatHeader = dynamic(() =>
  import("./AiChatHeader").then((module) => module.AiChatHeader)
);

const AI_ROUTE_MEASURE = "litrev-ai-route";
const AI_COMPOSER_MEASURE = "litrev-ai-composer-ready";
const AI_TIMELINE_MEASURE = "litrev-ai-timeline-ready";
const AI_VISIBLE_TIMELINE_INITIAL_COUNT = 80;
const AI_VISIBLE_TIMELINE_STEP = 80;
const AI_EMPTY_CONVERSATION_KEY = "__empty__";
const GLOBAL_HISTORY_SCOPE_KEY = "__global__";

const loadConversationActions = () => import("@/app/actions/conversations");
const loadAgentActions = () => import("@/app/actions/agent");
const loadAiAssistantActions = () => import("@/app/actions/ai-assistant");
const loadSummarizeConversationActions = () => import("@/app/actions/summarize-conversation");

declare global {
  interface Window {
    __litrevAiPerf?: {
      activeConversationId: string | null;
      composerReadyMs?: number;
      timelineReadyMs?: number;
      visibleItems?: number;
      hiddenItems?: number;
      totalItems?: number;
    };
  }
}

const quickActions = [
  { id: "summarize", icon: "description", label: "Summarize a paper", prompt: "I need help summarizing a paper. Here's the abstract: " },
  { id: "draft", icon: "edit_note", label: "Help draft a section", prompt: "Help me draft the Introduction section of my literature review." },
  { id: "find", icon: "search", label: "Find related studies", prompt: "Find me recent papers about " },
  { id: "analyze", icon: "analytics", label: "Analyze findings", prompt: "Analyze the key findings across my collected papers." },
  { id: "compare", icon: "compare_arrows", label: "Compare projects", prompt: "Compare inclusion criteria and progress across my projects. Highlight conflicts and give recommendations." },
  { id: "methodology", icon: "school", label: "Methodology advisor", prompt: "Act as my methodology advisor. Critique my review design and suggest improvements using PRISMA and evidence-quality best practices." },
];

const makeId = (prefix: string) =>
  (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function")
    ? `${prefix}-${crypto.randomUUID()}`
    : `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const AI_HISTORY_COLLAPSED_KEY = "litrev_ai_history_collapsed";

type ChatConversation = {
  id: string;
  title: string | null;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
};

function groupConversationsByDate(conversations: ChatConversation[]): {
  title: string;
  items: ChatConversation[];
}[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const lastWeek = new Date(today);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const groups: { title: string; items: ChatConversation[] }[] = [
    { title: "Today", items: [] },
    { title: "Yesterday", items: [] },
    { title: "This Week", items: [] },
    { title: "Older", items: [] },
  ];

  for (const conv of conversations) {
    const date = new Date(conv.updatedAt);
    date.setHours(0, 0, 0, 0);

    if (date >= today) {
      groups[0].items.push(conv);
    } else if (date >= yesterday) {
      groups[1].items.push(conv);
    } else if (date >= lastWeek) {
      groups[2].items.push(conv);
    } else {
      groups[3].items.push(conv);
    }
  }

  return groups.filter((g) => g.items.length > 0);
}

function mapDbMessagesToTimeline(
  messages: Array<{
  id: string;
  role: string;
  content: string;
  createdAt: string;
  attachments?: ConversationMessageAttachment[];
}>,
  artifacts: Array<{
    id: string;
    type: string;
    status: string;
    title: string;
    payload: unknown;
    version: number;
    createdAt: string;
  }> = [],
): TimelineItem[] {
  const messageItems: TimelineItem[] = [];
  const isContextAttachment = (attachment: ConversationMessageAttachment): attachment is ConversationContextAttachment =>
    "type" in attachment && attachment.type === "context_capture";
  for (const msg of messages) {
    if (msg.role === "user") {
      messageItems.push({
        type: "user_message",
        id: msg.id,
        content: msg.content,
        createdAt: msg.createdAt,
        attachments: msg.attachments?.map((a) => (
          isContextAttachment(a)
            ? a
            : {
              fileAssetId: a.fileAssetId,
              filename: a.filename,
              mimeType: a.mimeType,
              size: a.size,
            }
        )),
      });
      continue;
    }
    if (msg.role === "assistant") {
      messageItems.push({
        type: "assistant_message",
        id: msg.id,
        content: msg.content,
        createdAt: msg.createdAt,
      });
    }
  }
  const artifactItems: TimelineItem[] = artifacts.map((artifact) => ({
    type: "artifact",
    id: `artifact-${artifact.id}`,
    artifactId: artifact.id,
    artifactType: artifact.type as ArtifactType,
    status: artifact.status as ArtifactStatus,
    title: artifact.title,
    payload: artifact.payload ?? {},
    version: artifact.version,
    createdAt: artifact.createdAt,
  }));
  const getCreatedAt = (item: TimelineItem): string => {
    if (
      item.type === "user_message"
      || item.type === "assistant_message"
      || item.type === "artifact"
      || item.type === "tool_activity"
      || item.type === "checkpoint"
      || item.type === "error"
    ) {
      return item.createdAt;
    }
    return "";
  };

  return [...messageItems, ...artifactItems].sort(
    (a, b) => new Date(getCreatedAt(a)).getTime() - new Date(getCreatedAt(b)).getTime(),
  );
}

export default function AIView() {
  const router = useRouter();
  const mobileAiV2Enabled = isMobileAiV2Enabled();
  const { projects } = useProjects();
  const [isHistoryCollapsed, setHistoryCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    const stored = window.localStorage.getItem(AI_HISTORY_COLLAPSED_KEY);
    if (stored === "true") return true;
    if (stored === "false") return false;
    return true;
  });

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isPhoneViewport, setIsPhoneViewport] = useState(false);
  const [isComposerReady, setComposerReady] = useState(false);

  const [workspaceContextText, setWorkspaceContextText] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [branchingConversationId, setBranchingConversationId] = useState<string | null>(null);
  const [branchingMessageId, setBranchingMessageId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; conversationId: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingChoices, setPendingChoices] = useState<ChoiceOption[]>([]);
  const [, setPendingUserInput] = useState<UserInputRequest | null>(null);
  const [prefillCommand, setPrefillCommand] = useState<{ text: string; id: string } | null>(null);
  const [reasoningMode, setReasoningMode] = useState<ReasoningMode>(() => getReasoningModePreference());
  const [selectedModel, setSelectedModelState] = useState<SelectableModelId>(DEFAULT_SELECTABLE_MODEL_ID);

  const [timelineByConversation, setTimelineByConversation] = useState<Record<string, TimelineItem[]>>({});
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  // LRU order: tracks up to 5 recently accessed conversation IDs so we evict old timelines
  const timelineLruRef = useRef<string[]>([]);
  const timelineByConversationRef = useRef<Record<string, TimelineItem[]>>({});

  const historyContentId = "chat-history-panel";
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamGenRef = useRef(0);
  const currentRunIdRef = useRef<string | null>(null);
  const sendLockRef = useRef(false);
  const activeConversationIdRef = useRef<string | null>(null);
  const routePerfStartRef = useRef<number | null>(null);
  const measuredComposerConversationRef = useRef<string | null>(null);
  const measuredTimelineConversationRef = useRef<string | null>(null);
  const currentHistoryScopeRef = useRef<string>(GLOBAL_HISTORY_SCOPE_KEY);
  const historyRequestTokenRef = useRef(0);
  const historyLoadedScopeRef = useRef<string | null>(null);
  const historyLoadPromiseRef = useRef<Promise<void> | null>(null);
  const workspaceContextPromiseRef = useRef<Promise<string> | null>(null);

  const reasoningSupport: ReasoningSupportTier = useMemo(
    () => getReasoningSupportTier(selectedModel),
    [selectedModel]
  );

  const showReasoningControls = reasoningSupport !== "none";

  useEffect(() => {
    timelineByConversationRef.current = timelineByConversation;
  }, [timelineByConversation]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(AI_HISTORY_COLLAPSED_KEY, isHistoryCollapsed ? "true" : "false");
  }, [isHistoryCollapsed]);

  const setSelectedModel = useCallback((modelId: SelectableModelId) => {
    setSelectedModelState(modelId);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("litrev_ai_model", modelId);
    }
  }, []);

  useEffect(() => {
    if (!isTyping) sendLockRef.current = false;
  }, [isTyping]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem("litrev_ai_model");
    const valid = USER_SELECTABLE_MODELS.some((m) => m.id === stored);
    if (valid) {
      setSelectedModel(stored as SelectableModelId);
    }
  }, [setSelectedModel]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mobileQuery = window.matchMedia(PHONE_MEDIA_QUERY);
    const apply = () => setIsPhoneViewport(mobileQuery.matches);
    apply();

    if (typeof mobileQuery.addEventListener === "function") {
      mobileQuery.addEventListener("change", apply);
    } else if (typeof mobileQuery.addListener === "function") {
      mobileQuery.addListener(apply);
    }

    return () => {
      if (typeof mobileQuery.removeEventListener === "function") {
        mobileQuery.removeEventListener("change", apply);
      } else if (typeof mobileQuery.removeListener === "function") {
        mobileQuery.removeListener(apply);
      }
    };
  }, []);

  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    routePerfStartRef.current = performance.now();
    measuredComposerConversationRef.current = null;
    measuredTimelineConversationRef.current = null;
    setComposerReady(false);
    performance.mark(`${AI_ROUTE_MEASURE}:start`);
    window.__litrevAiPerf = {
      activeConversationId: activeConversationId ?? null,
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    measuredComposerConversationRef.current = null;
    measuredTimelineConversationRef.current = null;
    routePerfStartRef.current = performance.now();
    setComposerReady(false);
    performance.mark(`${AI_ROUTE_MEASURE}:start`);
    window.__litrevAiPerf = {
      ...(window.__litrevAiPerf ?? {}),
      activeConversationId: activeConversationId ?? null,
    };
  }, [activeConversationId]);

  const markComposerReady = useCallback(() => {
    if (typeof window === "undefined") return;
    const measureKey = activeConversationId ?? AI_EMPTY_CONVERSATION_KEY;
    if (measuredComposerConversationRef.current === measureKey) return;
    setComposerReady(true);
    measuredComposerConversationRef.current = measureKey;
    const elapsed = routePerfStartRef.current !== null ? Math.round(performance.now() - routePerfStartRef.current) : undefined;
    performance.mark(`${AI_COMPOSER_MEASURE}:${measureKey}`);
    window.__litrevAiPerf = {
      ...(window.__litrevAiPerf ?? {}),
      activeConversationId: activeConversationId ?? null,
      composerReadyMs: elapsed,
    };
  }, [activeConversationId]);

  const handleTimelineReady = useCallback((details: { visibleItems: number; hiddenItems: number; totalItems: number }) => {
    if (typeof window === "undefined") return;
    const measureKey = activeConversationId ?? AI_EMPTY_CONVERSATION_KEY;
    if (measuredTimelineConversationRef.current === measureKey) return;
    measuredTimelineConversationRef.current = measureKey;
    const elapsed = routePerfStartRef.current !== null ? Math.round(performance.now() - routePerfStartRef.current) : undefined;
    performance.mark(`${AI_TIMELINE_MEASURE}:${measureKey}`);
    window.__litrevAiPerf = {
      ...(window.__litrevAiPerf ?? {}),
      activeConversationId: activeConversationId ?? null,
      timelineReadyMs: elapsed,
      visibleItems: details.visibleItems,
      hiddenItems: details.hiddenItems,
      totalItems: details.totalItems,
    };
  }, [activeConversationId]);

  const updateReasoningMode = useCallback((mode: ReasoningMode) => {
    setReasoningMode(mode);
    setReasoningModePreference(mode);
  }, []);

  const handleNavigate = useCallback((url?: string) => {
    if (!url || !isNavigationSafe(url)) return;
    router.push(url);
  }, [router]);

  const handleRunIntent = useCallback((intent: SharedStreamIntent) => {
    if (intent.type === "run_set") {
      currentRunIdRef.current = intent.runId;
    }
  }, []);

  const emitMobileActionTap = useCallback((actionId: string, targetMinPx?: number) => {
    if (!isMobileTelemetryContext()) return;
    recordMobileMetric({
      type: "mobile_action_tap",
      surface: "ai",
      payload: {
        route: typeof window !== "undefined" ? window.location.pathname : "/ai",
        actionId,
        targetMinPx,
        inputMode: "touch",
      },
    });
  }, []);

  const handleHistoryToggle = useCallback(() => {
    emitMobileActionTap("ai_history_toggle", 32);
    setHistoryCollapsed((prev) => {
      const next = !prev;
      if (mobileAiV2Enabled && isPhoneViewport && prev && isMobileTelemetryContext()) {
        recordMobileMetric({
          type: "mobile_drawer_opened",
          surface: "ai",
          payload: {
            route: typeof window !== "undefined" ? window.location.pathname : "/ai",
            drawerId: "history",
            source: "button",
          },
        });
      }
      return next;
    });
  }, [emitMobileActionTap, isPhoneViewport, mobileAiV2Enabled]);

  const ensureWorkspaceContextText = useCallback(async () => {
    if (selectedProjectId) return "";
    if (workspaceContextText) return workspaceContextText;
    if (!workspaceContextPromiseRef.current) {
      workspaceContextPromiseRef.current = loadAiAssistantActions()
        .then(({ getGlobalWorkspaceContextAction }) => getGlobalWorkspaceContextAction())
        .then((result) => {
          if (!result.success) return "";
          setWorkspaceContextText(result.data.contextText);
          return result.data.contextText;
        })
        .catch((err) => {
          console.error("Failed to load global workspace context", err);
          return "";
        })
        .finally(() => {
          workspaceContextPromiseRef.current = null;
        });
    }
    return workspaceContextPromiseRef.current;
  }, [selectedProjectId, workspaceContextText]);

  const historyScopeKey = selectedProjectId ?? GLOBAL_HISTORY_SCOPE_KEY;

  useEffect(() => {
    currentHistoryScopeRef.current = historyScopeKey;
  }, [historyScopeKey]);

  const loadConversationList = useCallback(async (force = false) => {
    if (!force && historyLoadedScopeRef.current === historyScopeKey) return;
    if (historyLoadPromiseRef.current) return historyLoadPromiseRef.current;
    const requestScopeKey = historyScopeKey;
    const requestToken = historyRequestTokenRef.current + 1;
    historyRequestTokenRef.current = requestToken;

    const loadPromise = (async () => {
      setIsHistoryLoading(true);
      const { listConversations } = await loadConversationActions();
      const listResult = await listConversations({
        projectId: selectedProjectId ?? undefined,
        page: "ai",
      });
      if (!listResult.success) {
        console.error("Failed to load AI conversations:", listResult.error);
        return;
      }
      const mapped: ChatConversation[] = listResult.data.map((s) => ({
        id: s.id,
        title: s.title ?? null,
        projectId: s.projectId ?? undefined,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
      if (currentHistoryScopeRef.current !== requestScopeKey) {
        return;
      }
      setConversations(mapped);
      historyLoadedScopeRef.current = requestScopeKey;
    })()
      .catch((err) => {
        console.error("Failed to load AI conversations", err);
      })
      .finally(() => {
        if (historyRequestTokenRef.current === requestToken) {
          historyLoadPromiseRef.current = null;
          setIsHistoryLoading(false);
        }
      });

    historyLoadPromiseRef.current = loadPromise;
    return loadPromise;
  }, [historyScopeKey, selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId) {
      setWorkspaceContextText("");
      workspaceContextPromiseRef.current = null;
    };
  }, [selectedProjectId]);

  useEffect(() => {
    if (selectedProjectId || !isComposerReady || workspaceContextText) return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void ensureWorkspaceContextText();
    };

    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(run, { timeout: 1500 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    const timeoutId = window.setTimeout(run, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [ensureWorkspaceContextText, isComposerReady, selectedProjectId, workspaceContextText]);

  useEffect(() => {
    if (!isComposerReady) return;
    if (historyLoadedScopeRef.current === historyScopeKey) return;

    let cancelled = false;
    const run = () => {
      if (cancelled) return;
      void loadConversationList();
    };

    if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
      const idleId = window.requestIdleCallback(run, { timeout: 1200 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(idleId);
      };
    }

    const timeoutId = window.setTimeout(run, 150);
    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [historyScopeKey, isComposerReady, loadConversationList]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setConversations([]);
    historyLoadedScopeRef.current = null;
    historyLoadPromiseRef.current = null;
    setActiveConversationId(null);
    setTimelineByConversation({});
    timelineLruRef.current = [];   // reset LRU so eviction doesn't drift across scopes
    setPendingChoices([]);
    setPendingUserInput(null);
    setPrefillCommand(null);
  }, [selectedProjectId]);

  useEffect(() => {
    if (isHistoryCollapsed) return;
    void loadConversationList();
  }, [isHistoryCollapsed, loadConversationList]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedScopeLabel = selectedProject
    ? selectedProject.name
    : `Global${projects.length > 0 ? ` (${projects.length} projects)` : ""}`;
  const historyClass = useMemo(
    () => `${styles.historySidebar} ${isHistoryCollapsed ? styles.collapsed : ""}`,
    [isHistoryCollapsed]
  );
  const historyGroups = useMemo(
    () => (isHistoryCollapsed ? [] : groupConversationsByDate(conversations)),
    [conversations, isHistoryCollapsed]
  );
  const activeTimeline = activeConversationId ? (timelineByConversation[activeConversationId] ?? []) : [];
  const { activeProgress, suppressedProgressId } = useMemo(
    () => selectActiveProgress(normalizeTimelineProgressItems(activeTimeline)),
    [activeTimeline],
  );

  const sortConversationsByUpdatedAt = useCallback((items: ChatConversation[]) => {
    return [...items].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, []);

  const LRU_LIMIT = 5;

  const updateConversationTimeline = useCallback((conversationId: string, updater: (prev: TimelineItem[]) => TimelineItem[]) => {
    // Keep LRU order up to date
    const lru = timelineLruRef.current;
    const existing = lru.indexOf(conversationId);
    if (existing !== -1) lru.splice(existing, 1);
    lru.push(conversationId);

    setTimelineByConversation((prev) => {
      const current = prev[conversationId] ?? [];
      const updated = { ...prev, [conversationId]: updater(current) };
      // Evict oldest entries beyond the LRU limit
      if (lru.length > LRU_LIMIT) {
        const evictIds = lru.slice(0, lru.length - LRU_LIMIT);
        for (const id of evictIds) {
          delete updated[id];
        }
        timelineLruRef.current = lru.slice(lru.length - LRU_LIMIT);
      }
      return updated;
    });
  }, []);

  const ensureConversationTimeline = useCallback((conversationId: string) => {
    setTimelineByConversation((prev) => ({
      ...prev,
      [conversationId]: prev[conversationId] ?? [],
    }));
  }, []);

  const upsertConversationTitle = useCallback((conversationId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    setConversations((prev) => {
      const existing = prev.find((conv) => conv.id === conversationId);
      if (!existing) {
        const now = new Date().toISOString();
        return sortConversationsByUpdatedAt([{
          id: conversationId,
          title: trimmed,
          projectId: selectedProjectId ?? undefined,
          createdAt: now,
          updatedAt: now,
        }, ...prev]);
      }
      return prev.map((conv) =>
        conv.id === conversationId
          ? { ...conv, title: trimmed }
          : conv
      );
    });
  }, [selectedProjectId, sortConversationsByUpdatedAt]);

  const appendRecoveryTimelineError = useCallback((params: {
    conversationId: string;
    message: string;
    errorMeta: AIErrorEnvelope;
  }) => {
    updateConversationTimeline(params.conversationId, (items) => {
      const reconciled = reconcileRunScopedRenderedErrors({
        items: items.filter((item) => item.type === "error"),
        nextMessage: params.message,
        nextMeta: params.errorMeta,
        getMessage: (item) => item.type === "error" ? item.message : null,
        getErrorMeta: (item) => item.type === "error" ? item.errorMeta : null,
      });
      const retainedErrorIds = new Set(reconciled.items.map((item) => item.id));
      if (!reconciled.shouldAppend) {
        return items.filter((item) => item.type !== "error" || retainedErrorIds.has(item.id));
      }
      return [
        ...items.filter((item) =>
          item.type !== "progress" && (item.type !== "error" || retainedErrorIds.has(item.id))
        ),
        {
          type: "error",
          id: makeId("recovery-error"),
          message: params.message,
          retryable: params.errorMeta.retryable,
          errorMeta: params.errorMeta,
          createdAt: new Date().toISOString(),
        },
      ];
    });
  }, [updateConversationTimeline]);

  const appendRecoveryCheckpoint = useCallback((conversationId: string, label: string) => {
    updateConversationTimeline(conversationId, (items) => ([
      ...items.filter((item) => !(item.type === "checkpoint" && item.label === label)),
      {
        type: "checkpoint",
        id: makeId("recovery-checkpoint"),
        label,
        createdAt: new Date().toISOString(),
      },
    ]));
  }, [updateConversationTimeline]);

  const buildAiRecoverySeed = useCallback((items: TimelineItem[], conversationId: string, runId: string) => {
    const latestAssistant = [...items].reverse().find((item) => item.type === "assistant_message") ?? null;
    const runningToolCallIds = items.reduce<string[]>((acc, item) => {
      if (item.type === "tool_activity" && (item.status === "running" || item.status === "interrupted")) {
        acc.push(item.callId);
      }
      return acc;
    }, []);

    return {
      aiMessageId: latestAssistant?.id ?? makeId("assistant"),
      initialStreamState: createInitialSharedStreamState({
        aiMessageCreated: Boolean(latestAssistant),
        fullContent: latestAssistant?.type === "assistant_message" ? latestAssistant.content : "",
        reasoningContent: latestAssistant?.type === "assistant_message" ? latestAssistant.reasoning?.text ?? "" : "",
        reasoningState: latestAssistant?.type === "assistant_message" ? latestAssistant.reasoning?.state ?? "done" : "done",
        reasoningTruncated: latestAssistant?.type === "assistant_message" ? latestAssistant.reasoning?.truncated ?? false : false,
        runningToolCallIds,
        lastToolCallId: runningToolCallIds.at(-1) ?? null,
        localRunId: runId,
        effectiveConvId: conversationId,
      }),
    };
  }, []);

  const recoverConversationRun = useCallback(async (params: {
    conversationId: string;
    runId: string;
    page: CopilotPage;
    section?: string;
  }) => {
    const currentItems = timelineByConversationRef.current[params.conversationId] ?? [];
    const { aiMessageId, initialStreamState } = buildAiRecoverySeed(
      currentItems,
      params.conversationId,
      params.runId,
    );
    const recoveryRuntime = createAiStreamRuntime({
      aiMessageId,
      page: params.page,
      section: params.section,
      initialConversationId: params.conversationId,
      initialStreamState,
      selectedProjectId,
      myGen: streamGenRef.current,
      getCurrentGen: () => streamGenRef.current,
      updateConversationTimeline,
      ensureConversationTimeline,
      setActiveConversationId,
      upsertConversationTitle,
      setPendingChoices,
      setPendingUserInput,
      onIntent: handleRunIntent,
      onNavigate: handleNavigate,
    });

    return pollRunRecovery({
      conversationId: params.conversationId,
      runId: params.runId,
      onReplay: async (chunk) => recoveryRuntime.handleChunk(chunk),
      onTerminal: async (chunk) => recoveryRuntime.handleChunk(chunk),
    });
  }, [
    buildAiRecoverySeed,
    ensureConversationTimeline,
    handleNavigate,
    handleRunIntent,
    selectedProjectId,
    setActiveConversationId,
    setPendingChoices,
    setPendingUserInput,
    updateConversationTimeline,
    upsertConversationTitle,
  ]);

  const cancelStream = useCallback(() => {
    streamGenRef.current++;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsTyping(false);
    setPendingChoices([]);
    setPendingUserInput(null);
  }, []);

  const ensureConversation = useCallback(async (context: ConversationContext): Promise<string> => {
    if (activeConversationId) return activeConversationId;

    const { createConversation } = await loadConversationActions();
    const convResult = await createConversation({
      context,
      projectId: selectedProjectId ?? undefined,
      page: "ai",
    });
    if (!convResult.success) throw new Error(convResult.error);
    const { id } = convResult.data;

    const now = new Date().toISOString();
    const newConv: ChatConversation = {
      id,
      title: null,
      projectId: selectedProjectId ?? undefined,
      createdAt: now,
      updatedAt: now,
    };

    setConversations((prev) => sortConversationsByUpdatedAt([newConv, ...prev]));
    setActiveConversationId(id);
    updateConversationTimeline(id, () => []);
    return id;
  }, [activeConversationId, selectedProjectId, sortConversationsByUpdatedAt, updateConversationTimeline]);

  const handleSelectConversation = useCallback(async (id: string) => {
    if (mobileAiV2Enabled && isPhoneViewport) {
      setHistoryCollapsed(true);
    }
    setActiveConversationId(id);
    setPendingChoices([]);
    setPendingUserInput(null);
    // Only show skeleton if we don't already have this conversation cached
    const alreadyCached = !!timelineByConversation[id];
    if (!alreadyCached) setIsConversationLoading(true);
    try {
      const { getConversation } = await loadConversationActions();
      const convResult = await getConversation(id);
      const full = convResult.success ? convResult.data : null;
      if (!full) return;
      const mappedItems = mapDbMessagesToTimeline(full.messages, full.artifacts);
      updateConversationTimeline(id, () => mappedItems);
      setConversations((prev) => prev.map((conv) =>
        conv.id === id
          ? { ...conv, title: full.title ?? conv.title }
          : conv
      ));
    } catch (err) {
      console.error("Failed to load conversation messages", err);
    } finally {
      setIsConversationLoading(false);
    }
  }, [isPhoneViewport, mobileAiV2Enabled, timelineByConversation, updateConversationTimeline]);

  const handleDeleteConversation = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let archived = false;
    try {
      const { archiveConversation } = await loadConversationActions();
      const result = await archiveConversation(id);
      if (!result.success) {
        console.error("Failed to archive conversation:", result.error);
        return;
      }
      archived = true;
    } catch (err) {
      console.error("Failed to archive conversation", err);
    }

    if (!archived) return;

    // Derive nextId from the updater's `prev` argument (always fresh state, avoids stale closure)
    let nextId: string | null = null;
    setConversations((prev) => {
      const filtered = prev.filter((c) => c.id !== id);
      if (activeConversationId === id) {
        nextId = filtered[0]?.id ?? null;
      }
      return filtered;
    });
    setTimelineByConversation((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    // Keep LRU ref in sync with the evicted entry
    timelineLruRef.current = timelineLruRef.current.filter((lruId) => lruId !== id);
    setPendingChoices([]);
    setPendingUserInput(null);

    if (activeConversationId === id) {
      if (nextId) {
        // Load the next conversation's timeline (skeleton + DB fetch) to avoid a blank view
        void handleSelectConversation(nextId);
      } else {
        setActiveConversationId(null);
      }
    }
  }, [activeConversationId, handleSelectConversation]);

  const handleBranchConversation = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (branchingConversationId || branchingMessageId) return;
    if (isTyping) cancelStream();
    setBranchingConversationId(id);
    try {
      const { branchConversation, getConversation } = await loadConversationActions();
      const branchResult = await branchConversation({ conversationId: id });
      if (!branchResult.success) { console.error("Failed to branch:", branchResult.error); return; }
      const fullResult = await getConversation(branchResult.data.id);
      const full = fullResult.success ? fullResult.data : null;
      if (!full) return;

      const mappedItems = mapDbMessagesToTimeline(full.messages, full.artifacts);
      const newConv: ChatConversation = {
        id: full.id,
        title: full.title ?? null,
        projectId: full.projectId ?? undefined,
        createdAt: full.createdAt,
        updatedAt: full.updatedAt,
      };
      setConversations((prev) =>
        sortConversationsByUpdatedAt([newConv, ...prev.filter((c) => c.id !== newConv.id)])
      );
      updateConversationTimeline(full.id, () => mappedItems);
      setActiveConversationId(full.id);
      setPendingChoices([]);
      setPendingUserInput(null);
      setPrefillCommand(null);
    } catch (err) {
      console.error("Failed to branch conversation", err);
    } finally {
      setBranchingConversationId(null);
    }
  }, [branchingConversationId, branchingMessageId, isTyping, cancelStream, sortConversationsByUpdatedAt, updateConversationTimeline]);

  const handleBranchFromMessage = useCallback(async (messageId: string, createdAt: string) => {
    const sourceConversationId = activeConversationId;
    if (!sourceConversationId || branchingConversationId || branchingMessageId) return;
    if (isTyping) cancelStream();
    setBranchingMessageId(messageId);
    try {
      const { branchConversation, getConversation } = await loadConversationActions();
      const branchResult = await branchConversation({
        conversationId: sourceConversationId,
        upToMessageId: messageId,
        upToCreatedAt: createdAt,
      });
      if (!branchResult.success) { console.error("Failed to branch from message:", branchResult.error); return; }
      const fullResult = await getConversation(branchResult.data.id);
      const full = fullResult.success ? fullResult.data : null;
      if (!full) return;

      const mappedItems = mapDbMessagesToTimeline(full.messages, full.artifacts);
      const newConv: ChatConversation = {
        id: full.id,
        title: full.title ?? null,
        projectId: full.projectId ?? undefined,
        createdAt: full.createdAt,
        updatedAt: full.updatedAt,
      };
      setConversations((prev) =>
        sortConversationsByUpdatedAt([newConv, ...prev.filter((c) => c.id !== newConv.id)])
      );
      updateConversationTimeline(full.id, () => mappedItems);
      setActiveConversationId(full.id);
      setPendingChoices([]);
      setPendingUserInput(null);
      setPrefillCommand(null);
    } catch (err) {
      console.error("Failed to branch from message", err);
    } finally {
      setBranchingMessageId(null);
    }
  }, [
    activeConversationId,
    branchingConversationId,
    branchingMessageId,
    isTyping,
    cancelStream,
    sortConversationsByUpdatedAt,
    updateConversationTimeline,
  ]);

  // ── Context menu on conversation items ──────────────────────────────────────
  const handleConversationContextMenu = useCallback((e: React.MouseEvent, conversationId: string) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, conversationId });
  }, []);

  const dismissContextMenu = useCallback(() => setContextMenu(null), []);

  const handleStartRename = useCallback((conversationId: string) => {
    const conv = conversations.find((c) => c.id === conversationId);
    setRenameValue(conv?.title ?? "");
    setRenamingId(conversationId);
    setContextMenu(null);
  }, [conversations]);

  const handleCommitRename = useCallback(async () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) {
      try {
        const { updateConversationTitle } = await loadConversationActions();
        const result = await updateConversationTitle(renamingId, trimmed);
        if (result.success) {
          setConversations((prev) => prev.map((c) => c.id === renamingId ? { ...c, title: trimmed } : c));
        } else {
          console.error("Failed to rename conversation:", result.error);
        }
      } catch (err) {
        console.error("Failed to rename conversation", err);
      }
    }
    setRenamingId(null);
    setRenameValue("");
  }, [renamingId, renameValue]);

  const handleCancelRename = useCallback(() => {
    setRenamingId(null);
    setRenameValue("");
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = () => setContextMenu(null);
    document.addEventListener("click", dismiss);
    document.addEventListener("scroll", dismiss, true);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismiss(); };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", dismiss);
      document.removeEventListener("scroll", dismiss, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [contextMenu]);

  useEffect(() => {
    if (!mobileAiV2Enabled || !isPhoneViewport || isHistoryCollapsed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setHistoryCollapsed(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isHistoryCollapsed, isPhoneViewport, mobileAiV2Enabled]);

  const handleCompressHistory = useCallback(async () => {
    const sourceId = activeConversationId;
    if (!sourceId || isCompressing) return;
    if (isTyping) cancelStream();
    setIsCompressing(true);
    try {
      const { summarizeConversationAction } = await loadSummarizeConversationActions();
      const { getConversation } = await loadConversationActions();
      const result = await summarizeConversationAction(sourceId);
      if (!result.success) throw new Error(result.error);

      // Remove the archived source conversation from the sidebar regardless of
      // whether we can load the new one — avoids leaving a dead (archived) entry.
      setConversations((prev) =>
        sortConversationsByUpdatedAt(prev.filter((c) => c.id !== sourceId))
      );
      setTimelineByConversation((prev) => {
        const next = { ...prev };
        delete next[sourceId];
        return next;
      });
      timelineLruRef.current = timelineLruRef.current.filter((lruId) => lruId !== sourceId);

      const fullResult = await getConversation(result.data.newConversationId);
      const full = fullResult.success ? fullResult.data : null;
      if (!full) {
        setActiveConversationId(null);
        return;
      }

      const mappedItems = mapDbMessagesToTimeline(full.messages, full.artifacts);
      const newConv: ChatConversation = {
        id: full.id,
        title: full.title ?? null,
        projectId: full.projectId ?? undefined,
        createdAt: full.createdAt,
        updatedAt: full.updatedAt,
      };

      setConversations((prev) =>
        sortConversationsByUpdatedAt(
          [newConv, ...prev.filter((c) => c.id !== newConv.id)]
        )
      );
      updateConversationTimeline(full.id, () => mappedItems);
      setActiveConversationId(full.id);
      setPendingChoices([]);
      setPendingUserInput(null);
      setPrefillCommand(null);
    } catch (err) {
      console.error("Failed to compress conversation history", err);
    } finally {
      setIsCompressing(false);
    }
  }, [activeConversationId, isCompressing, isTyping, cancelStream, sortConversationsByUpdatedAt, updateConversationTimeline]);

  const handleNewChat = useCallback(async () => {
    emitMobileActionTap("ai_new_chat", 44);
    const context: ConversationContext = selectedProjectId ? "project" : "global";
    const { createConversation } = await loadConversationActions();
    const convResult = await createConversation({
      context,
      projectId: selectedProjectId ?? undefined,
      page: "ai",
    });
    if (!convResult.success) { console.error("Failed to create chat:", convResult.error); return; }
    const { id } = convResult.data;

    const now = new Date().toISOString();
    const newConv: ChatConversation = {
      id,
      title: null,
      projectId: selectedProjectId ?? undefined,
      createdAt: now,
      updatedAt: now,
    };

    setConversations((prev) => sortConversationsByUpdatedAt([newConv, ...prev]));
    setActiveConversationId(id);
    updateConversationTimeline(id, () => []);
    if (mobileAiV2Enabled && isPhoneViewport) {
      setHistoryCollapsed(true);
    }
    setPendingChoices([]);
    setPendingUserInput(null);
    setPrefillCommand(null);
  }, [emitMobileActionTap, isPhoneViewport, mobileAiV2Enabled, selectedProjectId, sortConversationsByUpdatedAt, updateConversationTimeline]);

  const handleSend = useCallback(async (
    rawText: string,
    currentPage: CopilotPage,
    section?: string,
    model?: string,
    agentMode?: AgentMode,
    _studyId?: string,
    retryModelExpectation?: RetryModelExpectation,
    _contextTargets?: unknown,
    replaceRunIdOverride?: string,
  ) => {
    const msgText = rawText.trim();
    if (!msgText || sendLockRef.current) return;
    const sendStartedAtMs = Date.now();
    let sendSucceeded = false;
    emitMobileActionTap("ai_send_message", 44);
    if (isTyping) cancelStream();
    sendLockRef.current = true;
    setPendingChoices([]);
    setPendingUserInput(null);

    const context: ConversationContext = selectedProjectId ? "project" : "global";
    const effectiveAgentMode = agentMode ?? routeToAgent(msgText, "overview");
    const effectiveModel = model ?? selectedModel;
    const reasoningRequest = resolveReasoningRequest({
      preferredMode: reasoningMode,
      modelId: effectiveModel,
    });

    let convId = await ensureConversation(context);
    if (retryModelExpectation) {
      recordChatUnificationMetric({
        type: "retry_model_continuity",
        surface: "ai",
        conversationId: convId,
        projectId: selectedProjectId,
        payload: {
          requestKey: retryModelExpectation.requestKey,
          expectedModel: retryModelExpectation.expectedModel,
          source: retryModelExpectation.source,
        },
      });
    }

    const nowIso = new Date().toISOString();
    const userId = `m-${Date.now()}`;

    updateConversationTimeline(convId, (prev) => [
      ...prev,
      {
        type: "user_message",
        id: userId,
        content: msgText,
        createdAt: nowIso,
      },
    ]);

    setConversations((prev) =>
      sortConversationsByUpdatedAt(
        prev.map((conv) =>
          conv.id === convId
            ? {
                ...conv,
                updatedAt: nowIso,
              }
            : conv,
        )
      )
    );

    setPrefillCommand(null);
    const replaceRunId = replaceRunIdOverride ?? (isTyping ? currentRunIdRef.current : null);
    setIsTyping(true);
    streamGenRef.current++;
    const myGen = streamGenRef.current;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const aiMessageId = `m-${Date.now() + 1}`;
    const requestKey = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `ai-send-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let runStatus: string | null = null;
    let terminalReason: StreamTerminalReason | null = null;
    let actualModel: string | null = null;
    let actualModelSource: "provider" | "requested" | "unknown" = "unknown";
    let unresolvedCountBeforeClear: number | null = null;
    let unresolvedCountAfterClear: number | null = null;
    let aborted = false;
    let emittedTerminalError = false;
    let terminalEventEmitted = false;
    const applyRecoveredTerminalState = (recoveredRunStatus: string | null | undefined) => {
      if (recoveredRunStatus && recoveredRunStatus !== "missing") {
        runStatus = recoveredRunStatus;
      }
      terminalReason = terminalReasonFromRunEnd({
        runStatus,
        stopReason: runStatus === "paused" ? "paused_for_input" : null,
      });
      sendSucceeded = isSuccessfulTerminalReason(terminalReason);
      const recoveredRunId = runtime.getState().localRunId || currentRunIdRef.current;
      if (recoveredRunId) {
        updateConversationTimeline(convId, (items) =>
          clearRunScopedRenderedErrors({
            items,
            runId: recoveredRunId,
            getErrorMeta: (item) => item.type === "error" ? item.errorMeta : null,
          })
        );
      }
    };

    recordReliabilityMetric({
      type: "reliability.v1.stream.started",
      surface: "ai",
      projectId: selectedProjectId,
      conversationId: convId,
      payload: {
        requestKey,
        phase: "send",
      },
    });

    const emitTerminalMetric = (reason: StreamTerminalReason, status: string | null) => {
      if (terminalEventEmitted) return;
      terminalEventEmitted = true;
      recordReliabilityMetric({
        type: "reliability.v1.stream.terminal",
        surface: "ai",
        projectId: selectedProjectId,
        conversationId: convId,
        payload: {
          requestKey,
          phase: "send",
          reason,
          runStatus: status,
        },
      });
    };
    const runtime = createAiStreamRuntime({
      aiMessageId,
      page: currentPage,
      section,
      initialConversationId: convId,
      selectedProjectId,
      myGen,
      getCurrentGen: () => streamGenRef.current,
      updateConversationTimeline,
      ensureConversationTimeline,
      setActiveConversationId,
      upsertConversationTitle,
      setPendingChoices,
      setPendingUserInput,
      onIntent: handleRunIntent,
      onNavigate: handleNavigate,
    });

    const attemptRecoveryFromAbnormalEnd = async (): Promise<boolean> => {
      if (!terminalReason || !shouldFailRunningToolsOnAbnormalEnd(terminalReason)) {
        return false;
      }
      const runtimeState = runtime.getState();
      const activeRunId = runtimeState.localRunId || currentRunIdRef.current;
      const activeConversationId = runtime.getConversationId();
      if (!activeRunId || !activeConversationId) {
        return false;
      }

      currentRunIdRef.current = activeRunId;
      runtime.clearProgress();
      runtime.interruptRunningTools(RUN_RECOVERY_INTERRUPTED_TOOL_SUMMARY);
      appendRecoveryCheckpoint(activeConversationId, RUN_RECOVERY_RECONNECT_SUMMARY);

      const recoveryResult = await pollRunRecovery({
        conversationId: activeConversationId,
        runId: activeRunId,
        signal: controller.signal,
        onReplay: async (chunk) => runtime.handleChunk(chunk),
        onTerminal: async (chunk) => runtime.handleChunk(chunk),
      });

      if (recoveryResult.outcome === "recovered") {
        applyRecoveredTerminalState(recoveryResult.response?.runStatus ?? runStatus);
        return true;
      }

      const recoveryMessage = recoveryResult.outcome === "timeout"
        ? RUN_RECOVERY_TIMEOUT_MESSAGE
        : recoveryResult.outcome === "needs_user_action"
          ? "The active run is still holding this conversation. Choose how to continue."
          : RUN_RECOVERY_FAILED_MESSAGE;
      appendRecoveryTimelineError({
        conversationId: activeConversationId,
        message: recoveryMessage,
        errorMeta: createRecoveryErrorEnvelope({
          code: recoveryResult.outcome === "timeout"
            ? "RUN_RECOVERY_TIMEOUT"
            : recoveryResult.outcome === "needs_user_action"
              ? "RUN_RECOVERY_REQUIRES_USER_ACTION"
              : "RUN_RECOVERY_FAILED",
          message: recoveryMessage,
          runId: recoveryResult.response?.runId ?? activeRunId,
          activeRunId: recoveryResult.response?.runId ?? activeRunId,
          lastActivityAt: recoveryResult.response?.lastActivityAt ?? undefined,
          recoveryRecommendation: recoveryResult.response?.recoveryRecommendation
            ?? (recoveryResult.outcome === "needs_user_action" ? "stop_and_retry" : "retry"),
          retryable: (recoveryResult.response?.recoveryRecommendation ?? "retry") === "retry",
        }),
      });
      emittedTerminalError = true;
      currentRunIdRef.current = recoveryResult.response?.recoveryRecommendation === "retry"
        ? null
        : (recoveryResult.response?.runId ?? activeRunId);
      return false;
    };

    try {
      const response = await fetch("/api/ai/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: msgText,
          context,
          options: {
            conversationId: convId,
            replaceRunId: replaceRunId ?? undefined,
            projectId: selectedProjectId ?? undefined,
            model: effectiveModel,
            reasoningMode: reasoningRequest.reasoningMode,
            includeReasoning: reasoningRequest.includeReasoning,
            reasoningBudgetTokens: reasoningRequest.reasoningBudgetTokens,
            agentMode: effectiveAgentMode,
            page: currentPage,
            section,
            telemetryRequestKey: retryModelExpectation?.requestKey,

            additionalContext: selectedProjectId
              ? undefined
              : ((workspaceContextText || await ensureWorkspaceContextText()) || undefined),
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`AI request failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const summary = await processAIStream({
        reader,
        signal: controller.signal,
        shouldContinue: () => streamGenRef.current === myGen,
        throwOnErrorChunk: true,
        onChunk: (data) => runtime.handleChunk(data),
      });
      runStatus = summary.runStatus;
      terminalReason = summary.terminalReason;
      sendSucceeded = summary.terminalReason === "completed";
      if (summary.terminalReason === "paused_for_input") {
        sendSucceeded = true;
      }
      actualModel = summary.actualModel;
      actualModelSource = summary.actualModelSource;
      const runEndToolCounts = runtime.getLastRunEndToolCounts();
      unresolvedCountBeforeClear = runEndToolCounts?.beforeClear ?? null;
      unresolvedCountAfterClear = runEndToolCounts?.afterClear ?? null;
      convId = runtime.getConversationId();
      const recovered = await attemptRecoveryFromAbnormalEnd();
      if (!recovered && shouldFailRunningToolsOnAbnormalEnd(terminalReason)) {
        return;
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        aborted = true;
        terminalReason = terminalReasonFromThrownError(err, { isUserAbort: true });
        emitTerminalMetric(terminalReason, runStatus);
      } else {
        terminalReason = terminalReasonFromThrownError(err);
        if (await attemptRecoveryFromAbnormalEnd()) {
          emitTerminalMetric(terminalReason ?? "completed", runStatus);
          return;
        }
        if (emittedTerminalError) {
          emitTerminalMetric(terminalReason, runStatus);
          return;
        }
        emitTerminalMetric(terminalReason, runStatus);
        convId = runtime.getConversationId();
        const errorState = buildClientErrorState(err);
        updateConversationTimeline(convId, (items) => {
          const errorMeta = {
            ...errorState.errorMeta,
            runId: runtime.getState().localRunId || currentRunIdRef.current || errorState.errorMeta.runId,
          };
          const hasAssistantContent = hasCanonicalFailureFallbackText({
            items: items.filter((item) => item.type === "assistant_message"),
            streamError: errorMeta,
            getText: (item) => item.type === "assistant_message" ? item.content : null,
          });
          const reconciled = reconcileRunScopedRenderedErrors({
            items: items.filter((item) => item.type === "error"),
            nextMessage: errorState.message,
            nextMeta: errorMeta,
            getMessage: (item) => item.type === "error" ? item.message : null,
            getErrorMeta: (item) => item.type === "error" ? item.errorMeta : null,
          });
          const hasRenderedError = !reconciled.shouldAppend;
          if (shouldSuppressClientFallback({ errorMeta: errorMeta, hasAssistantContent, hasRenderedError })) {
            emittedTerminalError = true;
            return items.filter((item) => item.type !== "error" || reconciled.items.some((retained) => retained.id === item.id));
          }
          emittedTerminalError = true;
          return [
            ...items.filter((item) => item.type !== "error" || reconciled.items.some((retained) => retained.id === item.id)),
            {
              type: "error",
              id: `error-${Date.now()}`,
              message: errorState.message,
              retryable: errorState.retryable,
              errorMeta,
              createdAt: new Date().toISOString(),
            },
          ];
        });
      }
    } finally {
      runtime.clearProgress();
      convId = runtime.getConversationId();
      if (!aborted) {
        const runtimeState = runtime.getState();
        recordChatUnificationMetric({
          type: "stuck_running_tools_after_run_end",
          surface: "ai",
          runId: runtimeState.localRunId || null,
          conversationId: runtime.getConversationId(),
          projectId: selectedProjectId,
          payload: {
            unresolvedCount: runtimeState.runningToolCallIds.length,
            unresolvedCountBeforeClear,
            unresolvedCountAfterClear,
            runStatus,
            streamPhase: "send",
          },
        });
      }
      if (streamGenRef.current === myGen) {
        setIsTyping(false);
        setConversations((prev) =>
          sortConversationsByUpdatedAt(
            prev.map((conv) =>
              conv.id === convId
                ? { ...conv, updatedAt: new Date().toISOString() }
                : conv
            )
          )
        );
      }
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (
        streamGenRef.current === myGen
        && !aborted
        && shouldFailRunningToolsOnAbnormalEnd(terminalReason)
        && !emittedTerminalError
      ) {
        runtime.failRunningTools(ABNORMAL_END_TOOL_FAILURE_SUMMARY);
      }
      if (terminalReason && !aborted) {
        emitTerminalMetric(terminalReason, runStatus);
      }
      if (
        streamGenRef.current === myGen
        && !aborted
        && !emittedTerminalError
        && terminalReason
        && shouldFailRunningToolsOnAbnormalEnd(terminalReason)
      ) {
        const terminalErrorState = buildUnexpectedTerminalErrorState(terminalReason);
        updateConversationTimeline(convId, (items) => {
          const errorMeta = {
            ...terminalErrorState.errorMeta,
            runId: runtime.getState().localRunId || currentRunIdRef.current || undefined,
          };
          const reconciled = reconcileRunScopedRenderedErrors({
            items: items.filter((item) => item.type === "error"),
            nextMessage: terminalErrorState.message,
            nextMeta: errorMeta,
            getMessage: (item) => item.type === "error" ? item.message : null,
            getErrorMeta: (item) => item.type === "error" ? item.errorMeta : null,
          });
          const retainedErrorIds = new Set(reconciled.items.map((item) => item.id));
          if (!reconciled.shouldAppend) {
            emittedTerminalError = true;
            return items.filter((item) => item.type !== "error" || retainedErrorIds.has(item.id));
          }
          emittedTerminalError = true;
          return [
            ...items.filter((item) => item.type !== "error" || retainedErrorIds.has(item.id)),
            {
              type: "error",
              id: makeId("terminal-error"),
              message: terminalErrorState.message,
              retryable: terminalErrorState.retryable,
              errorMeta,
              createdAt: new Date().toISOString(),
            },
          ];
        });
      }

      if (isMobileTelemetryContext()) {
        recordMobileMetric({
          type: "mobile_flow_completed",
          surface: "ai",
          payload: {
            route: typeof window !== "undefined" ? window.location.pathname : "/ai",
            flowId: "ai_message_send",
            durationMs: Date.now() - sendStartedAtMs,
            success: sendSucceeded,
          },
        });
      }
    }
  }, [
    emitMobileActionTap,
    isTyping,
    cancelStream,
    selectedProjectId,
    selectedModel,
    reasoningMode,
    handleNavigate,

    workspaceContextText,
    ensureWorkspaceContextText,
    ensureConversation,
    ensureConversationTimeline,
    upsertConversationTitle,
    updateConversationTimeline,
    sortConversationsByUpdatedAt,
  ]);

  const handleAnswerUserInput = useCallback((callId: string, answer: string, page?: CopilotPage, section?: string) => {
    const activeItems = activeConversationId
      ? (timelineByConversation[activeConversationId] ?? [])
      : [];
    const requestItem = activeItems.find(
      (item) => item.type === "user_input_request" && item.callId === callId
    );
    const resolvedPage = page ?? (requestItem?.type === "user_input_request" ? requestItem.page : undefined) ?? "ai";
    const resolvedSection = section ?? (requestItem?.type === "user_input_request" ? requestItem.section : undefined);
    const expectedPage = requestItem?.type === "user_input_request" ? (requestItem.page ?? null) : null;
    const expectedSection = requestItem?.type === "user_input_request" ? (requestItem.section ?? null) : null;
    const contextMismatch = Boolean(
      requestItem
      && (
        expectedPage !== resolvedPage
        || expectedSection !== (resolvedSection ?? null)
      )
    );
    recordChatUnificationMetric({
      type: "ask_user_context_mismatch",
      surface: "ai",
      conversationId: activeConversationId,
      projectId: selectedProjectId,
      payload: {
        mismatch: contextMismatch,
        expectedPage,
        expectedSection,
        resolvedPage,
        resolvedSection: resolvedSection ?? null,
      },
    });

    // Mark the timeline card as answered
    if (activeConversationId) {
      updateConversationTimeline(activeConversationId, (items) =>
        items.map((item) =>
          item.type === "user_input_request" && item.callId === callId
            ? { ...item, answered: true, answer }
            : item
        ),
      );
    }
    setPendingUserInput(null);
    // Send the answer as a user message so the AI continues
    void handleSend(answer, resolvedPage, resolvedSection);
  }, [activeConversationId, timelineByConversation, updateConversationTimeline, handleSend, selectedProjectId]);

  const reviewArtifactLocal = useCallback(async (
    artifactId: string,
    status: "accepted" | "rejected",
    note?: string,
    editedPayload?: Record<string, unknown>,
  ): Promise<boolean> => {
    const convId = activeConversationId;
    if (!convId) return false;

    // Optimistic update
    updateConversationTimeline(convId, (items) =>
      items.map((item) => {
        if (item.type !== "artifact" || item.artifactId !== artifactId) return item;
        return {
          ...item,
          status: status as ArtifactStatus,
          payload: status === "accepted" && editedPayload ? editedPayload : item.payload,
        };
      })
    );

    const { reviewArtifactAction } = await loadAgentActions();
    const result = await reviewArtifactAction(artifactId, status, note, editedPayload);
    if (!result.success || !result.artifact) {
      updateConversationTimeline(convId, (items) => ([
        ...items.map((item) => {
          if (item.type !== "artifact" || item.artifactId !== artifactId) return item;
          return { ...item, status: "proposed" as ArtifactStatus };
        }),
        {
          type: "error",
          id: `artifact-review-error-${Date.now()}`,
          message: result.success ? "Artifact review failed." : (result.error ?? "Artifact review failed."),
          retryable: false,
          createdAt: new Date().toISOString(),
        },
      ]));
      return false;
    }

    updateConversationTimeline(convId, (items) =>
      items.map((item) => {
        if (item.type !== "artifact" || item.artifactId !== artifactId) return item;
        return {
          ...item,
          status: result.artifact.status as ArtifactStatus,
          payload: (result.artifact.payload ?? item.payload) as unknown,
        };
      })
    );

    if (status === "accepted" && result.artifact.projectId) {
      const domains = getChangedDomainsForAcceptedArtifact(result.artifact.type, result.artifact.payload);
      if (domains.length > 0) {
        dispatchProjectDataChanged({
          projectId: result.artifact.projectId,
          domains,
          source: "artifact_review",
        });
      }
    }
    return true;
  }, [activeConversationId, updateConversationTimeline]);

  const handleReviewArtifact = useCallback(async (
    artifactId: string,
    status: "accepted" | "rejected",
    note?: string,
    editedPayload?: Record<string, unknown>,
  ) => {
    await reviewArtifactLocal(artifactId, status, note, editedPayload);
  }, [reviewArtifactLocal]);

  const handleApproveArtifactsBatch = useCallback(async (
    artifactIds: string[],
    options?: {
      shouldStop?: () => boolean;
      onProgress?: (completed: number, total: number) => void;
      conversationId?: string;
    },
  ): Promise<{ approvedCount: number; failedArtifactIds: string[]; stopped: boolean }> => {
    const uniqueArtifactIds = [...new Set(artifactIds.filter(Boolean))];
    const total = uniqueArtifactIds.length;
    const startConversationId = options?.conversationId ?? activeConversationIdRef.current;
    let completed = 0;
    let approvedCount = 0;
    const failedArtifactIds: string[] = [];

    for (const artifactId of uniqueArtifactIds) {
      if (options?.shouldStop?.()) {
        return { approvedCount, failedArtifactIds, stopped: true };
      }
      if (activeConversationIdRef.current !== startConversationId) {
        return { approvedCount, failedArtifactIds, stopped: true };
      }

      const success = await reviewArtifactLocal(artifactId, "accepted");
      completed += 1;
      options?.onProgress?.(completed, total);
      if (success) approvedCount += 1;
      else failedArtifactIds.push(artifactId);
    }

    return { approvedCount, failedArtifactIds, stopped: false };
  }, [reviewArtifactLocal]);

  const handleExecutePlan = useCallback(async (artifactId: string, selectedIndexes: number[]) => {
    if (selectedIndexes.length === 0 || isConversationLoading) return;
    let convId = activeConversationId;
    if (!convId) return;
    if (isTyping) cancelStream();
    setPendingChoices([]);
    setPendingUserInput(null);

    const updatePlanConversationTimeline = (updater: (items: TimelineItem[]) => TimelineItem[]) => {
      if (!convId) return;
      updateConversationTimeline(convId, updater);
    };

    const setPlanStatus = (nextStatus: ArtifactStatus) => {
      updatePlanConversationTimeline((items) =>
        items.map((item) =>
          item.type === "artifact" && item.artifactId === artifactId
            ? { ...item, status: nextStatus }
            : item
        )
      );
    };
    const updatePlanStepStatus = (planId: string, stepIndex: number, stepStatus: string) => {
      updatePlanConversationTimeline((items) =>
        items.map((item) => {
          if (item.type !== "artifact" || item.artifactId !== planId) return item;
          const payload = item.payload as { steps?: Array<Record<string, unknown>> };
          if (!payload?.steps || !Array.isArray(payload.steps)) return item;
          const updatedSteps = payload.steps.map((step, idx) =>
            idx === stepIndex ? { ...step, status: stepStatus } : step
          );
          return { ...item, payload: { ...payload, steps: updatedSteps } };
        })
      );
    };

    setPlanStatus("running");
    const replaceRunId = isTyping ? currentRunIdRef.current : null;
    setIsTyping(true);
    streamGenRef.current++;
    const myGen = streamGenRef.current;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const aiMessageId = `m-${Date.now() + 1}`;
    const requestKey = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `ai-plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    let runStatus: string | null = null;
    let terminalReason: StreamTerminalReason | null = null;
    let actualModel: string | null = null;
    let actualModelSource: "provider" | "requested" | "unknown" = "unknown";
    let unresolvedCountBeforeClear: number | null = null;
    let unresolvedCountAfterClear: number | null = null;
    let stopReason: string | null = null;
    let errorMessage: string | null = null;
    let aborted = false;
    let terminalEventEmitted = false;
    const reasoningRequest = resolveReasoningRequest({
      preferredMode: reasoningMode,
      modelId: selectedModel,
    });
    const runtime = createAiStreamRuntime({
      aiMessageId,
      page: "ai",
      initialConversationId: convId,
      selectedProjectId,
      myGen,
      getCurrentGen: () => streamGenRef.current,
      updateConversationTimeline,
      ensureConversationTimeline,
      setActiveConversationId,
      upsertConversationTitle,
      setPendingChoices,
      setPendingUserInput,
      onIntent: handleRunIntent,
      onPlanStepUpdate: updatePlanStepStatus,
      onNavigate: handleNavigate,
    });

    recordReliabilityMetric({
      type: "reliability.v1.stream.started",
      surface: "ai",
      projectId: selectedProjectId,
      conversationId: convId,
      payload: {
        requestKey,
        phase: "plan",
      },
    });

    const emitTerminalMetric = (reason: StreamTerminalReason, status: string | null) => {
      if (terminalEventEmitted) return;
      terminalEventEmitted = true;
      recordReliabilityMetric({
        type: "reliability.v1.stream.terminal",
        surface: "ai",
        projectId: selectedProjectId,
        conversationId: convId,
        payload: {
          requestKey,
          phase: "plan",
          reason,
          runStatus: status,
        },
      });
    };

    try {
      const response = await fetch("/api/ai/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: artifactId,
          selectedSteps: selectedIndexes,
          userMessage: "",
          context: selectedProjectId ? "project" : "global",
          options: {
            conversationId: convId,
            replaceRunId: replaceRunId ?? undefined,
            projectId: selectedProjectId ?? undefined,
            model: selectedModel,
            reasoningMode: reasoningRequest.reasoningMode,
            includeReasoning: reasoningRequest.includeReasoning,
            reasoningBudgetTokens: reasoningRequest.reasoningBudgetTokens,
            page: "ai",
            additionalContext: selectedProjectId
              ? undefined
              : ((workspaceContextText || await ensureWorkspaceContextText()) || undefined),
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`AI request failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const summary = await processAIStream({
        reader,
        signal: controller.signal,
        shouldContinue: () => streamGenRef.current === myGen,
        throwOnErrorChunk: true,
        onChunk: (data) => runtime.handleChunk(data),
      });
      convId = runtime.getConversationId();
      runStatus = summary.runStatus;
      terminalReason = summary.terminalReason;
      actualModel = summary.actualModel;
      actualModelSource = summary.actualModelSource;
      const runEndToolCounts = runtime.getLastRunEndToolCounts();
      unresolvedCountBeforeClear = runEndToolCounts?.beforeClear ?? null;
      unresolvedCountAfterClear = runEndToolCounts?.afterClear ?? null;
      stopReason = summary.stopReason;
      errorMessage = summary.errorMessage;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        aborted = true;
        terminalReason = terminalReasonFromThrownError(err, { isUserAbort: true });
        emitTerminalMetric(terminalReason, runStatus);
      } else {
        terminalReason = terminalReasonFromThrownError(err);
        emitTerminalMetric(terminalReason, runStatus);
        convId = runtime.getConversationId();
        errorMessage = formatStreamErrorForUI(err);
      }
    } finally {
      runtime.clearProgress();
      convId = runtime.getConversationId();
      if (!aborted) {
        const runtimeState = runtime.getState();
        recordChatUnificationMetric({
          type: "stuck_running_tools_after_run_end",
          surface: "ai",
          runId: runtimeState.localRunId || null,
          conversationId: runtime.getConversationId(),
          projectId: selectedProjectId,
          payload: {
            unresolvedCount: runtimeState.runningToolCallIds.length,
            unresolvedCountBeforeClear,
            unresolvedCountAfterClear,
            runStatus,
            streamPhase: "plan",
          },
        });
      }
      if (streamGenRef.current === myGen) {
        setIsTyping(false);
        setConversations((prev) =>
          sortConversationsByUpdatedAt(
            prev.map((conv) =>
              conv.id === convId
                ? { ...conv, updatedAt: new Date().toISOString() }
                : conv
            )
          )
        );
      }
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      if (
        streamGenRef.current === myGen
        && !aborted
        && shouldFailRunningToolsOnAbnormalEnd(terminalReason)
      ) {
        runtime.failRunningTools(ABNORMAL_END_TOOL_FAILURE_SUMMARY);
      }
      if (terminalReason && !aborted) {
        emitTerminalMetric(terminalReason, runStatus);
      }
    }

    const didComplete = terminalReason === "completed";
    setPlanStatus(didComplete ? "accepted" : "proposed");

    if (!didComplete && streamGenRef.current === myGen) {
      const reason = errorMessage ?? (stopReason ? `Execution stopped: ${stopReason}` : "Execution did not complete.");
      const errorState = buildClientErrorState(`Plan execution failed: ${reason}`);
      updateConversationTimeline(convId, (items) => {
        const errorMeta = {
          ...errorState.errorMeta,
          retryable: false,
        };
        const hasRenderedError = hasRenderedErrorMatch({
          items: items.filter((item) => item.type === "error"),
          nextMessage: errorState.message,
          nextMeta: errorMeta,
          getMessage: (item) => item.type === "error" ? item.message : null,
          getErrorMeta: (item) => item.type === "error" ? item.errorMeta : null,
        });
        if (hasRenderedError) {
          return items;
        }
        return [
          ...items,
          {
            type: "error",
            id: `plan-error-${Date.now()}`,
            message: errorState.message,
            retryable: false,
            errorMeta,
            createdAt: new Date().toISOString(),
          },
        ];
      });
    }
  }, [
    activeConversationId,
    isConversationLoading,
    isTyping,
    cancelStream,
    selectedProjectId,
    selectedModel,
    reasoningMode,
    handleNavigate,
    workspaceContextText,
    ensureWorkspaceContextText,
    ensureConversationTimeline,
    upsertConversationTitle,
    sortConversationsByUpdatedAt,
    updateConversationTimeline,
  ]);

  const handleSuggestionClick = useCallback((prompt: string) => {
    setPrefillCommand({ text: prompt, id: crypto.randomUUID() });
  }, []);

  const handleActionPrompt = useCallback((prompt: string, mode?: AgentMode) => {
    void handleSend(prompt, "overview", undefined, undefined, mode);
  }, [handleSend]);

  const handleRetryLastMessage = useCallback((replaceRunId?: string | null) => {
    if (isTyping) return;
    const convId = activeConversationId;
    if (!convId) return;

    const items = timelineByConversation[convId] ?? [];
    let lastUserIndex = -1;
    for (let index = items.length - 1; index >= 0; index--) {
      if (items[index]?.type === "user_message") {
        lastUserIndex = index;
        break;
      }
    }
    if (lastUserIndex < 0) return;

    const lastUser = items[lastUserIndex];
    if (!lastUser || lastUser.type !== "user_message") return;
    const retryText = lastUser.content.trim();
    if (!retryText) return;

    // Remove the failed turn from UI (last user message + trailing AI output/errors),
    // then send the same user prompt again as a fresh turn.
    setTimelineByConversation((prev) => {
      const convItems = prev[convId] ?? [];
      let userIndex = -1;
      for (let index = convItems.length - 1; index >= 0; index--) {
        if (convItems[index]?.type === "user_message") {
          userIndex = index;
          break;
        }
      }
      if (userIndex < 0) return prev;
      return {
        ...prev,
        [convId]: convItems.slice(0, userIndex),
      };
    });

    setPendingChoices([]);
    setPendingUserInput(null);
    setPrefillCommand(null);
    const requestKey = generateChatUnificationRequestKey();
    recordReliabilityMetric({
      type: "reliability.v1.retry.clicked",
      surface: "ai",
      projectId: selectedProjectId,
      conversationId: convId,
      payload: {
        requestKey,
        source: "retry_action",
      },
    });
    void handleSend(
      retryText,
      "ai",
      undefined,
      selectedModel,
      undefined,
      undefined,
      {
        requestKey,
        expectedModel: selectedModel ?? null,
        source: "retry_action",
      },
      undefined,
      replaceRunId ?? undefined,
    );
  }, [isTyping, activeConversationId, timelineByConversation, handleSend, selectedModel, selectedProjectId]);

  const handleReconnectRun = useCallback((item: Extract<TimelineItem, { type: "error" }>) => {
    const convId = activeConversationId;
    const runId = item.errorMeta?.runId ?? item.errorMeta?.activeRunId ?? null;
    if (isTyping || !convId || !runId) return;

    setIsTyping(true);
    streamGenRef.current += 1;
    const myGen = streamGenRef.current;
    currentRunIdRef.current = runId;
    updateConversationTimeline(convId, (items) => {
      const updatedAt = new Date().toISOString();
      return items
        .filter((item) => item.type !== "progress")
        .map((item) => (
          item.type === "tool_activity" && item.status === "running"
            ? {
                ...item,
                status: "interrupted",
                summary: RUN_RECOVERY_INTERRUPTED_TOOL_SUMMARY,
                updatedAt,
              }
            : item
        ));
    });
    appendRecoveryCheckpoint(convId, RUN_RECOVERY_RECONNECT_SUMMARY);

    void recoverConversationRun({
      conversationId: convId,
      runId,
      page: "ai",
    }).then((recoveryResult) => {
      if (recoveryResult.outcome === "recovered") {
        return;
      }
      const recoveryMessage = recoveryResult.outcome === "timeout"
        ? RUN_RECOVERY_TIMEOUT_MESSAGE
        : recoveryResult.outcome === "needs_user_action"
          ? "The active run is still holding this conversation. Choose how to continue."
          : RUN_RECOVERY_FAILED_MESSAGE;
      appendRecoveryTimelineError({
        conversationId: convId,
        message: recoveryMessage,
        errorMeta: createRecoveryErrorEnvelope({
          code: recoveryResult.outcome === "timeout"
            ? "RUN_RECOVERY_TIMEOUT"
            : recoveryResult.outcome === "needs_user_action"
              ? "RUN_RECOVERY_REQUIRES_USER_ACTION"
              : "RUN_RECOVERY_FAILED",
          message: recoveryMessage,
          runId: recoveryResult.response?.runId ?? runId,
          activeRunId: recoveryResult.response?.runId ?? runId,
          lastActivityAt: recoveryResult.response?.lastActivityAt ?? undefined,
          recoveryRecommendation: recoveryResult.response?.recoveryRecommendation
            ?? (recoveryResult.outcome === "needs_user_action" ? "stop_and_retry" : "retry"),
          retryable: (recoveryResult.response?.recoveryRecommendation ?? "retry") === "retry",
        }),
      });
      currentRunIdRef.current = recoveryResult.response?.recoveryRecommendation === "retry"
        ? null
        : (recoveryResult.response?.runId ?? runId);
    }).finally(() => {
      if (streamGenRef.current === myGen) {
        setIsTyping(false);
      }
    });
  }, [
    activeConversationId,
    appendRecoveryCheckpoint,
    appendRecoveryTimelineError,
    isTyping,
    recoverConversationRun,
    updateConversationTimeline,
  ]);

  const handleStopAndRetryRun = useCallback((item: Extract<TimelineItem, { type: "error" }>) => {
    handleRetryLastMessage(item.errorMeta?.runId ?? item.errorMeta?.activeRunId ?? null);
  }, [handleRetryLastMessage]);

  const handlePrefillConsumed = useCallback(() => {
    setPrefillCommand(null);
  }, []);

  const activeConversation = useMemo(
    () => conversations.find((conv) => conv.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const handleExportMarkdown = useCallback(() => {
    if (activeTimeline.length === 0) return;
    const title = activeConversation?.title ?? "AI Conversation";
    const scopeName = selectedProject?.name;
    const conversationTitle = activeConversation?.title;
    void import("./ai-export").then(({ buildExportBaseName, exportTimelineMarkdown }) => {
      exportTimelineMarkdown(activeTimeline, title, buildExportBaseName(scopeName, conversationTitle));
    });
  }, [activeTimeline, activeConversation, selectedProject]);

  const handleExportPdf = useCallback(() => {
    if (activeTimeline.length === 0) return;
    const title = activeConversation?.title ?? "AI Conversation";
    void import("./ai-export").then(({ exportTimelinePdf }) => {
      exportTimelinePdf(activeTimeline, title);
    });
  }, [activeTimeline, activeConversation]);

  return (
    <>
    <AppShell activeNav="ai" noMainPadding initiallyCollapsed>
      <div
        className={styles.layout}
        data-history-collapsed={isHistoryCollapsed}
        data-mobile-ai-v2={mobileAiV2Enabled ? "true" : "false"}
      >
        <aside className={historyClass} aria-label="Chat history">
          <div className={styles.sidebarHeader}>
            <button
              className={styles.sidebarToggle}
              aria-label={isHistoryCollapsed ? "Open chat history" : "Close chat history"}
              aria-expanded={!isHistoryCollapsed}
              aria-controls={historyContentId}
              onClick={handleHistoryToggle}
            >
              <span className="material-icons-round">menu_open</span>
            </button>
          </div>

          <div className={styles.newChatWrapper}>
            <button
              className={`btn btn-primary ${styles.newChatButton}`}
              type="button"
              onClick={handleNewChat}
            >
              <span className="material-icons-round">add</span>
              New Chat
            </button>
          </div>

          {!isHistoryCollapsed ? (
            <AiHistorySidebarContent
              historyContentId={historyContentId}
              isHistoryLoading={isHistoryLoading}
              conversations={conversations}
              historyGroups={historyGroups}
              activeConversationId={activeConversationId}
              renamingId={renamingId}
              renameValue={renameValue}
              contextMenu={contextMenu}
              setRenameValue={setRenameValue}
              onSelectConversation={handleSelectConversation}
              onConversationContextMenu={handleConversationContextMenu}
              onCommitRename={handleCommitRename}
              onCancelRename={handleCancelRename}
              onDismissContextMenu={dismissContextMenu}
              onStartRename={handleStartRename}
              onDuplicateConversation={handleBranchConversation}
              onDeleteConversation={handleDeleteConversation}
            />
          ) : null}
        </aside>
        {mobileAiV2Enabled && isPhoneViewport && !isHistoryCollapsed ? (
          <button
            type="button"
            className={styles.mobileHistoryOverlay}
            aria-label="Close chat history"
            onClick={() => setHistoryCollapsed(true)}
          />
        ) : null}

        <section className={styles.chatInterface} role="region" aria-label="Chat interface">
          <AiChatHeader
            mobileAiV2Enabled={mobileAiV2Enabled}
            isPhoneViewport={isPhoneViewport}
            isHistoryCollapsed={isHistoryCollapsed}
            historyContentId={historyContentId}
            selectedProjectId={selectedProjectId}
            selectedScopeLabel={selectedScopeLabel}
            projects={projects.map((project) => ({ id: project.id, name: project.name }))}
            showReasoningControls={showReasoningControls}
            reasoningMode={reasoningMode}
            reasoningSupport={reasoningSupport}
            activeTimelineLength={activeTimeline.length}
            onHistoryToggle={handleHistoryToggle}
            onSelectProject={setSelectedProjectId}
            onReasoningModeChange={updateReasoningMode}
            onExportMarkdown={handleExportMarkdown}
            onExportPdf={handleExportPdf}
          />

          <div className={styles.chatContent}>
            <AiTimelineRenderer
              variant="page"
              projectId={selectedProjectId ?? undefined}
              items={activeTimeline}
              reasoningMode={reasoningMode}
              isLoading={isTyping}
              isConversationLoading={isConversationLoading}
              conversationId={activeConversationId ?? undefined}
              initialVisibleCount={AI_VISIBLE_TIMELINE_INITIAL_COUNT}
              visibleStep={AI_VISIBLE_TIMELINE_STEP}
              onTimelineReady={handleTimelineReady}
              emptyState={{
                icon: "auto_awesome",
                title: "How can I help with your research?",
                description: "Ask me anything about your literature review, or try one of these:",
                suggestions: quickActions.map((action) => ({
                  label: action.label,
                  prompt: action.prompt,
                })),
              }}
              onSuggestionClick={handleSuggestionClick}
              onActionPrompt={handleActionPrompt}
              onRetryLastMessage={handleRetryLastMessage}
              onReconnectRun={handleReconnectRun}
              onStopAndRetryRun={handleStopAndRetryRun}
              onBranchFromMessage={handleBranchFromMessage}
              onReviewArtifact={handleReviewArtifact}
              onApproveArtifactsBatch={handleApproveArtifactsBatch}
              onExecutePlan={handleExecutePlan}
              onAnswerUserInput={handleAnswerUserInput}
              suppressedProgressId={suppressedProgressId}
            />

            <div className={styles.chatInputContainer}>
              <div className={styles.chatInputStatus}>
                <ComposerActiveProgressBar activeProgress={activeProgress} />
              </div>
              <CopilotInputCoreClient
                page="ai"
                inputPlaceholder="Ask anything about your research..."
                prefillCommand={prefillCommand}
                onPrefillConsumed={handlePrefillConsumed}
                isLoading={isTyping}
                sendMessage={handleSend}
                cancelStream={cancelStream}
                pendingChoices={pendingChoices}
                clearChoices={() => { setPendingChoices([]); setPendingUserInput(null); }}
                selectedModel={selectedModel}
                onModelChange={setSelectedModel}
                modelStorageKey="litrev_ai_model"
                showAutonomyPreset={false}
                showAttachments={false}
                showVoice
                onCompress={handleCompressHistory}
                canCompress={activeTimeline.length >= 20}
                isCompressing={isCompressing}
                onReady={markComposerReady}
              />
              <p className={styles.disclaimer}>AI can make mistakes. Please verify important information.</p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
    </>
  );
}
