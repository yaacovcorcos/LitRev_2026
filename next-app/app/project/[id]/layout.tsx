"use client";

import { CSSProperties, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { ProjectCopilotProvider, useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import { ProjectShellProvider, type FocusMode, type ViewTab } from "@/contexts/ProjectShellContext";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import { AppShell } from "@/components/AppShell";
import { ProjectTabBar } from "@/components/project/ProjectTabBar";
import { ConversationMainView } from "@/components/project/ConversationMainView";
import { ProjectCopilot } from "@/components/ProjectCopilot";
import { PopupChat } from "@/components/PopupChat";
import { PopupChatProvider } from "@/contexts/PopupChatContext";
import { getStudyAction } from "@/app/actions/ledger";
import type { CopilotPage } from "@/types/ai";
import styles from "./project-shell.module.css";

const RAIL_WIDTH = 44;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Map pathname segments to ViewTab */
function tabFromPathname(pathname: string): ViewTab | null {
    if (pathname.endsWith("/protocol")) return "protocol";
    if (pathname.endsWith("/ledger") || pathname.includes("/ledger/")) return "ledger";
    if (pathname.endsWith("/draft")) return "draft";
    if (pathname.endsWith("/memory")) return "memory";
    if (pathname.endsWith("/notes")) return "notes";
    return null;
}

type ProjectShellInnerProps = {
    projectId: string;
    children: ReactNode;
};

function ProjectShellInner({ projectId, children }: ProjectShellInnerProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { isCollapsed, panelWidth, setPanelWidth, toggleCollapsed, setStudyFilter } = useProjectCopilot();
    const { registerCopilotToggle } = useCommandPalette();

    useEffect(() => {
        registerCopilotToggle(toggleCollapsed);
        return () => registerCopilotToggle(null);
    }, [registerCopilotToggle, toggleCollapsed]);

    // Focus mode and tab state
    const [focusMode, setFocusMode] = useState<FocusMode>(() => {
        // If navigating directly to a sub-page, start in view mode
        const tab = tabFromPathname(pathname);
        return tab ? "view" : "conversation";
    });

    const [activeTab, setActiveTabState] = useState<ViewTab | null>(() => {
        return tabFromPathname(pathname) ?? "overview";
    });

    // Sync activeTab when pathname changes (e.g., browser back/forward)
    useEffect(() => {
        const tab = tabFromPathname(pathname);
        if (tab) {
            setActiveTabState(tab);
            setFocusMode("view");
        }
    }, [pathname]);

    const setActiveTab = useCallback((tab: ViewTab) => {
        setActiveTabState(tab);
        setFocusMode("view");
        // Navigate to the appropriate route
        switch (tab) {
            case "overview":
                router.push(`/project/${projectId}`);
                break;
            case "protocol":
                router.push(`/project/${projectId}/protocol`);
                break;
            case "ledger":
                router.push(`/project/${projectId}/ledger`);
                break;
            case "draft":
                router.push(`/project/${projectId}/draft`);
                break;
            case "notes":
                router.push(`/project/${projectId}/notes`);
                break;
            case "memory":
                router.push(`/project/${projectId}/memory`);
                break;
        }
    }, [projectId, router]);

    const returnToConversation = useCallback(() => {
        setFocusMode("conversation");
        // Navigate to project root for conversation mode
        router.push(`/project/${projectId}`);
    }, [projectId, router]);

    const handleTabClick = useCallback((tab: ViewTab) => {
        setActiveTab(tab);
    }, [setActiveTab]);

    const handleConversationClick = useCallback(() => {
        returnToConversation();
    }, [returnToConversation]);

    // Panel vars for view mode
    const computePanelVars = (): CSSProperties => {
        const copilot = isCollapsed ? RAIL_WIDTH : clamp(panelWidth, 300, 560);
        const gridCols = isCollapsed
            ? `1fr 0px ${RAIL_WIDTH}px`
            : `1fr 1px ${copilot}px`;
        return {
            "--copilot-width": `${copilot}px`,
            gridTemplateColumns: gridCols,
        } as CSSProperties;
    };

    // Resize handle for copilot in view mode
    const startResize = useCallback((startX: number) => {
        const startWidth = clamp(panelWidth, 300, 560);
        const handleMove = (e: MouseEvent) => {
            const dx = startX - e.clientX;
            const next = clamp(startWidth + dx, 300, 560);
            setPanelWidth(next);
        };
        const handleEnd = () => {
            window.removeEventListener("mousemove", handleMove);
            window.removeEventListener("mouseup", handleEnd);
        };
        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleEnd);
    }, [panelWidth, setPanelWidth]);

    // Context value for shell-aware child pages
    const shellValue = useMemo(() => ({
        isEmbeddedInProjectShell: true,
        focusMode,
        activeTab,
        setActiveTab,
        returnToConversation,
    }), [focusMode, activeTab, setActiveTab, returnToConversation]);

    // Copilot props for the view mode panel
    const studyDetailMatch = pathname.match(/\/ledger\/([^/]+)\/?$/);
    const isStudyDetail = !!studyDetailMatch;
    const copilotStudyId = studyDetailMatch?.[1];
    const copilotPage = isStudyDetail ? "study" : (activeTab ?? "overview");

    // Fetch study title for the copilot context display
    const [studyTitle, setStudyTitle] = useState<string | null>(null);
    useEffect(() => {
        if (copilotStudyId && projectId) {
            getStudyAction(projectId, copilotStudyId)
                .then((study) => setStudyTitle(study?.title ?? null))
                .catch(() => setStudyTitle(null));
        } else {
            setStudyTitle(null);
        }
    }, [copilotStudyId, projectId]);

    const copilotContextDisplay = isStudyDetail
        ? (studyTitle || "Study")
        : activeTab
            ? `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`
            : "Project";

    // Centralized scope ownership — driven by pathname, no cleanup return
    useEffect(() => {
        setStudyFilter(copilotStudyId);
    }, [copilotStudyId, setStudyFilter]);

    return (
        <ProjectShellProvider value={shellValue}>
            <AppShell activeNav="projects" mainClassName={styles.shellMain} noMainPadding initiallyCollapsed>
                <ProjectTabBar
                    focusMode={focusMode}
                    activeTab={activeTab}
                    onTabClick={handleTabClick}
                    onConversationClick={handleConversationClick}
                />

                {focusMode === "conversation" ? (
                    <div className={styles.conversationBody}>
                        <ConversationMainView projectId={projectId} />
                    </div>
                ) : (
                    <div className={styles.viewBody} style={computePanelVars()}>
                        <div className={styles.viewContent}>{children}</div>

                        <div
                            className={`${styles.resizeHandle} ${isCollapsed ? styles.resizeHandleHidden : ""}`}
                            role="separator"
                            aria-label="Resize copilot panel"
                            aria-hidden={isCollapsed}
                            onMouseDown={(e) => {
                                if (isCollapsed) return;
                                startResize(e.clientX);
                            }}
                        />
                        <div className={styles.copilotPane}>
                            <ProjectCopilot
                                page={copilotPage as CopilotPage}
                                studyId={copilotStudyId}
                                contextDisplay={copilotContextDisplay}
                                emptyState={{
                                    icon: "smart_toy",
                                    title: "AI Copilot",
                                    description: "Ask questions about your project or get help with your current task.",
                                    suggestions: [
                                        { label: "Help", prompt: "What can you help me with?" },
                                        { label: "Summarize", prompt: "Summarize my project progress" },
                                    ],
                                }}
                                inputPlaceholder={`Ask about ${copilotContextDisplay.toLowerCase()}...`}
                                panelId="shell-copilot-panel"
                            />
                        </div>
                    </div>
                )}
            </AppShell>
        </ProjectShellProvider>
    );
}

type ProjectLayoutProps = {
    children: ReactNode;
};

export default function ProjectLayout({ children }: ProjectLayoutProps) {
    const params = useParams<{ id: string }>();
    const projectId = params?.id ?? "";

    return (
        <ProjectCopilotProvider projectId={projectId}>
            <PopupChatProvider>
                <ProjectShellInner projectId={projectId}>
                    {children}
                </ProjectShellInner>
                <PopupChat projectId={projectId} />
            </PopupChatProvider>
        </ProjectCopilotProvider>
    );
}
