"use client";

import type { FocusMode, ViewTab } from "@/contexts/ProjectShellContext";
import styles from "./ProjectTabBar.module.css";

type TabDef = {
    key: ViewTab;
    label: string;
    icon: string;
};

const TABS: TabDef[] = [
    { key: "overview", label: "Overview", icon: "dashboard" },
    { key: "protocol", label: "Protocol", icon: "assignment" },
    { key: "ledger", label: "Ledger", icon: "table_chart" },
    { key: "draft", label: "Draft", icon: "edit_note" },
    { key: "notes", label: "Notes", icon: "sticky_note_2" },
];

export type ProjectTabBarProps = {
    focusMode: FocusMode;
    activeTab: ViewTab | null;
    isNoAiMode: boolean;
    onTabClick: (tab: ViewTab) => void;
    onConversationClick: () => void;
    onToggleNoAi: () => void;
};

export function ProjectTabBar({
    focusMode,
    activeTab,
    isNoAiMode,
    onTabClick,
    onConversationClick,
    onToggleNoAi,
}: ProjectTabBarProps) {
    return (
        <nav className={styles.tabBar} aria-label="Project navigation">
            {/* Conversation button — visible only in view mode when AI enabled */}
            {focusMode === "view" && !isNoAiMode && (
                <button
                    type="button"
                    className={styles.conversationBtn}
                    onClick={onConversationClick}
                >
                    <span className="material-icons-round">chat</span>
                    <span className={styles.btnLabel}>Conversation</span>
                </button>
            )}

            <div className={styles.tabs} role="tablist">
                {TABS.map((tab) => (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === tab.key && focusMode === "view"}
                        className={`${styles.tab} ${activeTab === tab.key && focusMode === "view" ? styles.tabActive : ""}`}
                        onClick={() => onTabClick(tab.key)}
                    >
                        <span className="material-icons-round">{tab.icon}</span>
                        <span className={styles.tabLabel}>{tab.label}</span>
                    </button>
                ))}
            </div>

            <button
                type="button"
                className={`${styles.aiToggle} ${isNoAiMode ? styles.aiToggleOff : ""}`}
                onClick={onToggleNoAi}
                aria-label={isNoAiMode ? "Enable AI" : "Disable AI"}
                title={isNoAiMode ? "Enable AI" : "Disable AI"}
            >
                <span className="material-icons-round">
                    {isNoAiMode ? "smart_toy" : "smart_toy"}
                </span>
                <span className={styles.aiToggleLabel}>
                    {isNoAiMode ? "AI Off" : "AI On"}
                </span>
            </button>
        </nav>
    );
}
