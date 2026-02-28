"use client";

import { AppShell } from "@/components/AppShell";
import { TimelineRenderer } from "@/components/copilot/TimelineRenderer";
import { CopilotInputCoreClient } from "@/components/copilot/CopilotInputCoreClient";
import { ReasoningModeDropdown } from "@/components/copilot/ReasoningModeDropdown";
import { useProjects } from "@/contexts/ProjectsContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  listConversations,
  createConversation,
  getConversation,
  archiveConversation,
  branchConversation,
  updateConversationTitle,
} from "@/app/actions/conversations";
import { reviewArtifactAction } from "@/app/actions/agent";
import { getGlobalWorkspaceContextAction } from "@/app/actions/ai-assistant";
import { summarizeConversationAction } from "@/app/actions/summarize-conversation";
import type { AgentMode } from "@/types/agent";
import type { CopilotPage, ConversationContext, ChoiceOption, ReasoningMode, UserInputRequest } from "@/types/ai";
import type { ArtifactStatus, ArtifactType } from "@/types/artifacts";
import type { TimelineItem } from "@/types/timeline";
import { processAIStream } from "@/lib/ai/stream-processor";
import { routeToAgent } from "@/lib/agent/router";
import { dispatchProjectDataChanged, getChangedDomainsForAcceptedArtifact } from "@/lib/project-data-events";
import { isNavigationSafe } from "@/lib/ai/navigation-safety";
import {
  getReasoningModePreference,
  setReasoningModePreference,
  shouldRequestReasoning,
} from "@/lib/ai/reasoning-visibility";
import { useRouter } from "next/navigation";
import styles from "./ai-view.module.css";

const quickActions = [
  { id: "summarize", icon: "description", label: "Summarize a paper", prompt: "I need help summarizing a paper. Here's the abstract: " },
  { id: "draft", icon: "edit_note", label: "Help draft a section", prompt: "Help me draft the Introduction section of my literature review." },
  { id: "find", icon: "search", label: "Find related studies", prompt: "Find me recent papers about " },
  { id: "analyze", icon: "analytics", label: "Analyze findings", prompt: "Analyze the key findings across my collected papers." },
  { id: "compare", icon: "compare_arrows", label: "Compare projects", prompt: "Compare inclusion criteria and progress across my projects. Highlight conflicts and give recommendations." },
  { id: "methodology", icon: "school", label: "Methodology advisor", prompt: "Act as my methodology advisor. Critique my review design and suggest improvements using PRISMA and evidence-quality best practices." },
];

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
  attachments?: Array<{ fileAssetId: string; filename: string; mimeType: string; size: number; isExisting?: boolean }>;
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
  for (const msg of messages) {
    if (msg.role === "user") {
      messageItems.push({
        type: "user_message",
        id: msg.id,
        content: msg.content,
        createdAt: msg.createdAt,
        attachments: msg.attachments?.map((a) => ({
          fileAssetId: a.fileAssetId,
          filename: a.filename,
          mimeType: a.mimeType,
          size: a.size,
        })),
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
    if (item.type === "user_message" || item.type === "assistant_message" || item.type === "artifact" || item.type === "checkpoint" || item.type === "error") {
      return item.createdAt;
    }
    return "";
  };

  return [...messageItems, ...artifactItems].sort(
    (a, b) => new Date(getCreatedAt(a)).getTime() - new Date(getCreatedAt(b)).getTime(),
  );
}

function slugifyFilename(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "conversation";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildTimelineMarkdown(items: TimelineItem[], title: string): string {
  const lines: string[] = [`# ${title}`, "", `Exported: ${new Date().toISOString()}`, ""];

  for (const item of items) {
    if (item.type === "user_message") {
      lines.push("## User");
      lines.push(item.content);
      lines.push("");
      continue;
    }
    if (item.type === "assistant_message") {
      lines.push("## Assistant");
      lines.push(item.content);
      lines.push("");
      continue;
    }
    if (item.type === "artifact") {
      lines.push(`## Artifact: ${item.title} (${item.artifactType}, ${item.status})`);
      lines.push("```json");
      lines.push(JSON.stringify(item.payload, null, 2));
      lines.push("```");
      lines.push("");
      continue;
    }
    if (item.type === "progress") {
      const progress = item.current !== undefined && item.total !== undefined
        ? ` (${item.current}/${item.total})`
        : "";
      lines.push(`- Progress: ${item.message}${progress}`);
      continue;
    }
    if (item.type === "checkpoint") {
      lines.push(`- Checkpoint: ${item.label}`);
      continue;
    }
    if (item.type === "error") {
      lines.push(`- Error: ${item.message}`);
      continue;
    }
  }

  return lines.join("\n").trim() + "\n";
}

function formatMultilineHtml(text: string): string {
  return escapeHtml(text).replace(/\n/g, "<br />");
}

function buildTimelinePrintHtml(items: TimelineItem[], title: string): string {
  const blocks: string[] = [];

  for (const item of items) {
    if (item.type === "user_message") {
      blocks.push(
        `<section class="entry user"><h2>User</h2><p>${formatMultilineHtml(item.content)}</p></section>`
      );
      continue;
    }
    if (item.type === "assistant_message") {
      blocks.push(
        `<section class="entry assistant"><h2>Assistant</h2><p>${formatMultilineHtml(item.content)}</p></section>`
      );
      continue;
    }
    if (item.type === "artifact") {
      blocks.push(
        `<section class="entry artifact"><h2>Artifact: ${escapeHtml(item.title)}</h2><p class="meta">${escapeHtml(
          `${item.artifactType} · ${item.status}`
        )}</p><pre>${escapeHtml(JSON.stringify(item.payload, null, 2))}</pre></section>`
      );
      continue;
    }
    if (item.type === "progress") {
      const progressText = item.current !== undefined && item.total !== undefined
        ? `${item.message} (${item.current}/${item.total})`
        : item.message;
      blocks.push(`<section class="entry progress"><p>${escapeHtml(progressText)}</p></section>`);
      continue;
    }
    if (item.type === "checkpoint") {
      blocks.push(`<section class="entry checkpoint"><p>Checkpoint: ${escapeHtml(item.label)}</p></section>`);
      continue;
    }
    if (item.type === "error") {
      blocks.push(`<section class="entry error"><p>Error: ${escapeHtml(item.message)}</p></section>`);
    }
  }

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light; }
      body {
        font-family: ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        margin: 0;
        color: #1f2937;
        background: #ffffff;
      }
      main {
        max-width: 900px;
        margin: 0 auto;
        padding: 28px 24px 40px;
      }
      h1 { margin: 0 0 6px; font-size: 30px; line-height: 1.2; }
      .meta { color: #6b7280; font-size: 13px; margin: 0 0 20px; }
      .entry {
        margin: 0 0 14px;
        border: 1px solid #e5e7eb;
        border-radius: 12px;
        padding: 12px 14px;
        break-inside: avoid;
      }
      .entry h2 { font-size: 13px; letter-spacing: 0.02em; text-transform: uppercase; color: #6b7280; margin: 0 0 8px; }
      .entry p { margin: 0; line-height: 1.6; }
      .entry.user { background: #f9fafb; }
      .entry.assistant { background: #ffffff; }
      .entry.artifact pre {
        margin: 10px 0 0;
        white-space: pre-wrap;
        word-break: break-word;
        background: #f8fafc;
        border-radius: 10px;
        padding: 10px;
        font-size: 12px;
        line-height: 1.5;
      }
      .entry.progress, .entry.checkpoint { background: #fefce8; border-color: #fde68a; color: #92400e; }
      .entry.error { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
      @media print {
        main { padding: 12mm; }
        .entry { page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p class="meta">Exported: ${escapeHtml(new Date().toISOString())}</p>
      ${blocks.join("\n")}
    </main>
  </body>
</html>`;
}

export default function AIView() {
  const router = useRouter();
  const { projects } = useProjects();
  const [isHistoryCollapsed, setHistoryCollapsed] = useState(false);

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isProjectDropdownOpen, setProjectDropdownOpen] = useState(false);

  const [workspaceContextText, setWorkspaceContextText] = useState("");
  const [workspaceProjectCount, setWorkspaceProjectCount] = useState(0);
  const [isTyping, setIsTyping] = useState(false);
  const [isCompressing, setIsCompressing] = useState(false);
  const [branchingConversationId, setBranchingConversationId] = useState<string | null>(null);
  const [branchingMessageId, setBranchingMessageId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; conversationId: string } | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [pendingChoices, setPendingChoices] = useState<ChoiceOption[]>([]);
  const [pendingUserInput, setPendingUserInput] = useState<UserInputRequest | null>(null);
  const [prefillCommand, setPrefillCommand] = useState<{ text: string; id: string } | null>(null);
  const [reasoningMode, setReasoningMode] = useState<ReasoningMode>(() => getReasoningModePreference());

  const [timelineByConversation, setTimelineByConversation] = useState<Record<string, TimelineItem[]>>({});
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  // LRU order: tracks up to 5 recently accessed conversation IDs so we evict old timelines
  const timelineLruRef = useRef<string[]>([]);

  const historyContentId = "chat-history-panel";
  const projectDropdownRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamGenRef = useRef(0);
  const sendLockRef = useRef(false);
  const activeConversationIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isTyping) sendLockRef.current = false;
  }, [isTyping]);
  useEffect(() => {
    activeConversationIdRef.current = activeConversationId;
  }, [activeConversationId]);

  const updateReasoningMode = useCallback((mode: ReasoningMode) => {
    setReasoningMode(mode);
    setReasoningModePreference(mode);
  }, []);

  const handleNavigate = useCallback((url?: string) => {
    if (!url || !isNavigationSafe(url)) return;
    router.push(url);
  }, [router]);


  useEffect(() => {
    let active = true;

    if (selectedProjectId) {
      setWorkspaceContextText("");
      setWorkspaceProjectCount(0);
      return () => {
        active = false;
      };
    }

    getGlobalWorkspaceContextAction()
      .then((result) => {
        if (!active) return;
        if (result.success) {
          setWorkspaceContextText(result.data.contextText);
          setWorkspaceProjectCount(result.data.projectCount);
        }
      })
      .catch((err) => {
        console.error("Failed to load global workspace context", err);
        if (!active) return;
        setWorkspaceContextText("");
        setWorkspaceProjectCount(0);
      });

    return () => {
      active = false;
    };
  }, [selectedProjectId]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!isProjectDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (projectDropdownRef.current && !projectDropdownRef.current.contains(e.target as Node)) {
        setProjectDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isProjectDropdownOpen]);

  useEffect(() => {
    let isActive = true;
    const load = async () => {
      const listResult = await listConversations({
        projectId: selectedProjectId ?? undefined,
        page: "ai",
      });
      if (!isActive) return;
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
      setConversations(mapped);
      setActiveConversationId(null);
      setTimelineByConversation({});
      timelineLruRef.current = [];   // reset LRU so eviction doesn't drift across scopes
      setPendingChoices([]);
      setPendingUserInput(null);
      setPrefillCommand(null);
    };
    load().catch((err) => {
      console.error("Failed to load AI conversations", err);
    });
    return () => {
      isActive = false;
    };
  }, [selectedProjectId]);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedScopeLabel = selectedProject
    ? selectedProject.name
    : `Global${workspaceProjectCount > 0 ? ` (${workspaceProjectCount} projects)` : ""}`;
  const historyClass = useMemo(
    () => `${styles.historySidebar} ${isHistoryCollapsed ? styles.collapsed : ""}`,
    [isHistoryCollapsed]
  );
  const historyGroups = useMemo(() => groupConversationsByDate(conversations), [conversations]);
  const activeTimeline = activeConversationId ? (timelineByConversation[activeConversationId] ?? []) : [];

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
    setActiveConversationId(id);
    setPendingChoices([]);
    setPendingUserInput(null);
    // Only show skeleton if we don't already have this conversation cached
    const alreadyCached = !!timelineByConversation[id];
    if (!alreadyCached) setIsConversationLoading(true);
    try {
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
  }, [timelineByConversation, updateConversationTimeline]);

  const handleDeleteConversation = useCallback(async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    let archived = false;
    try {
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

  const handleCompressHistory = useCallback(async () => {
    const sourceId = activeConversationId;
    if (!sourceId || isCompressing) return;
    if (isTyping) cancelStream();
    setIsCompressing(true);
    try {
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
    const context: ConversationContext = selectedProjectId ? "project" : "global";
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
    setPendingChoices([]);
    setPendingUserInput(null);
    setPrefillCommand(null);
  }, [selectedProjectId, sortConversationsByUpdatedAt, updateConversationTimeline]);

  const handleSend = useCallback(async (
    rawText: string,
    currentPage: CopilotPage,
    _section?: string,
    model?: string,
    agentMode?: AgentMode,
    _studyId?: string,
  ) => {
    const msgText = rawText.trim();
    if (!msgText || sendLockRef.current) return;
    if (isTyping) cancelStream();
    sendLockRef.current = true;
    setPendingChoices([]);
    setPendingUserInput(null);

    const context: ConversationContext = selectedProjectId ? "project" : "global";
    const effectiveAgentMode = agentMode ?? routeToAgent(msgText, "overview");

    let convId = await ensureConversation(context);

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
    setIsTyping(true);
    streamGenRef.current++;
    const myGen = streamGenRef.current;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const aiMessageId = `m-${Date.now() + 1}`;
    let aiMessageCreated = false;
    let fullContent = "";
    let reasoningContent = "";
    let reasoningState: "streaming" | "done" = "done";
    let reasoningTruncated = false;
    let activeReasoningId: string | null = null;
    let progressItemId: string | null = null;

    const upsertAssistant = (content: string) => {
      updateConversationTimeline(convId, (items) => {
        const idx = items.findIndex((it) => it.type === "assistant_message" && it.id === aiMessageId);
        if (idx === -1) {
          return [
            ...items,
            {
              type: "assistant_message",
              id: aiMessageId,
              content,
              reasoning: reasoningContent
                ? {
                    text: reasoningContent,
                    state: reasoningState,
                    truncated: reasoningTruncated || undefined,
                  }
                : undefined,
              createdAt: new Date().toISOString(),
            },
          ];
        }

        const next = [...items];
        const current = next[idx] as Extract<TimelineItem, { type: "assistant_message" }>;
        next[idx] = {
          ...current,
          content,
          reasoning: reasoningContent
            ? {
                text: reasoningContent,
                state: reasoningState,
                truncated: reasoningTruncated || undefined,
              }
            : current.reasoning,
        };
        return next;
      });
      aiMessageCreated = true;
    };

    const upsertProgress = (message: string, current?: number, total?: number) => {
      updateConversationTimeline(convId, (items) => {
        if (!progressItemId) {
          progressItemId = `progress-${Date.now()}`;
          return [
            ...items,
            {
              type: "progress",
              id: progressItemId,
              message,
              current,
              total,
            },
          ];
        }

        const idx = items.findIndex((it) => it.type === "progress" && it.id === progressItemId);
        if (idx === -1) {
          return [
            ...items,
            {
              type: "progress",
              id: progressItemId,
              message,
              current,
              total,
            },
          ];
        }

        const next = [...items];
        const prevProgress = next[idx] as Extract<TimelineItem, { type: "progress" }>;
        next[idx] = {
          ...prevProgress,
          message,
          current,
          total,
        };
        return next;
      });
    };

    const clearProgress = () => {
      if (!progressItemId) return;
      const progressId = progressItemId;
      progressItemId = null;
      updateConversationTimeline(convId, (items) =>
        items.filter((item) => !(item.type === "progress" && item.id === progressId))
      );
    };

    const updatePlanStepStatus = (planId: string, stepIndex: number, stepStatus: string) => {
      updateConversationTimeline(convId, (items) =>
        items.map((item) => {
          if (item.type !== "artifact" || item.artifactId !== planId) return item;
          const payload = item.payload as { steps?: Array<Record<string, unknown>> };
          if (!payload?.steps || !Array.isArray(payload.steps)) return item;

          const updatedSteps = payload.steps.map((step, idx) =>
            idx === stepIndex ? { ...step, status: stepStatus } : step
          );

          return {
            ...item,
            payload: {
              ...payload,
              steps: updatedSteps,
            },
          };
        })
      );
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
            projectId: selectedProjectId ?? undefined,
            model,
            reasoningMode,
            includeReasoning: shouldRequestReasoning(reasoningMode),
            reasoningBudgetTokens: shouldRequestReasoning(reasoningMode) ? 4096 : undefined,
            agentMode: effectiveAgentMode,
            page: currentPage,

            additionalContext: selectedProjectId ? undefined : (workspaceContextText || undefined),
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

      await processAIStream({
        reader,
        signal: controller.signal,
        shouldContinue: () => streamGenRef.current === myGen,
        throwOnErrorChunk: true,
        onChunk: (data) => {
          if (data.type === "run_start") {
            if (data.conversationId && convId !== data.conversationId) {
              convId = data.conversationId;
              setActiveConversationId(data.conversationId);
              setTimelineByConversation((prev) => ({
                ...prev,
                [data.conversationId!]: prev[data.conversationId!] ?? [],
              }));
            }
            return;
          }

          if (data.type === "conversation_title") {
            const targetId = data.conversationId || convId;
            const nextTitle = data.conversationTitle?.trim();
            if (targetId && nextTitle) {
              setConversations((prev) => {
                const existing = prev.find((c) => c.id === targetId);
                if (!existing) {
                  const now = new Date().toISOString();
                  return sortConversationsByUpdatedAt([{
                    id: targetId,
                    title: nextTitle,
                    projectId: selectedProjectId ?? undefined,
                    createdAt: now,
                    updatedAt: now,
                  }, ...prev]);
                }
                return prev.map((c) => (c.id === targetId ? { ...c, title: nextTitle } : c));
              });
            }
            return;
          }

          if (data.type === "navigate") {
            handleNavigate(data.navigateUrl);
            return;
          }

          if (data.type === "content" && data.content) {
            clearProgress();
            fullContent += data.content;
            upsertAssistant(fullContent);
            return;
          }

          if (data.type === "reasoning_start") {
            if (reasoningContent.trim().length > 0) {
              reasoningContent += "\n\n";
            }
            reasoningState = "streaming";
            activeReasoningId = data.reasoningId ?? activeReasoningId;
            upsertAssistant(fullContent);
            return;
          }

          if (data.type === "reasoning_delta") {
            if (reasoningTruncated) return;
            if (activeReasoningId && data.reasoningId && data.reasoningId !== activeReasoningId) return;
            const delta = data.reasoningText ?? "";
            if (!delta) return;
            const next = `${reasoningContent}${delta}`;
            if (next.length > 8000) {
              reasoningContent = `${next.slice(0, 8000)}\n\n[Thinking output truncated]`;
              reasoningTruncated = true;
            } else {
              reasoningContent = next;
            }
            reasoningState = "streaming";
            activeReasoningId = data.reasoningId ?? activeReasoningId;
            upsertAssistant(fullContent);
            return;
          }

          if (data.type === "reasoning_end") {
            if (activeReasoningId && data.reasoningId && data.reasoningId !== activeReasoningId) return;
            reasoningState = "done";
            activeReasoningId = null;
            upsertAssistant(fullContent);
            return;
          }

          if (data.type === "tool_call" && data.toolCall && !fullContent) {
            const toolName = data.toolCall.name;
            const statusText = toolName === "search_pubmed"
              ? "Searching PubMed..."
              : toolName === "add_to_ledger"
                ? "Adding studies to ledger..."
                : `Running ${toolName}...`;
            upsertProgress(statusText);
            return;
          }

          if (data.type === "tool_result" && !fullContent) {
            upsertProgress("Processing results...");
            return;
          }

          if (data.type === "artifact") {
            updateConversationTimeline(convId, (items) => [
              ...items,
              {
                type: "artifact",
                id: `artifact-${data.artifactId ?? Date.now()}`,
                artifactId: data.artifactId ?? "",
                artifactType: (data.artifactType ?? "plan") as ArtifactType,
                status: (data.artifactStatus ?? "proposed") as ArtifactStatus,
                title: data.artifactTitle ?? "Artifact",
                payload: data.artifactPayload ?? {},
                version: data.artifactVersion ?? 1,
                createdAt: new Date().toISOString(),
              },
            ]);
            return;
          }

          if (data.type === "progress") {
            upsertProgress(data.progressMessage ?? "Working...", data.progressCurrent, data.progressTotal);
            return;
          }

          if (data.type === "checkpoint") {
            updateConversationTimeline(convId, (items) => [
              ...items,
              {
                type: "checkpoint",
                id: `checkpoint-${Date.now()}`,
                label: data.checkpointLabel ?? "Checkpoint",
                createdAt: new Date().toISOString(),
              },
            ]);
            return;
          }

          if (data.type === "choices") {
            setPendingChoices(data.choices ?? []);
            return;
          }

          if (data.type === "user_input_required" && data.userInputRequest) {
            setPendingUserInput(data.userInputRequest);
            updateConversationTimeline(convId, (items) => [
              ...items,
              {
                type: "user_input_request" as const,
                id: `user-input-${data.userInputRequest!.callId}`,
                callId: data.userInputRequest!.callId,
                question: data.userInputRequest!.question,
                questionType: data.userInputRequest!.questionType,
                options: data.userInputRequest!.options,
                header: data.userInputRequest!.header,
                context: data.userInputRequest!.context,
                answered: false,
                createdAt: new Date().toISOString(),
              },
            ]);
            return;
          }

          if (data.type === "plan_step_update" && data.planId && data.stepIndex !== undefined && data.stepStatus) {
            updatePlanStepStatus(data.planId, data.stepIndex, data.stepStatus);
          }
        },
      });
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        const errorText = err instanceof Error ? err.message : "AI request failed";
        if (!aiMessageCreated) {
          updateConversationTimeline(convId, (items) => [
            ...items,
            {
              type: "error",
              id: `error-${Date.now()}`,
              message: errorText,
              retryable: true,
              createdAt: new Date().toISOString(),
            },
          ]);
        } else {
          upsertAssistant(`${fullContent}\n\nError: ${errorText}`);
        }
      }
    } finally {
      clearProgress();
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
    }
  }, [
    isTyping,
    cancelStream,
    selectedProjectId,
    reasoningMode,
    handleNavigate,

    workspaceContextText,
    ensureConversation,
    updateConversationTimeline,
    sortConversationsByUpdatedAt,
  ]);

  const handleAnswerUserInput = useCallback((callId: string, answer: string) => {
    // Mark the timeline card as answered
    if (activeConversationId) {
      updateConversationTimeline(activeConversationId, (items) =>
        items.map((item) =>
          item.type === "user_input_request" && item.callId === callId
            ? { ...item, answered: true, answer }
            : item,
        ),
      );
    }
    setPendingUserInput(null);
    // Send the answer as a user message so the AI continues
    void handleSend(answer, "ai");
  }, [activeConversationId, updateConversationTimeline, handleSend]);

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
    const convId = activeConversationId;
    if (!convId) return;
    if (isTyping) cancelStream();
    setPendingChoices([]);
    setPendingUserInput(null);

    const setPlanStatus = (nextStatus: ArtifactStatus) => {
      updateConversationTimeline(convId, (items) =>
        items.map((item) =>
          item.type === "artifact" && item.artifactId === artifactId
            ? { ...item, status: nextStatus }
            : item
        )
      );
    };
    const updatePlanStepStatus = (planId: string, stepIndex: number, stepStatus: string) => {
      updateConversationTimeline(convId, (items) =>
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
    setIsTyping(true);
    streamGenRef.current++;
    const myGen = streamGenRef.current;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const aiMessageId = `m-${Date.now() + 1}`;
    let aiMessageCreated = false;
    let fullContent = "";
    let reasoningContent = "";
    let reasoningState: "streaming" | "done" = "done";
    let reasoningTruncated = false;
    let activeReasoningId: string | null = null;
    let progressItemId: string | null = null;
    let runStatus: string | null = null;
    let stopReason: string | null = null;
    let errorMessage: string | null = null;

    const upsertAssistant = (content: string) => {
      updateConversationTimeline(convId, (items) => {
        const idx = items.findIndex((it) => it.type === "assistant_message" && it.id === aiMessageId);
        if (idx === -1) {
          return [
            ...items,
            {
              type: "assistant_message",
              id: aiMessageId,
              content,
              reasoning: reasoningContent
                ? {
                    text: reasoningContent,
                    state: reasoningState,
                    truncated: reasoningTruncated || undefined,
                  }
                : undefined,
              createdAt: new Date().toISOString(),
            },
          ];
        }
        const next = [...items];
        const current = next[idx] as Extract<TimelineItem, { type: "assistant_message" }>;
        next[idx] = {
          ...current,
          content,
          reasoning: reasoningContent
            ? {
                text: reasoningContent,
                state: reasoningState,
                truncated: reasoningTruncated || undefined,
              }
            : current.reasoning,
        };
        return next;
      });
      aiMessageCreated = true;
    };
    const upsertProgress = (message: string, current?: number, total?: number) => {
      updateConversationTimeline(convId, (items) => {
        if (!progressItemId) {
          progressItemId = `progress-${Date.now()}`;
          return [...items, { type: "progress", id: progressItemId, message, current, total }];
        }
        const idx = items.findIndex((it) => it.type === "progress" && it.id === progressItemId);
        if (idx === -1) {
          return [...items, { type: "progress", id: progressItemId, message, current, total }];
        }
        const next = [...items];
        const prevProgress = next[idx] as Extract<TimelineItem, { type: "progress" }>;
        next[idx] = { ...prevProgress, message, current, total };
        return next;
      });
    };
    const clearProgress = () => {
      if (!progressItemId) return;
      const progressId = progressItemId;
      progressItemId = null;
      updateConversationTimeline(convId, (items) =>
        items.filter((item) => !(item.type === "progress" && item.id === progressId))
      );
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
            projectId: selectedProjectId ?? undefined,
            reasoningMode,
            includeReasoning: shouldRequestReasoning(reasoningMode),
            reasoningBudgetTokens: shouldRequestReasoning(reasoningMode) ? 4096 : undefined,
            agentMode: "general",
            page: "ai",
            additionalContext: selectedProjectId ? undefined : (workspaceContextText || undefined),
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
        onChunk: (data) => {
          if (data.type === "run_start") {
            if (data.conversationId && convId !== data.conversationId) {
              setActiveConversationId(data.conversationId);
              setTimelineByConversation((prev) => ({
                ...prev,
                [data.conversationId!]: prev[data.conversationId!] ?? [],
              }));
            }
            return;
          }
          if (data.type === "conversation_title") {
            const targetId = data.conversationId || convId;
            const nextTitle = data.conversationTitle?.trim();
            if (targetId && nextTitle) {
              setConversations((prev) => {
                const existing = prev.find((c) => c.id === targetId);
                if (!existing) {
                  const now = new Date().toISOString();
                  return sortConversationsByUpdatedAt([{
                    id: targetId,
                    title: nextTitle,
                    projectId: selectedProjectId ?? undefined,
                    createdAt: now,
                    updatedAt: now,
                  }, ...prev]);
                }
                return prev.map((c) => (c.id === targetId ? { ...c, title: nextTitle } : c));
              });
            }
            return;
          }
          if (data.type === "navigate") {
            handleNavigate(data.navigateUrl);
            return;
          }
          if (data.type === "content" && data.content) {
            clearProgress();
            fullContent += data.content;
            upsertAssistant(fullContent);
            return;
          }
          if (data.type === "reasoning_start") {
            if (reasoningContent.trim().length > 0) reasoningContent += "\n\n";
            reasoningState = "streaming";
            activeReasoningId = data.reasoningId ?? activeReasoningId;
            upsertAssistant(fullContent);
            return;
          }
          if (data.type === "reasoning_delta") {
            if (reasoningTruncated) return;
            if (activeReasoningId && data.reasoningId && data.reasoningId !== activeReasoningId) return;
            const delta = data.reasoningText ?? "";
            if (!delta) return;
            const next = `${reasoningContent}${delta}`;
            if (next.length > 8000) {
              reasoningContent = `${next.slice(0, 8000)}\n\n[Thinking output truncated]`;
              reasoningTruncated = true;
            } else {
              reasoningContent = next;
            }
            reasoningState = "streaming";
            activeReasoningId = data.reasoningId ?? activeReasoningId;
            upsertAssistant(fullContent);
            return;
          }
          if (data.type === "reasoning_end") {
            if (activeReasoningId && data.reasoningId && data.reasoningId !== activeReasoningId) return;
            reasoningState = "done";
            activeReasoningId = null;
            upsertAssistant(fullContent);
            return;
          }
          if (data.type === "tool_call" && data.toolCall && !fullContent) {
            upsertProgress(`Running ${data.toolCall.name}...`);
            return;
          }
          if (data.type === "tool_result" && !fullContent) {
            upsertProgress("Processing results...");
            return;
          }
          if (data.type === "progress") {
            upsertProgress(data.progressMessage ?? "Working...", data.progressCurrent, data.progressTotal);
            return;
          }
          if (data.type === "plan_step_update" && data.planId && data.stepIndex !== undefined && data.stepStatus) {
            updatePlanStepStatus(data.planId, data.stepIndex, data.stepStatus);
            return;
          }
          if (data.type === "choices") {
            setPendingChoices(data.choices ?? []);
            return;
          }
          if (data.type === "artifact") {
            updateConversationTimeline(convId, (items) => [
              ...items,
              {
                type: "artifact",
                id: `artifact-${data.artifactId ?? Date.now()}`,
                artifactId: data.artifactId ?? "",
                artifactType: (data.artifactType ?? "plan") as ArtifactType,
                status: (data.artifactStatus ?? "proposed") as ArtifactStatus,
                title: data.artifactTitle ?? "Artifact",
                payload: data.artifactPayload ?? {},
                version: data.artifactVersion ?? 1,
                createdAt: new Date().toISOString(),
              },
            ]);
          }
        },
      });
      runStatus = summary.runStatus;
      stopReason = summary.stopReason;
      errorMessage = summary.errorMessage;
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        errorMessage = err instanceof Error ? err.message : "Plan execution failed";
      }
    } finally {
      clearProgress();
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
    }

    const didComplete = runStatus === "completed";
    setPlanStatus(didComplete ? "accepted" : "proposed");

    if (!didComplete && streamGenRef.current === myGen) {
      const reason = errorMessage ?? (stopReason ? `Execution stopped: ${stopReason}` : "Execution did not complete.");
      if (!aiMessageCreated) {
        updateConversationTimeline(convId, (items) => [
          ...items,
          {
            type: "error",
            id: `plan-error-${Date.now()}`,
            message: `Plan execution failed: ${reason}`,
            retryable: false,
            createdAt: new Date().toISOString(),
          },
        ]);
      } else {
        upsertAssistant(`${fullContent}\n\nPlan execution failed: ${reason}`);
      }
    }
  }, [
    activeConversationId,
    isConversationLoading,
    isTyping,
    cancelStream,
    selectedProjectId,
    reasoningMode,
    handleNavigate,
    workspaceContextText,
    sortConversationsByUpdatedAt,
    updateConversationTimeline,
  ]);

  const handleSuggestionClick = useCallback((prompt: string) => {
    setPrefillCommand({ text: prompt, id: crypto.randomUUID() });
  }, []);

  const handleActionPrompt = useCallback((prompt: string, mode?: AgentMode) => {
    void handleSend(prompt, "overview", undefined, undefined, mode);
  }, [handleSend]);

  const handleRetryLastMessage = useCallback(() => {
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
    void handleSend(retryText, "ai");
  }, [isTyping, activeConversationId, timelineByConversation, handleSend]);

  const handlePrefillConsumed = useCallback(() => {
    setPrefillCommand(null);
  }, []);

  const activeConversation = useMemo(
    () => conversations.find((conv) => conv.id === activeConversationId) ?? null,
    [conversations, activeConversationId]
  );

  const exportBaseName = useMemo(() => {
    const scopePart = selectedProject?.name ?? "global";
    const titlePart = activeConversation?.title ?? "conversation";
    return `${slugifyFilename(scopePart)}-${slugifyFilename(titlePart)}`;
  }, [selectedProject, activeConversation]);

  const handleExportMarkdown = useCallback(() => {
    if (activeTimeline.length === 0) return;
    const title = activeConversation?.title ?? "AI Conversation";
    const markdown = buildTimelineMarkdown(activeTimeline, title);
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `${exportBaseName}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(href);
  }, [activeTimeline, activeConversation, exportBaseName]);

  const handleExportPdf = useCallback(() => {
    if (activeTimeline.length === 0) return;
    const title = activeConversation?.title ?? "AI Conversation";
    const html = buildTimelinePrintHtml(activeTimeline, title);
    const printWindow = window.open("", "_blank", "noopener,noreferrer");
    if (!printWindow) return;
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    let hasPrinted = false;
    const triggerPrint = () => {
      if (hasPrinted || printWindow.closed) return;
      hasPrinted = true;
      printWindow.focus();
      printWindow.print();
    };
    printWindow.onload = () => {
      triggerPrint();
    };
    window.setTimeout(triggerPrint, 180);
  }, [activeTimeline, activeConversation]);

  return (
    <>
    <AppShell activeNav="ai" noMainPadding initiallyCollapsed>
      <div className={styles.layout} data-history-collapsed={isHistoryCollapsed}>
        <aside className={historyClass} aria-label="Chat history">
          <div className={styles.sidebarHeader}>
            <button
              className={styles.sidebarToggle}
              aria-label={isHistoryCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              aria-expanded={!isHistoryCollapsed}
              aria-controls={historyContentId}
              onClick={() => setHistoryCollapsed((prev) => !prev)}
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

          <div id={historyContentId} aria-hidden={isHistoryCollapsed}>
            <div className={styles.historyList}>
              {historyGroups.map((group) => (
                <div className={styles.historyGroup} key={group.title}>
                  <h4 className={styles.historyHeading}>{group.title}</h4>
                  {group.items.map((conv) => (
                    <div
                      key={conv.id}
                      className={`${styles.historyItem} ${activeConversationId === conv.id ? styles.activeHistory : ""}`}
                      onContextMenu={(e) => handleConversationContextMenu(e, conv.id)}
                    >
                      {renamingId === conv.id ? (
                        <input
                          className={styles.renameInput}
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onBlur={handleCommitRename}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCommitRename();
                            if (e.key === "Escape") handleCancelRename();
                          }}
                          autoFocus
                        />
                      ) : (
                        <button
                          type="button"
                          className={styles.historySelectBtn}
                          onClick={() => handleSelectConversation(conv.id)}
                          aria-current={activeConversationId === conv.id ? "true" : undefined}
                        >
                          <span className={styles.historyTitle}>{conv.title ?? "New conversation"}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        className={styles.moreBtn}
                        onClick={(e) => handleConversationContextMenu(e, conv.id)}
                        aria-label="More options"
                      >
                        <span className="material-icons-round">more_vert</span>
                      </button>
                    </div>
                  ))}
                </div>
              ))}

              {conversations.length === 0 && (
                <div className={styles.emptyHistory}>
                  <span className="material-icons-round">forum</span>
                  <p>No conversations yet</p>
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className={styles.chatInterface} role="region" aria-label="Chat interface">
          <div className={styles.chatHeader}>
            <div className={styles.projectSelector} ref={projectDropdownRef}>
              <button
                className={styles.projectButton}
                onClick={() => setProjectDropdownOpen((prev) => !prev)}
                aria-expanded={isProjectDropdownOpen}
              >
                <span className="material-icons-round">{selectedProject ? "folder" : "public"}</span>
                <span>{selectedScopeLabel}</span>
                <span className="material-icons-round">expand_more</span>
              </button>

              {isProjectDropdownOpen && (
                <div className={styles.projectDropdown}>
                  <button
                    className={`${styles.projectOption} ${!selectedProjectId ? styles.projectOptionActive : ""}`}
                    onClick={() => {
                      setSelectedProjectId(null);
                      setProjectDropdownOpen(false);
                    }}
                  >
                    Global
                  </button>
                  {projects.map((project) => (
                    <button
                      key={project.id}
                      className={`${styles.projectOption} ${selectedProjectId === project.id ? styles.projectOptionActive : ""}`}
                      onClick={() => {
                        setSelectedProjectId(project.id);
                        setProjectDropdownOpen(false);
                      }}
                    >
                      {project.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className={styles.headerActions}>
              <ReasoningModeDropdown
                reasoningMode={reasoningMode}
                onReasoningModeChange={updateReasoningMode}
              >
                <button
                  type="button"
                  className={styles.reasoningModeBtn}
                  data-state={reasoningMode}
                  aria-label={`Reasoning visibility: ${reasoningMode}`}
                  title={`Reasoning visibility: ${reasoningMode}`}
                >
                  <span className="material-icons-round">psychology</span>
                  <span className={styles.reasoningModeLabel}>
                    {reasoningMode === "off" ? "Off" : reasoningMode === "summary" ? "Summary" : "Full"}
                  </span>
                  <span className="material-icons-round">expand_more</span>
                </button>
              </ReasoningModeDropdown>
              <button
                type="button"
                className={styles.exportBtn}
                onClick={handleExportMarkdown}
                disabled={activeTimeline.length === 0}
              >
                <span className="material-icons-round">download</span>
                Export MD
              </button>
              <button
                type="button"
                className={styles.exportBtn}
                onClick={handleExportPdf}
                disabled={activeTimeline.length === 0}
              >
                <span className="material-icons-round">picture_as_pdf</span>
                Export PDF
              </button>
            </div>
          </div>

          <div className={styles.chatContent}>
            <TimelineRenderer
              variant="page"
              projectId={selectedProjectId ?? undefined}
              items={activeTimeline}
              reasoningMode={reasoningMode}
              isLoading={isTyping}
              isConversationLoading={isConversationLoading}
              conversationId={activeConversationId ?? undefined}
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
              onBranchFromMessage={handleBranchFromMessage}
              onReviewArtifact={handleReviewArtifact}
              onApproveArtifactsBatch={handleApproveArtifactsBatch}
              onExecutePlan={handleExecutePlan}
              onAnswerUserInput={handleAnswerUserInput}
            />

            <div className={styles.chatInputContainer}>
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
                pendingUserInput={pendingUserInput}
                onAnswerUserInput={handleAnswerUserInput}
                modelStorageKey="litrev_ai_model"
                showAutonomyPreset={false}
                showAttachments={false}
                showVoice
                onCompress={handleCompressHistory}
                canCompress={activeTimeline.length >= 20}
                isCompressing={isCompressing}
              />
              <p className={styles.disclaimer}>AI can make mistakes. Please verify important information.</p>
            </div>
          </div>
        </section>
      </div>

    </AppShell>

    {contextMenu && createPortal(
      <div
        className={styles.contextMenu}
        style={{ top: contextMenu.y, left: contextMenu.x }}
        onClick={dismissContextMenu}
      >
        <button
          type="button"
          className={styles.contextMenuItem}
          onClick={() => handleStartRename(contextMenu.conversationId)}
        >
          <span className="material-icons-round">edit</span>
          Rename
        </button>
        <button
          type="button"
          className={styles.contextMenuItem}
          onClick={(e) => handleBranchConversation(contextMenu.conversationId, e)}
        >
          <span className="material-icons-round">content_copy</span>
          Duplicate
        </button>
        <button
          type="button"
          className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
          onClick={(e) => handleDeleteConversation(contextMenu.conversationId, e)}
        >
          <span className="material-icons-round">delete_outline</span>
          Delete
        </button>
      </div>,
      document.body,
    )}
    </>
  );
}
