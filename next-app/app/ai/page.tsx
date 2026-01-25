"use client";

import { AppShell } from "@/components/AppShell";
import { useProjects } from "@/contexts/ProjectsContext";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styles from "./ai-view.module.css";
import {
  ChatConversation,
  ChatMessage,
  addMessage,
  createConversation,
  deleteConversation,
  groupConversationsByDate,
  loadConversations,
} from "@/lib/chatStorage";

type Tone = "standard" | "deep";

const INITIAL_AI_MESSAGE = "Hello! I'm your Literature Review Assistant. I can help you find papers, summarize findings, or draft sections of your review. How can I help you today?";

const EMPTY_MESSAGES: ChatMessage[] = [];

const quickActions = [
  { id: "summarize", icon: "description", label: "Summarize a paper" },
  { id: "draft", icon: "edit_note", label: "Help draft a section" },
  { id: "find", icon: "search", label: "Find related studies" },
  { id: "analyze", icon: "analytics", label: "Analyze findings" },
];

export default function AIView() {
  const { projects } = useProjects();
  const [isHistoryCollapsed, setHistoryCollapsed] = useState(false);
  const [tone, setTone] = useState<Tone>(() => {
    if (typeof window === "undefined") return "standard";
    const stored = window.localStorage.getItem("litrev_ai_tone");
    return stored === "deep" ? "deep" : "standard";
  });

  const initialConversations = useMemo(() => loadConversations(), []);
  const [conversations, setConversations] = useState<ChatConversation[]>(initialConversations);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(() => initialConversations[0]?.id ?? null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [isProjectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);

  const historyContentId = "chat-history-panel";
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const shouldAutoScrollRef = useRef(true);
  const projectDropdownRef = useRef<HTMLDivElement | null>(null);

  // Persist tone preference
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("litrev_ai_tone", tone);
    }
  }, [tone]);

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

  const buildResponse = useCallback((text: string, snapshotTone: Tone, projectName?: string) => {
    const lower = text.toLowerCase();
    const contextNote = projectName ? ` I'll focus on your "${projectName}" project.` : "";

    if (lower.includes("hello") || lower.includes("hi")) {
      return `Hello! I'm ready to help with your literature review.${contextNote} What are you working on?`;
    }
    if (lower.includes("summarize")) {
      return `I can help summarize that.${contextNote} Please paste the abstract or key findings you'd like me to analyze.`;
    }
    if (lower.includes("find") && lower.includes("paper")) {
      return `I'll search for relevant papers.${contextNote} What specific topics or keywords should I focus on?`;
    }
    if (lower.includes("draft")) {
      return `I'd be happy to help draft that section.${contextNote} Which part are you working on—Introduction, Methods, Results, or Discussion?`;
    }
    return snapshotTone === "deep"
      ? `Taking a deeper dive into this topic.${contextNote} Let me surface detailed evidence and provide comprehensive analysis.`
      : `Got it! I'll keep this concise and actionable.${contextNote}`;
  }, []);

  const handleSend = async (text?: string) => {
    const msgText = (text ?? input).trim();
    if (!msgText) return;

    const toneSnapshot = tone;
    const projectName = selectedProject?.name;

    // Ensure we have an active conversation
    let convId = activeConversationId;
    if (!convId) {
      const newConv = createConversation(selectedProjectId ?? undefined);
      setConversations((prev) => [newConv, ...prev]);
      convId = newConv.id;
      setActiveConversationId(convId);
    }

    // Add user message
    const userMsg = addMessage(convId, { sender: "user", text: msgText });
    if (userMsg) {
      setConversations(loadConversations());
    }
    setInput("");
    shouldAutoScrollRef.current = true;

    // Simulate AI typing
    setIsTyping(true);
    const delay = 800 + Math.random() * 800;
    await new Promise((resolve) => setTimeout(resolve, delay));
    setIsTyping(false);

    // Add AI response
    const aiText = buildResponse(msgText, toneSnapshot, projectName);
    addMessage(convId, { sender: "ai", text: aiText });
    setConversations(loadConversations());
  };

  const handleNewChat = () => {
    const newConv = createConversation(selectedProjectId ?? undefined);
    setConversations((prev) => [newConv, ...prev]);
    setActiveConversationId(newConv.id);
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
  };

  const handleDeleteConversation = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteConversation(id);
    const updated = loadConversations();
    setConversations(updated);
    if (activeConversationId === id) {
      setActiveConversationId(updated[0]?.id ?? null);
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
                    <button
                      key={conv.id}
                      className={`${styles.historyItem} ${activeConversationId === conv.id ? styles.activeHistory : ""}`}
                      onClick={() => handleSelectConversation(conv.id)}
                      aria-pressed={activeConversationId === conv.id}
                    >
                      <span className="material-icons-round">chat_bubble_outline</span>
                      <span className={styles.historyTitle}>{conv.title}</span>
                      <button
                        className={styles.deleteBtn}
                        onClick={(e) => handleDeleteConversation(conv.id, e)}
                        aria-label="Delete conversation"
                      >
                        <span className="material-icons-round">close</span>
                      </button>
                    </button>
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
            <div className={styles.modelSelector}>
              <span className={styles.modelName}>LitRev AI 4.0</span>
              <span className={styles.modelStatus}></span>
            </div>

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

            <div className={styles.toneToggle} role="group" aria-label="Tone">
              <button
                className={`${styles.toneOption} ${tone === "standard" ? styles.toneActive : ""}`}
                data-tone="standard"
                onClick={() => setTone("standard")}
                aria-pressed={tone === "standard"}
              >
                Standard
              </button>
              <button
                className={`${styles.toneOption} ${tone === "deep" ? styles.toneActive : ""}`}
                data-tone="deep"
                onClick={() => setTone("deep")}
                aria-pressed={tone === "deep"}
              >
                Deep Dive
              </button>
              <div className={`${styles.toneSlider} ${tone === "deep" ? styles.toneDeep : ""}`} aria-hidden="true" />
            </div>
          </div>

          <div
            className={styles.chatMessages}
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
                {messages.map((msg) => (
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
                      <p>{msg.text}</p>
                      {msg.sender === "ai" && (
                        <div className={styles.messageActions}>
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
                ))}
                {isTyping && (
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
              className={styles.chatInputWrapper}
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              <input
                type="text"
                placeholder="Ask anything about your research..."
                aria-label="Chat input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button type="submit" className={styles.sendButton} aria-label="Send Message" disabled={!input.trim()}>
                <span className="material-icons-round">send</span>
              </button>
            </form>
            <p className={styles.disclaimer}>AI can make mistakes. Please verify important information.</p>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
