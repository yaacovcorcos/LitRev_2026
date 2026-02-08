"use client";

import type { FocusMode, ViewTab } from "@/contexts/ProjectShellContext";
import { StatusIndicator } from "./StatusIndicator";
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
    onTabClick: (tab: ViewTab) => void;
    onConversationClick: () => void;
};

export function ProjectTabBar({
    focusMode,
    activeTab,
    onTabClick,
    onConversationClick,
}: ProjectTabBarProps) {
    return (
        <nav className={styles.tabBar} aria-label="Project navigation">
            {/* Conversation button — visible in view mode */}
            {focusMode === "view" && (
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

            <StatusIndicator />
        </nav>
    );
}
