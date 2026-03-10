"use client";

import { useCallback, useState } from "react";
import type { FocusMode, ViewTab } from "@/contexts/ProjectShellContext";
import type { ProjectDataDomain } from "@/lib/project-data-events";
import { useProjectData } from "@/hooks/useProjectData";
import { Modal } from "@/components/Modal";
import { isMobileTelemetryContext, recordMobileMetric } from "@/lib/mobile/telemetry";
import { COARSE_POINTER_MEDIA_QUERY, MOBILE_VIEWPORT_MEDIA_QUERY } from "@/lib/mobile/breakpoints";
import { StatusIndicator } from "./StatusIndicator";
import styles from "./ProjectTabBar.module.css";

const TAB_DOMAIN_MAP: Record<ViewTab, ProjectDataDomain | null> = {
    overview: null,
    protocol: "protocol",
    ledger: "ledger",
    draft: "draft",
    memory: "memory",
    notes: "notes",
};

const HOVER_WARM_DOMAINS = new Set<ProjectDataDomain>(["protocol", "ledger"]);

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
    { key: "memory", label: "Memory", icon: "psychology" },
    { key: "notes", label: "Notes", icon: "sticky_note_2" },
];

export type ProjectTabBarProps = {
    focusMode: FocusMode;
    activeTab: ViewTab | null;
    onTabClick: (tab: ViewTab) => void;
    onConversationClick: () => void;
    projectName?: string;
    onDeleteProject?: () => void;
};

export function ProjectTabBar({
    focusMode,
    activeTab,
    onTabClick,
    onConversationClick,
    projectName,
    onDeleteProject,
}: ProjectTabBarProps) {
    const [isDeleteOpen, setIsDeleteOpen] = useState(false);
    const closeDeleteModal = useCallback(() => setIsDeleteOpen(false), []);
    const { warmDomain } = useProjectData();

    const handleTabHover = useCallback((tab: ViewTab) => {
        const domain = TAB_DOMAIN_MAP[tab];
        if (!domain || !HOVER_WARM_DOMAINS.has(domain)) return;
        if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
            const isMobileViewport = window.matchMedia(MOBILE_VIEWPORT_MEDIA_QUERY).matches;
            const hasCoarsePointer = window.matchMedia(COARSE_POINTER_MEDIA_QUERY).matches;
            if (isMobileViewport || hasCoarsePointer) return;
        }
        warmDomain(domain);
    }, [warmDomain]);

    const recordNavigationTap = useCallback((actionId: string) => {
        if (!isMobileTelemetryContext()) return;
        recordMobileMetric({
            type: "mobile_action_tap",
            surface: "project_shell",
            payload: {
                route: typeof window !== "undefined" ? window.location.pathname : "/project",
                actionId,
                targetMinPx: 44,
                inputMode: "touch",
            },
        });
    }, []);

    return (
        <>
            <nav className={styles.tabBar} aria-label="Project navigation">
                {/* Mode switch — always visible */}
                <div className={styles.modeSwitch} role="radiogroup" aria-label="Project mode">
                    <button
                        type="button"
                        role="radio"
                        aria-checked={focusMode === "conversation"}
                        aria-label="Conversation mode"
                        className={`${styles.modeBtn} ${focusMode === "conversation" ? styles.modeBtnActive : ""}`}
                        onClick={() => {
                            recordNavigationTap("mode_conversation");
                            onConversationClick();
                        }}
                    >
                        <span className="material-icons-round">chat</span>
                        <span className={styles.btnLabel}>Conversation</span>
                    </button>
                    <button
                        type="button"
                        role="radio"
                        aria-checked={focusMode === "view"}
                        aria-label="Workspace mode"
                        className={`${styles.modeBtn} ${focusMode === "view" ? styles.modeBtnActive : ""}`}
                        onClick={() => {
                            recordNavigationTap("mode_workspace");
                            onTabClick(activeTab ?? "overview");
                        }}
                    >
                        <span className="material-icons-round">workspaces</span>
                        <span className={styles.btnLabel}>Workspace</span>
                    </button>
                </div>

                <div className={styles.tabs} role="tablist">
                    {TABS.map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === tab.key && focusMode === "view"}
                            className={`${styles.tab} ${activeTab === tab.key && focusMode === "view" ? styles.tabActive : ""}`}
                            onClick={() => {
                                recordNavigationTap(`tab_${tab.key}`);
                                onTabClick(tab.key);
                            }}
                            onMouseEnter={() => handleTabHover(tab.key)}
                        >
                            <span className="material-icons-round">{tab.icon}</span>
                            <span className={styles.tabLabel}>{tab.label}</span>
                        </button>
                    ))}
                </div>

                <StatusIndicator />

                {onDeleteProject ? (
                    <button
                        type="button"
                        className={styles.deleteBtn}
                        title="Delete project"
                        aria-label="Delete project"
                        onClick={() => setIsDeleteOpen(true)}
                    >
                        <span className="material-icons-round">delete_outline</span>
                    </button>
                ) : null}
            </nav>

            {onDeleteProject ? (
                <Modal isOpen={isDeleteOpen} onClose={closeDeleteModal} ariaLabelledBy="deleteProjectTitle">
                    <div className="modal-header">
                        <h2 id="deleteProjectTitle">Delete project</h2>
                        <button className="close-modal-btn" aria-label="Close dialog" onClick={closeDeleteModal}>
                            <span className="material-icons-round">close</span>
                        </button>
                    </div>
                    <div className="modal-body">
                        <p>
                            This will permanently delete <strong>{projectName}</strong> and all related data. This action cannot be undone.
                        </p>
                    </div>
                    <div className="modal-actions">
                        <button type="button" className="btn btn-outline cancel-btn" onClick={closeDeleteModal}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="btn btn-danger"
                            onClick={() => {
                                closeDeleteModal();
                                onDeleteProject();
                            }}
                        >
                            Delete project
                        </button>
                    </div>
                </Modal>
            ) : null}
        </>
    );
}
