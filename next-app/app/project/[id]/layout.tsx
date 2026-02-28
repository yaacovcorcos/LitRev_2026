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
import { ResizableSplitter } from "@/components/ui/ResizableSplitter";
import { PopupChat } from "@/components/PopupChat";
import { PopupChatProvider } from "@/contexts/PopupChatContext";
import { getStudyAction } from "@/app/actions/ledger";
import type { CopilotPage } from "@/types/ai";
import { DemoBanner } from "@/components/project/DemoBanner";
import { isDemoProjectId } from "@/lib/demo/constants";
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

    useEffect(() => {
        if (!projectId || typeof window === "undefined") return;
        window.localStorage.setItem("litrev:lastProjectId", projectId);
    }, [projectId]);

    // Focus mode and tab state — default to conversation on entry
    const [focusMode, setFocusMode] = useState<FocusMode>("conversation");

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
    }, []);

    const handleTabClick = useCallback((tab: ViewTab) => {
        setActiveTab(tab);
    }, [setActiveTab]);

    // Keyboard shortcut: Cmd+. (or Ctrl+.) toggles between modes
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === ".") {
                e.preventDefault();
                if (focusMode === "conversation") {
                    setActiveTab(activeTab ?? "overview");
                } else {
                    returnToConversation();
                }
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [focusMode, activeTab, setActiveTab, returnToConversation]);

    const handleConversationClick = useCallback(() => {
        returnToConversation();
    }, [returnToConversation]);

    const panelVars = useMemo(() => {
        const copilot = isCollapsed ? RAIL_WIDTH : clamp(panelWidth, 300, 560);
        const gridCols = isCollapsed ? `1fr 0px ${RAIL_WIDTH}px` : `1fr 1px ${copilot}px`;
        return {
            "--copilot-width": `${copilot}px`,
            gridTemplateColumns: gridCols,
        } as CSSProperties;
    }, [isCollapsed, panelWidth]);
    const boundedPanelWidth = clamp(panelWidth, 300, 560);

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
                .then((result) => setStudyTitle(result.success && result.data ? result.data.title : null))
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
    const isOnboardingRoute = pathname.endsWith("/onboarding");
    const showDemoBanner = isDemoProjectId(projectId) && !isOnboardingRoute;

    // Centralized scope ownership — driven by pathname, no cleanup return
    useEffect(() => {
        setStudyFilter(copilotStudyId);
    }, [copilotStudyId, setStudyFilter]);

    return (
        <ProjectShellProvider value={shellValue}>
            <AppShell activeNav="projects" mainClassName={styles.shellMain} noMainPadding initiallyCollapsed>
                {isOnboardingRoute ? (
                    <div className={styles.onboardingBody}>{children}</div>
                ) : (
                    <>
                        <ProjectTabBar
                            focusMode={focusMode}
                            activeTab={activeTab}
                            onTabClick={handleTabClick}
                            onConversationClick={handleConversationClick}
                        />
                        {showDemoBanner ? <DemoBanner projectId={projectId} /> : null}

                        {focusMode === "conversation" ? (
                            <div className={styles.conversationBody}>
                                <ConversationMainView projectId={projectId} />
                            </div>
                        ) : (
                            <div className={styles.viewBody} style={panelVars}>
                                <div className={styles.viewContent}>{children}</div>

                                <ResizableSplitter
                                    className={`${styles.resizeHandle} ${isCollapsed ? styles.resizeHandleHidden : ""}`}
                                    ariaLabel="Resize copilot panel"
                                    hidden={isCollapsed}
                                    disabled={isCollapsed}
                                    value={boundedPanelWidth}
                                    min={300}
                                    max={560}
                                    dragDirection="reverse"
                                    onChange={setPanelWidth}
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
                    </>
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
