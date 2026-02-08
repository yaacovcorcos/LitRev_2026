"use client";

import { AppShell } from "@/components/AppShell";
import { useProjects } from "@/contexts/ProjectsContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "@/components/markdown/CodeBlock";
import styles from "./ai-view.module.css";
import markdownStyles from "@/styles/markdown.module.css";
import {
  createConversationAction,
  deleteConversationAction,
  getConversationMessagesAction,
  listConversationsAction,
} from "@/app/actions/ai";
import type { AIConversation, AIMessage, ConversationContext } from "@/types/ai";
import { USER_SELECTABLE_MODELS, type SelectableModelId } from "@/lib/ai/config";

type Tone = "standard" | "deep";

const INITIAL_AI_MESSAGE = "Hello! I'm your Literature Review Assistant. I can help you find papers, summarize findings, or draft sections of your review. How can I help you today?";

const quickActions = [
  { id: "summarize", icon: "description", label: "Summarize a paper" },
  { id: "draft", icon: "edit_note", label: "Help draft a section" },
  { id: "find", icon: "search", label: "Find related studies" },
  { id: "analyze", icon: "analytics", label: "Analyze findings" },
];

type ChatMessage = {
  id: string;
  sender: "ai" | "user";
  text: string;
  createdAt: string;
};

type ChatConversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  projectId?: string;
  createdAt: string;
  updatedAt: string;
};

const EMPTY_MESSAGES: ChatMessage[] = [];

function messageToChat(message: AIMessage): ChatMessage | null {
  if (message.role === "assistant") {
    return { id: message.id, sender: "ai", text: message.content, createdAt: message.createdAt };
  }
  if (message.role === "user") {
    return { id: message.id, sender: "user", text: message.content, createdAt: message.createdAt };
  }
  return null;
}

function deriveTitle(messages: ChatMessage[]): string {
  const firstUser = messages.find((m) => m.sender === "user");
  if (!firstUser) return "New Chat";
  return firstUser.text.slice(0, 40) + (firstUser.text.length > 40 ? "..." : "");
}

function mapConversation(conv: AIConversation): ChatConversation {
  const messages = conv.messages.map(messageToChat).filter(Boolean) as ChatMessage[];
  return {
    id: conv.id,
    title: deriveTitle(messages),
    messages,
    projectId: conv.projectId,
    createdAt: conv.createdAt,
    updatedAt: conv.updatedAt,
  };
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

export default function AIView() {
  const { projects } = useProjects();
  const [isHistoryCollapsed, setHistoryCollapsed] = useState(false);
  const [tone, setTone] = useState<Tone>("standard");
  const [selectedModel, setSelectedModel] = useState<SelectableModelId>("gpt-5.2");

  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isProjectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [isModelDropdownOpen, setModelDropdownOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const historyContentId = "chat-history-panel";
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const projectDropdownRef = useRef<HTMLDivElement | null>(null);
  const modelDropdownRef = useRef<HTMLDivElement | null>(null);

  const selectedModelInfo = USER_SELECTABLE_MODELS.find((m) => m.id === selectedModel) || USER_SELECTABLE_MODELS[0];

  // Hydrate preferences from localStorage on mount
  const hydratedRef = useRef(false);
  useEffect(() => {
    const storedTone = localStorage.getItem("litrev_ai_tone");
    if (storedTone === "deep") setTone("deep");
    const storedModel = localStorage.getItem("litrev_ai_model");
    if (storedModel) setSelectedModel(storedModel as SelectableModelId);
    hydratedRef.current = true;
  }, []);

  // Persist tone preference (skip until hydrated)
  useEffect(() => {
    if (hydratedRef.current) localStorage.setItem("litrev_ai_tone", tone);
  }, [tone]);

  // Persist model preference (skip until hydrated)
  useEffect(() => {
    if (hydratedRef.current) localStorage.setItem("litrev_ai_model", selectedModel);
  }, [selectedModel]);

  // Close project dropdown on outside click
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

  // Close model dropdown on outside click
  useEffect(() => {
    if (!isModelDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setModelDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [isModelDropdownOpen]);

  // Load conversations when project context changes
  useEffect(() => {
    let isActive = true;
    const load = async () => {
      const context: ConversationContext = selectedProjectId ? "project" : "global";
      const convs = await listConversationsAction(context, selectedProjectId ?? undefined);
      if (!isActive) return;
      const mapped = convs.map(mapConversation);
      setConversations(mapped);
      setActiveConversationId(null);
    };
    load().catch((err) => {
      console.error("Failed to load AI conversations", err);
    });
    return () => {
      isActive = false;
    };
  }, [selectedProjectId]);

  const historyClass = useMemo(
    () => `${styles.historySidebar} ${isHistoryCollapsed ? styles.collapsed : ""}`,
    [isHistoryCollapsed]
  );

  const historyGroups = useMemo(() => groupConversationsByDate(conversations), [conversations]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId),
    [conversations, activeConversationId]
  );

  const messages = activeConversation?.messages ?? EMPTY_MESSAGES;
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  const buildSystemPrompt = useCallback((snapshotTone: Tone, projectName?: string) => {
    const toneLine = snapshotTone === "deep"
      ? "Use a deep, analytical tone with detailed evidence and reasoning."
      : "Keep the response concise, practical, and easy to act on.";
    const projectLine = projectName ? `Focus on the project: "${projectName}".` : "If no project is selected, answer generally.";
    return `You are a literature review assistant for researchers. ${toneLine} ${projectLine}`;
  }, []);

  const handleSend = async (text?: string) => {
    const msgText = (text ?? input).trim();
    if (!msgText || isTyping) return;

    const toneSnapshot = tone;
    const modelSnapshot = selectedModel;
    const projectName = selectedProject?.name;
    const context: ConversationContext = selectedProjectId ? "project" : "global";

    // Ensure we have an active conversation
    let convId = activeConversationId;
    if (!convId) {
      const newConv = await createConversationAction(context, selectedProjectId ?? undefined);
      const mapped = mapConversation(newConv);
      setConversations((prev) => [mapped, ...prev]);
      convId = mapped.id;
      setActiveConversationId(convId);
    }

    const nowIso = new Date().toISOString();
    const userMsg: ChatMessage = {
      id: `m-${Date.now()}`,
      sender: "user",
      text: msgText,
      createdAt: nowIso,
    };

    setConversations((prev) => {
      const next = prev.map((conv) => {
        if (conv.id !== convId) return conv;
        const messages = [...conv.messages, userMsg];
        return {
          ...conv,
          messages,
          title: deriveTitle(messages),
          updatedAt: nowIso,
        };
      });
      return next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    });

    setInput("");
    shouldAutoScrollRef.current = true;

    // AI message will be created when first content arrives
    const aiMessageId = `m-${Date.now() + 1}`;
    let aiMessageCreated = false;

    setIsTyping(true);

    let fullContent = "";

    try {
      const response = await fetch("/api/ai/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: msgText,
          context,
          options: {
            projectId: selectedProjectId ?? undefined,
            systemPrompt: buildSystemPrompt(toneSnapshot, projectName),
            model: modelSnapshot,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`AI request failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === "content" && data.content) {
              fullContent += data.content;

              // Create AI message on first content arrival
              if (!aiMessageCreated) {
                aiMessageCreated = true;
                setConversations((prev) =>
                  prev.map((conv) => {
                    if (conv.id !== convId) return conv;
                    const messages: ChatMessage[] = [
                      ...conv.messages,
                      { id: aiMessageId, sender: "ai" as const, text: fullContent, createdAt: new Date().toISOString() },
                    ];
                    return { ...conv, messages };
                  })
                );
              } else {
                // Update existing AI message with streaming content
                setConversations((prev) =>
                  prev.map((conv) => {
                    if (conv.id !== convId) return conv;
                    const messages = conv.messages.map((m) =>
                      m.id === aiMessageId ? { ...m, text: fullContent } : m
                    );
                    return { ...conv, messages };
                  })
                );
              }
            } else if (data.type === "tool_call" && data.toolCall) {
              const toolName = data.toolCall.name;
              const statusText = toolName === "search_pubmed"
                ? "Searching PubMed..."
                : toolName === "add_to_ledger"
                ? "Adding studies to ledger..."
                : `Running ${toolName}...`;
              if (!aiMessageCreated) {
                aiMessageCreated = true;
                setConversations((prev) =>
                  prev.map((conv) => {
                    if (conv.id !== convId) return conv;
                    const messages: ChatMessage[] = [
                      ...conv.messages,
                      { id: aiMessageId, sender: "ai" as const, text: `*${statusText}*`, createdAt: new Date().toISOString() },
                    ];
                    return { ...conv, messages };
                  })
                );
              } else {
                setConversations((prev) =>
                  prev.map((conv) => {
                    if (conv.id !== convId) return conv;
                    const messages = conv.messages.map((m) =>
                      m.id === aiMessageId ? { ...m, text: fullContent || `*${statusText}*` } : m
                    );
                    return { ...conv, messages };
                  })
                );
              }
            } else if (data.type === "tool_result") {
              if (aiMessageCreated && !fullContent) {
                setConversations((prev) =>
                  prev.map((conv) => {
                    if (conv.id !== convId) return conv;
                    const messages = conv.messages.map((m) =>
                      m.id === aiMessageId ? { ...m, text: "*Processing results...*" } : m
                    );
                    return { ...conv, messages };
                  })
                );
              }
            }
          } catch {
            // Skip parsing errors for incomplete chunks
          }
        }
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : "AI request failed";

      // Create error message if no AI message was created yet
      if (!aiMessageCreated) {
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id !== convId) return conv;
            const messages: ChatMessage[] = [
              ...conv.messages,
              { id: aiMessageId, sender: "ai" as const, text: `Error: ${errorText}`, createdAt: new Date().toISOString() },
            ];
            return { ...conv, messages };
          })
        );
      } else {
        // Update existing message with error
        setConversations((prev) =>
          prev.map((conv) => {
            if (conv.id !== convId) return conv;
            const messages = conv.messages.map((m) =>
              m.id === aiMessageId ? { ...m, text: `${fullContent}\n\nError: ${errorText}` } : m
            );
            return { ...conv, messages };
          })
        );
      }
    } finally {
      setIsTyping(false);
      setConversations((prev) => {
        const next = prev.map((conv) =>
          conv.id === convId ? { ...conv, updatedAt: new Date().toISOString() } : conv
        );
        return next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });
    }
  };

  const handleNewChat = async () => {
    const context: ConversationContext = selectedProjectId ? "project" : "global";
    const newConv = await createConversationAction(context, selectedProjectId ?? undefined);
    const mapped = mapConversation(newConv);
    setConversations((prev) => [mapped, ...prev]);
    setActiveConversationId(mapped.id);
  };

  const handleSelectConversation = async (id: string) => {
    setActiveConversationId(id);
    try {
      const messages = await getConversationMessagesAction(id);
      const mappedMessages = messages.map(messageToChat).filter(Boolean) as ChatMessage[];
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === id
            ? { ...conv, messages: mappedMessages, title: deriveTitle(mappedMessages) }
            : conv
        )
      );
    } catch (err) {
      console.error("Failed to load conversation messages", err);
    }
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteConversationAction(id);
    } catch (err) {
      console.error("Failed to delete conversation", err);
    }
    setConversations((prev) => prev.filter((c) => c.id !== id));
    if (activeConversationId === id) {
      const remaining = conversations.filter((c) => c.id !== id);
      setActiveConversationId(remaining[0]?.id ?? null);
    }
  };

  const handleQuickAction = (actionId: string) => {
    const prompts: Record<string, string> = {
      summarize: "I need help summarizing a paper. Here's the abstract: ",
      draft: "Help me draft the Introduction section of my literature review.",
      find: "Find me recent papers about ",
      analyze: "Analyze the key findings across my collected papers.",
    };
    const prompt = prompts[actionId] ?? "";
    setInput(prompt);
  };

  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleRegenerateMessage = async (messageId: string) => {
    if (isTyping || !activeConversationId) return;

    const convId = activeConversationId;
    const conv = conversations.find((c) => c.id === convId);
    if (!conv) return;

    // Find the message to regenerate and the user message before it
    const msgIndex = conv.messages.findIndex((m) => m.id === messageId);
    if (msgIndex <= 0) return; // Can't regenerate if no previous user message

    const userMessage = conv.messages[msgIndex - 1];
    if (userMessage.sender !== "user") return;

    const toneSnapshot = tone;
    const modelSnapshot = selectedModel;
    const projectName = selectedProject?.name;
    const context: ConversationContext = selectedProjectId ? "project" : "global";

    // Remove the old AI message, new one will be created when content arrives
    const newAiMessageId = `m-${Date.now()}`;
    let aiMessageCreated = false;
    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== convId) return c;
        const messages: ChatMessage[] = [
          ...c.messages.slice(0, msgIndex),
          ...c.messages.slice(msgIndex + 1),
        ];
        return { ...c, messages, updatedAt: new Date().toISOString() };
      })
    );

    setIsTyping(true);
    shouldAutoScrollRef.current = true;

    let fullContent = "";

    try {
      const response = await fetch("/api/ai/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userMessage: userMessage.text,
          context,
          options: {
            projectId: selectedProjectId ?? undefined,
            systemPrompt: buildSystemPrompt(toneSnapshot, projectName),
            model: modelSnapshot,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`AI request failed: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(Boolean);

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.type === "content" && data.content) {
              fullContent += data.content;

              // Create AI message on first content arrival
              if (!aiMessageCreated) {
                aiMessageCreated = true;
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    const messages: ChatMessage[] = [
                      ...c.messages.slice(0, msgIndex),
                      { id: newAiMessageId, sender: "ai" as const, text: fullContent, createdAt: new Date().toISOString() },
                      ...c.messages.slice(msgIndex),
                    ];
                    return { ...c, messages };
                  })
                );
              } else {
                // Update existing AI message
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    const messages = c.messages.map((m) =>
                      m.id === newAiMessageId ? { ...m, text: fullContent } : m
                    );
                    return { ...c, messages };
                  })
                );
              }
            } else if (data.type === "tool_call" && data.toolCall) {
              const toolName = data.toolCall.name;
              const statusText = toolName === "search_pubmed"
                ? "Searching PubMed..."
                : toolName === "add_to_ledger"
                ? "Adding studies to ledger..."
                : `Running ${toolName}...`;
              if (!aiMessageCreated) {
                aiMessageCreated = true;
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    const messages: ChatMessage[] = [
                      ...c.messages.slice(0, msgIndex),
                      { id: newAiMessageId, sender: "ai" as const, text: `*${statusText}*`, createdAt: new Date().toISOString() },
                      ...c.messages.slice(msgIndex),
                    ];
                    return { ...c, messages };
                  })
                );
              } else {
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    const messages = c.messages.map((m) =>
                      m.id === newAiMessageId ? { ...m, text: fullContent || `*${statusText}*` } : m
                    );
                    return { ...c, messages };
                  })
                );
              }
            } else if (data.type === "tool_result") {
              if (aiMessageCreated && !fullContent) {
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    const messages = c.messages.map((m) =>
                      m.id === newAiMessageId ? { ...m, text: "*Processing results...*" } : m
                    );
                    return { ...c, messages };
                  })
                );
              }
            }
          } catch {
            // Skip parsing errors for incomplete chunks
          }
        }
      }
    } catch (err) {
      const errorText = err instanceof Error ? err.message : "AI request failed";

      // Create error message if no AI message was created yet
      if (!aiMessageCreated) {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            const messages: ChatMessage[] = [
              ...c.messages.slice(0, msgIndex),
              { id: newAiMessageId, sender: "ai" as const, text: `Error: ${errorText}`, createdAt: new Date().toISOString() },
              ...c.messages.slice(msgIndex),
            ];
            return { ...c, messages };
          })
        );
      } else {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            const messages = c.messages.map((m) =>
              m.id === newAiMessageId ? { ...m, text: `${fullContent}\n\nError: ${errorText}` } : m
            );
            return { ...c, messages };
          })
        );
      }
    } finally {
      setIsTyping(false);
      setConversations((prev) => {
        const next = prev.map((c) =>
          c.id === convId ? { ...c, updatedAt: new Date().toISOString() } : c
        );
        return next.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      });
    }
  };

  useEffect(() => {
    if (!messagesRef.current) return;
    if (!shouldAutoScrollRef.current) return;
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
  }, [messages, isTyping]);

  const handleMessagesScroll = () => {
    if (!messagesRef.current) return;
    const { scrollTop, clientHeight, scrollHeight } = messagesRef.current;
    shouldAutoScrollRef.current = scrollTop + clientHeight >= scrollHeight - 80;
  };

  const showEmptyState = messages.length === 0 && !isTyping;

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
                <span className="material-icons-round">folder</span>
                <span>{selectedProject?.name ?? "No Project"}</span>
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
                    No Project
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
          </div>

          <div className={`${styles.chatContent} ${showEmptyState ? styles.chatContentEmpty : ''}`}>
          <div
            className={`${styles.chatMessages} ${showEmptyState ? styles.chatMessagesEmpty : ''}`}
            role="log"
            aria-live="polite"
            ref={messagesRef}
            onScroll={handleMessagesScroll}
          >
            {showEmptyState ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <span className="material-icons-round">auto_awesome</span>
                </div>
                <h2>How can I help with your research?</h2>
                <p>Ask me anything about your literature review, or try one of these:</p>
                <div className={styles.quickActions}>
                  {quickActions.map((action) => (
                    <button
                      key={action.id}
                      className={styles.quickActionBtn}
                      onClick={() => handleQuickAction(action.id)}
                    >
                      <span className="material-icons-round">{action.icon}</span>
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* Initial AI greeting if no messages */}
                {messages.length === 0 && (
                  <div className={`${styles.messageBubble} ${styles.aiMessage}`}>
                    <div className={styles.aiAvatar}>
                      <span className="material-icons-round">smart_toy</span>
                    </div>
                    <div className={`${styles.messageContent} ${styles.aiBubble}`}>
                      <p>{INITIAL_AI_MESSAGE}</p>
                    </div>
                  </div>
                )}
                {messages.map((msg, index) => {
                  const isLastAiMessage = msg.sender === "ai" && index === messages.length - 1;
                  return (
                    <div
                      key={msg.id}
                      className={`${styles.messageBubble} ${msg.sender === "ai" ? styles.aiMessage : styles.userMessage}`}
                    >
                      {msg.sender === "ai" && (
                        <div className={styles.aiAvatar}>
                          <span className="material-icons-round">smart_toy</span>
                        </div>
                      )}
                      <div className={`${styles.messageContent} ${msg.sender === "ai" ? styles.aiBubble : styles.userBubble}`}>
                        {msg.sender === "ai" ? (
                          <div className={markdownStyles.markdownContent}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{msg.text}</ReactMarkdown>
                          </div>
                        ) : (
                          <p>{msg.text}</p>
                        )}
                        {msg.sender === "ai" && msg.text && (
                          <div className={styles.messageActions}>
                            {isLastAiMessage && (
                              <button
                                className={styles.messageActionBtn}
                                onClick={() => handleRegenerateMessage(msg.id)}
                                aria-label="Regenerate response"
                                disabled={isTyping}
                              >
                                <span className="material-icons-round">refresh</span>
                              </button>
                            )}
                            <button
                              className={styles.messageActionBtn}
                              onClick={() => handleCopyMessage(msg.text)}
                              aria-label="Copy message"
                            >
                              <span className="material-icons-round">content_copy</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {isTyping && messages.length > 0 && messages[messages.length - 1].sender === "user" && (
                  <div className={`${styles.messageBubble} ${styles.aiMessage}`}>
                    <div className={styles.aiAvatar}>
                      <span className="material-icons-round">smart_toy</span>
                    </div>
                    <div className={`${styles.messageContent} ${styles.aiBubble} ${styles.typingBubble}`}>
                      <div className={styles.typingIndicator}>
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className={styles.chatInputContainer}>
            <form
              className={styles.inputBox}
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              {/* Upper floor: textarea */}
              <textarea
                placeholder={isTyping ? "Thinking..." : "Ask anything about your research..."}
                aria-label="Chat input"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  // Auto-resize
                  e.target.style.height = "auto";
                  e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={isTyping}
                rows={1}
                className={styles.inputTextarea}
              />

              {/* Lower floor: actions */}
              <div className={styles.inputBar}>
                <div className={styles.inputBarLeft}>
                  {/* Model selector */}
                  <div className={styles.inputModelSelector} ref={modelDropdownRef}>
                    <button
                      type="button"
                      className={styles.inputModelBtn}
                      onClick={() => setModelDropdownOpen((prev) => !prev)}
                      aria-haspopup="listbox"
                      aria-expanded={isModelDropdownOpen}
                    >
                      <span className="material-icons-round">{selectedModelInfo.icon}</span>
                      <span>{selectedModelInfo.name}</span>
                      <span className="material-icons-round">expand_more</span>
                    </button>
                    {isModelDropdownOpen && (
                      <div className={styles.inputModelDropdown} role="listbox">
                        {USER_SELECTABLE_MODELS.map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            className={`${styles.inputModelItem} ${selectedModel === model.id ? styles.inputModelItemActive : ""}`}
                            onClick={() => {
                              setSelectedModel(model.id);
                              setModelDropdownOpen(false);
                            }}
                            role="option"
                            aria-selected={selectedModel === model.id}
                          >
                            <span className="material-icons-round">{model.icon}</span>
                            <span>{model.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Tone toggle */}
                  <div className={styles.inputToneToggle} role="group" aria-label="Tone">
                    <button
                      type="button"
                      className={`${styles.inputToneOption} ${tone === "standard" ? styles.inputToneActive : ""}`}
                      onClick={() => setTone("standard")}
                      aria-pressed={tone === "standard"}
                    >
                      Standard
                    </button>
                    <button
                      type="button"
                      className={`${styles.inputToneOption} ${tone === "deep" ? styles.inputToneActive : ""}`}
                      onClick={() => setTone("deep")}
                      aria-pressed={tone === "deep"}
                    >
                      Deep
                    </button>
                  </div>
                </div>

                {/* Send button */}
                <button
                  type="submit"
                  className={`${styles.inputSendBtn} ${input.trim() ? styles.inputSendBtnActive : ""}`}
                  aria-label="Send"
                  disabled={isTyping || !input.trim()}
                >
                  <span className="material-icons-round">
                    {isTyping ? "more_horiz" : "arrow_upward"}
                  </span>
                </button>
              </div>
            </form>
            <p className={styles.disclaimer}>AI can make mistakes. Please verify important information.</p>
          </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
