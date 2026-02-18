"use client";

import { AppShell } from "@/components/AppShell";
import { TimelineRenderer } from "@/components/copilot/TimelineRenderer";
import { CopilotInputCore } from "@/components/copilot/CopilotInputCore";
import { useProjects } from "@/contexts/ProjectsContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  listConversations,
  createConversation,
  getConversation,
  archiveConversation,
  branchConversation,
} from "@/app/actions/conversations";
import { reviewArtifactAction } from "@/app/actions/agent";
import { getGlobalWorkspaceContextAction } from "@/app/actions/ai-assistant";
import { summarizeConversationAction } from "@/app/actions/summarize-conversation";
import type { AgentMode } from "@/types/agent";
import type { CopilotPage, ConversationContext, ChoiceOption } from "@/types/ai";
import type { ArtifactStatus, ArtifactType } from "@/types/artifacts";
import type { TimelineItem } from "@/types/timeline";
import { processAIStream } from "@/lib/ai/stream-processor";
import { routeToAgent } from "@/lib/agent/router";
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
  title: string;
  projectId?: string;
  createdAt: string;
  updatedAt: string;
};

function deriveTitleFromPrompt(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "New Chat";
  return trimmed.slice(0, 40) + (trimmed.length > 40 ? "..." : "");
}

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
  const [pendingChoices, setPendingChoices] = useState<ChoiceOption[]>([]);
  const [prefill, setPrefill] = useState("");

  const [timelineByConversation, setTimelineByConversation] = useState<Record<string, TimelineItem[]>>({});
  const [isConversationLoading, setIsConversationLoading] = useState(false);
  // LRU order: tracks up to 5 recently accessed conversation IDs so we evict old timelines
  const timelineLruRef = useRef<string[]>([]);

  const historyContentId = "chat-history-panel";
  const projectDropdownRef = useRef<HTMLDivElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamGenRef = useRef(0);
  const sendLockRef = useRef(false);

  useEffect(() => {
    if (!isTyping) sendLockRef.current = false;
  }, [isTyping]);


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
        setWorkspaceContextText(result.contextText);
        setWorkspaceProjectCount(result.projectCount);
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
      const summaries = await listConversations({
        projectId: selectedProjectId ?? undefined,
        page: "ai",
      });
      if (!isActive) return;
      const mapped: ChatConversation[] = summaries.map((s) => ({
        id: s.id,
        title: s.title ?? "New Chat",
        projectId: s.projectId ?? undefined,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
      setConversations(mapped);
      setActiveConversationId(null);
      setTimelineByConversation({});
      timelineLruRef.current = [];   // reset LRU so eviction doesn't drift across scopes
      setPendingChoices([]);
      setPrefill("");
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
  }, []);

  const ensureConversation = useCallback(async (context: ConversationContext): Promise<string> => {
    if (activeConversationId) return activeConversationId;

    const { id } = await createConversation({
      context,
      projectId: selectedProjectId ?? undefined,
      page: "ai",
    });

    const now = new Date().toISOString();
    const newConv: ChatConversation = {
      id,
      title: "New Chat",
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
    // Only show skeleton if we don't already have this conversation cached
    const alreadyCached = !!timelineByConversation[id];
    if (!alreadyCached) setIsConversationLoading(true);
    try {
      const full = await getConversation(id);
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
    try {
      await archiveConversation(id);
    } catch (err) {
      console.error("Failed to archive conversation", err);
    }

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
      const branched = await branchConversation({ conversationId: id });
      const full = await getConversation(branched.id);
      if (!full) return;

      const mappedItems = mapDbMessagesToTimeline(full.messages, full.artifacts);
      const newConv: ChatConversation = {
        id: full.id,
        title: full.title ?? "New Chat",
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
      setPrefill("");
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
      const branched = await branchConversation({
        conversationId: sourceConversationId,
        upToMessageId: messageId,
        upToCreatedAt: createdAt,
      });
      const full = await getConversation(branched.id);
      if (!full) return;

      const mappedItems = mapDbMessagesToTimeline(full.messages, full.artifacts);
      const newConv: ChatConversation = {
        id: full.id,
        title: full.title ?? "New Chat",
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
      setPrefill("");
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

  const handleCompressHistory = useCallback(async () => {
    const sourceId = activeConversationId;
    if (!sourceId || isCompressing) return;
    if (isTyping) cancelStream();
    setIsCompressing(true);
    try {
      const result = await summarizeConversationAction(sourceId);

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

      const full = await getConversation(result.newConversationId);
      if (!full) {
        setActiveConversationId(null);
        return;
      }

      const mappedItems = mapDbMessagesToTimeline(full.messages, full.artifacts);
      const newConv: ChatConversation = {
        id: full.id,
        title: full.title ?? "New Chat",
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
      setPrefill("");
    } catch (err) {
      console.error("Failed to compress conversation history", err);
    } finally {
      setIsCompressing(false);
    }
  }, [activeConversationId, isCompressing, isTyping, cancelStream, sortConversationsByUpdatedAt, updateConversationTimeline]);

  const handleNewChat = useCallback(async () => {
    const context: ConversationContext = selectedProjectId ? "project" : "global";
    const { id } = await createConversation({
      context,
      projectId: selectedProjectId ?? undefined,
      page: "ai",
    });

    const now = new Date().toISOString();
    const newConv: ChatConversation = {
      id,
      title: "New Chat",
      projectId: selectedProjectId ?? undefined,
      createdAt: now,
      updatedAt: now,
    };

    setConversations((prev) => sortConversationsByUpdatedAt([newConv, ...prev]));
    setActiveConversationId(id);
    updateConversationTimeline(id, () => []);
    setPendingChoices([]);
    setPrefill("");
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
                title: conv.title === "New Chat" ? deriveTitleFromPrompt(msgText) : conv.title,
                updatedAt: nowIso,
              }
            : conv,
        )
      )
    );

    setPrefill("");
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
              createdAt: new Date().toISOString(),
            },
          ];
        }

        const next = [...items];
        const current = next[idx] as Extract<TimelineItem, { type: "assistant_message" }>;
        next[idx] = { ...current, content };
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

          if (data.type === "content" && data.content) {
            clearProgress();
            fullContent += data.content;
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

    workspaceContextText,
    ensureConversation,
    updateConversationTimeline,
    sortConversationsByUpdatedAt,
  ]);

  const handleReviewArtifact = useCallback(async (
    artifactId: string,
    status: "accepted" | "rejected",
    note?: string,
    editedPayload?: Record<string, unknown>,
  ) => {
    const convId = activeConversationId;
    if (!convId) return;

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
      return;
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
  }, [activeConversationId, updateConversationTimeline]);

  const handleExecutePlan = useCallback(async (artifactId: string, selectedIndexes: number[]) => {
    if (selectedIndexes.length === 0 || isConversationLoading) return;
    const convId = activeConversationId;
    if (!convId) return;
    if (isTyping) cancelStream();
    setPendingChoices([]);

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
    let progressItemId: string | null = null;
    let runStatus: string | null = null;
    let stopReason: string | null = null;
    let errorMessage: string | null = null;

    const upsertAssistant = (content: string) => {
      updateConversationTimeline(convId, (items) => {
        const idx = items.findIndex((it) => it.type === "assistant_message" && it.id === aiMessageId);
        if (idx === -1) {
          return [...items, { type: "assistant_message", id: aiMessageId, content, createdAt: new Date().toISOString() }];
        }
        const next = [...items];
        const current = next[idx] as Extract<TimelineItem, { type: "assistant_message" }>;
        next[idx] = { ...current, content };
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
          if (data.type === "content" && data.content) {
            clearProgress();
            fullContent += data.content;
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
    workspaceContextText,
    sortConversationsByUpdatedAt,
    updateConversationTimeline,
  ]);

  const handleSuggestionClick = useCallback((prompt: string) => {
    setPrefill(prompt);
  }, []);

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
    setPrefill("");
    void handleSend(retryText, "ai");
  }, [isTyping, activeConversationId, timelineByConversation, handleSend]);

  const handlePrefillConsumed = useCallback(() => {
    setPrefill("");
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
                    >
                      <button
                        type="button"
                        className={styles.historySelectBtn}
                        onClick={() => handleSelectConversation(conv.id)}
                        aria-current={activeConversationId === conv.id ? "true" : undefined}
                      >
                        <span className="material-icons-round">chat_bubble_outline</span>
                        <span className={styles.historyTitle}>{conv.title}</span>
                      </button>
                      <button
                        type="button"
                        className={styles.branchBtn}
                        onClick={(e) => handleBranchConversation(conv.id, e)}
                        aria-label="Branch conversation"
                        title="Branch conversation"
                        disabled={!!branchingConversationId}
                      >
                        <span className="material-icons-round">
                          {branchingConversationId === conv.id ? "hourglass_top" : "call_split"}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={styles.deleteBtn}
                        onClick={(e) => handleDeleteConversation(conv.id, e)}
                        aria-label="Delete conversation"
                      >
                        <span className="material-icons-round">close</span>
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
                onClick={handleCompressHistory}
                disabled={activeTimeline.length < 20 || isCompressing}
                title={activeTimeline.length < 20 ? "Compress history (available after longer chats)" : "Compress history"}
              >
                <span className="material-icons-round">
                  {isCompressing ? "hourglass_top" : "compress"}
                </span>
                Compress
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
              items={activeTimeline}
              isLoading={isTyping}
              isConversationLoading={isConversationLoading}
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
              onRetryLastMessage={handleRetryLastMessage}
              onBranchFromMessage={handleBranchFromMessage}
              onReviewArtifact={handleReviewArtifact}
              onExecutePlan={handleExecutePlan}
            />

            <div className={styles.chatInputContainer}>
              <CopilotInputCore
                page="ai"
                inputPlaceholder="Ask anything about your research..."
                prefill={prefill}
                onPrefillConsumed={handlePrefillConsumed}
                isLoading={isTyping}
                sendMessage={handleSend}
                cancelStream={cancelStream}
                pendingChoices={pendingChoices}
                clearChoices={() => setPendingChoices([])}
                modelStorageKey="litrev_ai_model"
                showAutonomyPreset={false}
                showAttachments={false}
                showVoice
              />
              <p className={styles.disclaimer}>AI can make mistakes. Please verify important information.</p>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
