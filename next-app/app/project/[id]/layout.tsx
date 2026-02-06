"use client";

import { CSSProperties, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { ProjectCopilotProvider, useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import { ProjectShellProvider, type FocusMode, type ViewTab } from "@/contexts/ProjectShellContext";
import { AppShell } from "@/components/AppShell";
import { ProjectTabBar } from "@/components/project/ProjectTabBar";
import { ConversationMainView } from "@/components/project/ConversationMainView";
import { ProjectCopilot } from "@/components/ProjectCopilot";
import styles from "./project-shell.module.css";

const RAIL_WIDTH = 44;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/** Map pathname segments to ViewTab */
function tabFromPathname(pathname: string): ViewTab | null {
    if (pathname.endsWith("/protocol")) return "protocol";
    if (pathname.endsWith("/ledger") || pathname.includes("/ledger/")) return "ledger";
    if (pathname.endsWith("/draft")) return "draft";
    if (pathname.endsWith("/notes") || pathname.endsWith("/memory")) return "notes";
    return null;
}

type ProjectShellInnerProps = {
    projectId: string;
    children: ReactNode;
};

function ProjectShellInner({ projectId, children }: ProjectShellInnerProps) {
    const router = useRouter();
    const pathname = usePathname();
    const { isCollapsed, panelWidth, setPanelWidth } = useProjectCopilot();

    // Focus mode and tab state
    const [focusMode, setFocusMode] = useState<FocusMode>(() => {
        // If navigating directly to a sub-page, start in view mode
        const tab = tabFromPathname(pathname);
        return tab ? "view" : "conversation";
    });

    const [activeTab, setActiveTabState] = useState<ViewTab | null>(() => {
        return tabFromPathname(pathname) ?? "overview";
    });

    // No-AI mode from localStorage
    const [isNoAiMode, setIsNoAiMode] = useState(false);
    useEffect(() => {
        if (typeof window === "undefined") return;
        const stored = window.localStorage.getItem(`litrev_no_ai_${projectId}`);
        if (stored === "true") setIsNoAiMode(true);
    }, [projectId]);

    const setNoAiMode = useCallback((v: boolean) => {
        setIsNoAiMode(v);
        if (typeof window !== "undefined") {
            window.localStorage.setItem(`litrev_no_ai_${projectId}`, v ? "true" : "false");
        }
        // If turning off AI and in conversation mode, switch to view mode
        if (v && focusMode === "conversation") {
            setFocusMode("view");
            setActiveTabState("overview");
            router.push(`/project/${projectId}`);
        }
    }, [projectId, focusMode, router]);

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

    const handleToggleNoAi = useCallback(() => {
        setNoAiMode(!isNoAiMode);
    }, [isNoAiMode, setNoAiMode]);

    // Effective focus mode: if no-AI and in conversation, force view
    const effectiveFocusMode = isNoAiMode ? "view" : focusMode;

    // Panel vars for view mode
    const computePanelVars = (): CSSProperties => {
        if (isNoAiMode) {
            return { "--copilot-width": "0px", gridTemplateColumns: "1fr 0px 0px" } as CSSProperties;
        }
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
        focusMode: effectiveFocusMode,
        activeTab,
        setActiveTab,
        returnToConversation,
        isNoAiMode,
        setNoAiMode,
    }), [effectiveFocusMode, activeTab, setActiveTab, returnToConversation, isNoAiMode, setNoAiMode]);

    // Copilot props for the view mode panel
    const copilotPage = activeTab === "notes" ? "protocol" : (activeTab ?? "overview");
    const copilotContextDisplay = activeTab
        ? `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`
        : "Project";

    return (
        <ProjectShellProvider value={shellValue}>
            <AppShell activeNav="projects" mainClassName={styles.shellMain} noMainPadding>
                <ProjectTabBar
                    focusMode={effectiveFocusMode}
                    activeTab={activeTab}
                    isNoAiMode={isNoAiMode}
                    onTabClick={handleTabClick}
                    onConversationClick={handleConversationClick}
                    onToggleNoAi={handleToggleNoAi}
                />

                {effectiveFocusMode === "conversation" ? (
                    <div className={styles.conversationBody}>
                        <ConversationMainView projectId={projectId} />
                    </div>
                ) : (
                    <div className={styles.viewBody} style={computePanelVars()}>
                        <div className={styles.viewContent}>{children}</div>

                        {!isNoAiMode && (
                            <>
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
                                <ProjectCopilot
                                    page={copilotPage as import("@/contexts/ProjectCopilotContext").CopilotPage}
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
                            </>
                        )}
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
            <ProjectShellInner projectId={projectId}>
                {children}
            </ProjectShellInner>
        </ProjectCopilotProvider>
    );
}
