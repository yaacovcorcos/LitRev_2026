"use client";

import { AppShell } from "@/components/AppShell";
import { useEffect, useMemo, useState } from "react";
import styles from "./ai-view.module.css";

type Tone = "standard" | "deep";
type Sender = "ai" | "user";

type ChatItem = {
  id: string;
  sender: Sender;
  text: string;
};

const historyGroups = [
  {
    title: "Today",
    items: [
      { id: "h1", title: "Radiopathology Trends", active: true },
      { id: "h2", title: "Summarize PDF", active: false },
    ],
  },
  {
    title: "Yesterday",
    items: [{ id: "h3", title: "Methodology Review", active: false }],
  },
];

const initialMessages: ChatItem[] = [
  {
    id: "m1",
    sender: "ai",
    text:
      "Hello! I'm your Literature Review Assistant. I can help you find papers, summarize findings, or draft sections of your review. How can I help you today?",
  },
];

export default function AIView() {
  const [isHistoryCollapsed, setHistoryCollapsed] = useState(false);
  const [tone, setTone] = useState<Tone>(() => {
    if (typeof window === "undefined") return "standard";
    const stored = window.localStorage.getItem("litrev_ai_tone");
    return stored === "deep" ? "deep" : "standard";
  });
  const [messages, setMessages] = useState<ChatItem[]>(initialMessages);
  const [input, setInput] = useState("");
  const [activeChat, setActiveChat] = useState("h1");
  const historyContentId = "chat-history-panel";

  const historyClass = useMemo(
    () => `${styles.historySidebar} ${isHistoryCollapsed ? styles.collapsed : ""}`,
    [isHistoryCollapsed]
  );

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("litrev_ai_tone", tone);
    }
  }, [tone]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    const userMsg: ChatItem = { id: "u-" + Date.now(), sender: "user", text };
    const aiMsg: ChatItem = {
      id: "a-" + Date.now(),
      sender: "ai",
      text:
        tone === "deep"
          ? "Taking a deeper dive. Let me expand on that and surface detailed evidence."
          : "Got it! I'll summarize and keep it concise.",
    };
    setMessages((prev) => [...prev, userMsg, aiMsg]);
    setInput("");
  };

  const handleHistorySelect = (id: string) => {
    setActiveChat(id);
    // Future: load chat history for selected id
  };

  return (
    <AppShell activeNav="ai" noMainPadding>
      <div className={styles.layout}>
        <aside
          className={historyClass}
          aria-label="Chat history"
          aria-hidden={isHistoryCollapsed}
        >
          <div className={styles.sidebarHeader}>
            <button
              className={styles.sidebarToggle}
              aria-label="Toggle Sidebar"
              aria-expanded={!isHistoryCollapsed}
              aria-controls={historyContentId}
              onClick={() => setHistoryCollapsed((prev) => !prev)}
            >
              <span className="material-icons-round">menu_open</span>
            </button>
          </div>
          <div className={styles.newChatWrapper}>
            <button className={`btn btn-primary ${styles.newChatButton}`} type="button">
              <span className="material-icons-round">add</span>
              New Chat
            </button>
          </div>
          <div id={historyContentId} aria-hidden={isHistoryCollapsed}>
            <div className={styles.historyList}>
              {historyGroups.map((group) => (
                <div className={styles.historyGroup} key={group.title}>
                  <h4 className={styles.historyHeading}>{group.title}</h4>
                  {group.items.map((item) => (
                    <button
                      key={item.id}
                      className={`${styles.historyItem} ${activeChat === item.id ? styles.activeHistory : ""}`}
                      onClick={() => handleHistorySelect(item.id)}
                    >
                      <span className="material-icons-round">chat_bubble_outline</span>
                      <span className={styles.historyTitle}>{item.title}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
            <div className={styles.customizeWrapper}>
              <button className={styles.customizeButton} type="button">
                <span className="material-icons-round">tune</span>
                <span>Customize</span>
              </button>
            </div>
          </div>
        </aside>

        <section className={styles.chatInterface} role="region" aria-label="Chat interface">
          <div className={styles.chatHeader}>
            <div className={styles.modelSelector}>
              <span className={styles.modelName}>LitRev AI 4.0</span>
              <span className={styles.modelStatus}></span>
            </div>

            <div className={styles.toneToggle}>
              <button
                className={`${styles.toneOption} ${tone === "standard" ? styles.toneActive : ""}`}
                data-tone="standard"
                onClick={() => setTone("standard")}
              >
                Standard
              </button>
              <button
                className={`${styles.toneOption} ${tone === "deep" ? styles.toneActive : ""}`}
                data-tone="deep"
                onClick={() => setTone("deep")}
              >
                Deep Dive
              </button>
              <div className={`${styles.toneSlider} ${tone === "deep" ? styles.toneDeep : ""}`} />
            </div>

            <div className={styles.chatActions}>
              <button className={styles.iconButton} type="button" aria-label="Chat Settings">
                <span className="material-icons-round">tune</span>
              </button>
            </div>
          </div>

          <div className={styles.chatMessages} role="log" aria-live="polite">
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
                </div>
              </div>
            ))}
          </div>

          <div className={styles.chatInputContainer}>
            <form
              className={styles.chatInputWrapper}
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
            >
              <button type="button" className={styles.iconButton} aria-label="Attach File">
                <span className="material-icons-round">attach_file</span>
              </button>
              <input
                type="text"
                placeholder="Ask anything about your research..."
                aria-label="Chat input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <button type="submit" className={styles.iconButton} aria-label="Send Message">
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
