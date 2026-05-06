"use client";

import { CSSProperties, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, usePathname } from "next/navigation";
import { ProjectConversationProvider, useProjectConversation } from "@/contexts/ProjectConversationContext";
import { ProjectShellProvider, type FocusMode, type ViewTab } from "@/contexts/ProjectShellContext";
import { useCommandPalette } from "@/contexts/CommandPaletteContext";
import { useProjects } from "@/contexts/ProjectsContext";
import { AppShell } from "@/components/AppShell";
import { ProjectTabBar } from "@/components/project/ProjectTabBar";
import { ConversationMainView } from "@/components/project/ConversationMainView";
import { ProjectCopilotPanel } from "@/components/project/ProjectCopilotPanel";
import { ResizableSplitter } from "@/components/ui/ResizableSplitter";
import { PopupChat } from "@/components/PopupChat";
import { PopupChatProvider } from "@/contexts/PopupChatContext";
import { getStudyAction } from "@/app/actions/ledger";
import type { CopilotPage } from "@/types/ai";
import { DemoBanner } from "@/components/project/DemoBanner";
import { isDemoProject } from "@/lib/demo/constants";
import { isScrollOwnershipA1Enabled } from "@/lib/feature-flags";
import { shouldLockRootScroll } from "@/lib/mobile/scroll-lock-policy";
import { MOBILE_VIEWPORT_MEDIA_QUERY, PHONE_MEDIA_QUERY } from "@/lib/mobile/breakpoints";
import { isMobileScrollLockV2Enabled, isMobileViewportV2Enabled } from "@/lib/mobile/feature-flags";
import { ProjectDataProvider } from "@/contexts/ProjectDataContext";
import { recordReliabilityMetric } from "@/lib/ai/reliability-telemetry";
import {
    buildProjectConversationPath,
    parseProjectConversationPath,
} from "@/lib/durable-route-state";
import {
    decideConversationRestore,
    isProjectEntryRestoreEnabled,
    readProjectEntryState,
    setProjectModeBucket,
} from "@/lib/project-entry-restore";
import {
    deriveProjectShellBootState,
    type ProjectShellBootState,
} from "@/lib/project-entry-boot-mode";
import styles from "./project-shell.module.css";

const RAIL_WIDTH = 44;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

type ProjectShellInnerProps = {
    projectId: string;
    initialShellState: ProjectShellBootState;
    routeConversationId: string | null;
    children: ReactNode;
};

function ProjectShellInner({
    projectId,
    initialShellState,
    routeConversationId,
    children,
}: ProjectShellInnerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const projectEntryRestoreEnabled = isProjectEntryRestoreEnabled();
  const scrollOwnershipA1Enabled = isScrollOwnershipA1Enabled();
  const mobileViewportV2Enabled = isMobileViewportV2Enabled();
  const mobileScrollLockV2Enabled = isMobileScrollLockV2Enabled();
    const {
        currentConversationId,
        isCollapsed,
        panelWidth,
        setPanelWidth,
        toggleCollapsed,
        setStudyFilter,
        selectConversation,
        newConversation,
    } = useProjectConversation();
    const { registerCopilotToggle } = useCommandPalette();
    const { getProjectById, deleteProject } = useProjects();
    const project = projectId ? getProjectById(projectId) : undefined;

    const handleDeleteProject = useCallback(() => {
        if (!projectId) return;
        deleteProject(projectId);
        router.push("/");
    }, [projectId, deleteProject, router]);

    useEffect(() => {
        if (!projectId || typeof window === "undefined") return;
        window.localStorage.setItem("litrev:lastProjectId", projectId);
    }, [projectId]);

    useEffect(() => {
        if (!projectId) return;
        const startedAtMs = Date.now();
        const sessionId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `shell-${projectId}-${startedAtMs}`;
        recordReliabilityMetric({
            type: "reliability.v1.shell.session_started",
            surface: "shell",
            projectId,
            payload: {
                sessionId,
            },
        });
        return () => {
            recordReliabilityMetric({
                type: "reliability.v1.shell.session_ended",
                surface: "shell",
                projectId,
                payload: {
                    sessionId,
                    durationMs: Date.now() - startedAtMs,
                },
            });
        };
    }, [projectId]);

    const shellStateIdentity = useMemo(
        () => `${projectId}:${pathname}:${initialShellState.bootMode}:${initialShellState.focusMode}:${initialShellState.activeTab ?? "none"}`,
        [initialShellState.activeTab, initialShellState.bootMode, initialShellState.focusMode, pathname, projectId],
    );
    const [shellState, setShellState] = useState<{
        identity: string;
        focusMode: FocusMode;
        activeTab: ViewTab | null;
    }>(() => ({
        identity: shellStateIdentity,
        focusMode: initialShellState.focusMode,
        activeTab: initialShellState.activeTab,
    }));
    const focusMode = shellState.identity === shellStateIdentity ? shellState.focusMode : initialShellState.focusMode;
    const activeTab = shellState.identity === shellStateIdentity ? shellState.activeTab : initialShellState.activeTab;
    const isOnboardingRoute = pathname.endsWith("/onboarding");
    const shouldRenderSideCopilot =
        focusMode === "view" &&
        pathname !== `/project/${projectId}` &&
        !isOnboardingRoute;

    useEffect(() => {
        registerCopilotToggle(shouldRenderSideCopilot ? toggleCollapsed : null);
        return () => registerCopilotToggle(null);
    }, [registerCopilotToggle, shouldRenderSideCopilot, toggleCollapsed]);

    // Sync shell mode from route and persisted mode bucket.
    // Route tabs always force workspace mode. Root route (/project/:id) restores the saved bucket synchronously.
    useEffect(() => {
        const isRootProjectRoute = pathname === `/project/${projectId}`;
        if (projectEntryRestoreEnabled && initialShellState.bootMode !== "conversation" && !isRootProjectRoute) {
            setProjectModeBucket(projectId, "workspace");
        }
    }, [initialShellState, pathname, projectEntryRestoreEnabled, projectId]);

    useEffect(() => {
        if (!routeConversationId) return;
        let isActive = true;

        void (async () => {
            const loaded = await selectConversation(routeConversationId);
            if (!isActive || loaded) return;
            router.replace(`/project/${projectId}`);
        })();

        return () => {
            isActive = false;
        };
    }, [projectId, routeConversationId, router, selectConversation]);

    // Keep root scrolling scoped to shell owners (baseline path).
    // A1 disabled => preserve existing behavior/dependencies unchanged.
    useEffect(() => {
        if (scrollOwnershipA1Enabled) return;
        if (typeof document === "undefined" || typeof window === "undefined") return;

        const html = document.documentElement;
        const body = document.body;
        const prevHtmlOverflow = html.style.overflow;
        const prevHtmlOverscroll = html.style.overscrollBehavior;
        const prevBodyOverflow = body.style.overflow;
        const prevBodyOverscroll = body.style.overscrollBehavior;

        const applyLockedRootScroll = () => {
            html.style.overflow = "hidden";
            html.style.overscrollBehavior = "none";
            body.style.overflow = "hidden";
            body.style.overscrollBehavior = "none";
        };

        const applyUnlockedRootScroll = () => {
            html.style.overflow = "";
            html.style.overscrollBehavior = "";
            body.style.overflow = "";
            body.style.overscrollBehavior = "";
        };

        if (!mobileScrollLockV2Enabled) {
            applyLockedRootScroll();
            return () => {
                html.style.overflow = prevHtmlOverflow;
                html.style.overscrollBehavior = prevHtmlOverscroll;
                body.style.overflow = prevBodyOverflow;
                body.style.overscrollBehavior = prevBodyOverscroll;
            };
        }

        const mobileQuery = window.matchMedia(
            focusMode === "conversation" ? PHONE_MEDIA_QUERY : MOBILE_VIEWPORT_MEDIA_QUERY,
        );
        const applyByViewport = () => {
            if (mobileQuery.matches) {
                applyUnlockedRootScroll();
                return;
            }
            applyLockedRootScroll();
        };

        applyByViewport();
        if (typeof mobileQuery.addEventListener === "function") {
            mobileQuery.addEventListener("change", applyByViewport);
        } else if (typeof mobileQuery.addListener === "function") {
            mobileQuery.addListener(applyByViewport);
        }

        return () => {
            if (typeof mobileQuery.removeEventListener === "function") {
                mobileQuery.removeEventListener("change", applyByViewport);
            } else if (typeof mobileQuery.removeListener === "function") {
                mobileQuery.removeListener(applyByViewport);
            }
            html.style.overflow = prevHtmlOverflow;
            html.style.overscrollBehavior = prevHtmlOverscroll;
            body.style.overflow = prevBodyOverflow;
            body.style.overscrollBehavior = prevBodyOverscroll;
        };
    }, [focusMode, mobileScrollLockV2Enabled, scrollOwnershipA1Enabled]);

    // Keep root scrolling scoped to shell owners (A1 truth table path).
    // - desktop + view mode => locked
    // - desktop + conversation mode => unlocked
    // - mobile => preserve existing mobile-scroll-lock behavior
    useEffect(() => {
        if (!scrollOwnershipA1Enabled) return;
        if (typeof document === "undefined" || typeof window === "undefined") return;

        const html = document.documentElement;
        const body = document.body;
        const prevHtmlOverflow = html.style.overflow;
        const prevHtmlOverscroll = html.style.overscrollBehavior;
        const prevBodyOverflow = body.style.overflow;
        const prevBodyOverscroll = body.style.overscrollBehavior;

        const applyLockedRootScroll = () => {
            html.style.overflow = "hidden";
            html.style.overscrollBehavior = "none";
            body.style.overflow = "hidden";
            body.style.overscrollBehavior = "none";
        };

        const applyUnlockedRootScroll = () => {
            html.style.overflow = "";
            html.style.overscrollBehavior = "";
            body.style.overflow = "";
            body.style.overscrollBehavior = "";
        };

        const mobileQuery = window.matchMedia(
            focusMode === "conversation" ? PHONE_MEDIA_QUERY : MOBILE_VIEWPORT_MEDIA_QUERY,
        );
        const applyByViewportAndMode = () => {
            const shouldLock = shouldLockRootScroll({
                a1Enabled: scrollOwnershipA1Enabled,
                mobileScrollLockV2Enabled,
                isMobileViewport: mobileQuery.matches,
                focusMode,
            });
            if (shouldLock) {
                applyLockedRootScroll();
            } else {
                applyUnlockedRootScroll();
            }
        };

        applyByViewportAndMode();
        if (typeof mobileQuery.addEventListener === "function") {
            mobileQuery.addEventListener("change", applyByViewportAndMode);
        } else if (typeof mobileQuery.addListener === "function") {
            mobileQuery.addListener(applyByViewportAndMode);
        }

        return () => {
            if (typeof mobileQuery.removeEventListener === "function") {
                mobileQuery.removeEventListener("change", applyByViewportAndMode);
            } else if (typeof mobileQuery.removeListener === "function") {
                mobileQuery.removeListener(applyByViewportAndMode);
            }
            html.style.overflow = prevHtmlOverflow;
            html.style.overscrollBehavior = prevHtmlOverscroll;
            body.style.overflow = prevBodyOverflow;
            body.style.overscrollBehavior = prevBodyOverscroll;
        };
    }, [focusMode, mobileScrollLockV2Enabled, scrollOwnershipA1Enabled]);

    const setActiveTab = useCallback((tab: ViewTab) => {
        setShellState({
            identity: shellStateIdentity,
            activeTab: tab,
            focusMode: "view",
        });
        if (projectEntryRestoreEnabled) {
            setProjectModeBucket(projectId, "workspace");
        }
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
    }, [projectEntryRestoreEnabled, projectId, router, shellStateIdentity]);

    const returnToConversation = useCallback(() => {
        void (async () => {
            const targetConversationId =
                currentConversationId ?? await newConversation("overview" as CopilotPage);
            if (!targetConversationId) return;
            setShellState({
                identity: shellStateIdentity,
                activeTab,
                focusMode: "conversation",
            });
            if (projectEntryRestoreEnabled) {
                setProjectModeBucket(projectId, "conversation");
            }
            router.push(buildProjectConversationPath(projectId, targetConversationId));
        })();
    }, [activeTab, currentConversationId, newConversation, projectEntryRestoreEnabled, projectId, router, shellStateIdentity]);

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
    const viewBodyStyle = shouldRenderSideCopilot
        ? panelVars
        : ({ gridTemplateColumns: "minmax(0, 1fr)" } as CSSProperties);
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
    const [studyTitleState, setStudyTitleState] = useState<{
        studyId: string | null;
        title: string | null;
    }>({
        studyId: copilotStudyId ?? null,
        title: null,
    });
    const studyTitle = studyTitleState.studyId === copilotStudyId ? studyTitleState.title : null;
    useEffect(() => {
        if (!copilotStudyId || !projectId) {
            return;
        }

        let active = true;
        const loadStudyTitle = async () => {
            try {
                const result = await getStudyAction(projectId, copilotStudyId);
                if (!active) return;
                setStudyTitleState({
                    studyId: copilotStudyId,
                    title: result.success && result.data ? result.data.title : null,
                });
            } catch {
                if (active) {
                    setStudyTitleState({
                        studyId: copilotStudyId,
                        title: null,
                    });
                }
            }
        };

        void loadStudyTitle();

        return () => {
            active = false;
        };
    }, [copilotStudyId, projectId]);

    const copilotContextDisplay = isStudyDetail
        ? (studyTitle || "Study")
        : activeTab
            ? `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`
            : "Project";
    const showDemoBanner = isDemoProject(project) && !isOnboardingRoute && focusMode === "conversation";

    // Centralized scope ownership — driven by pathname, no cleanup return
    useEffect(() => {
        setStudyFilter(copilotStudyId);
    }, [copilotStudyId, setStudyFilter]);

    return (
        <ProjectShellProvider value={shellValue}>
            <AppShell
                activeNav="projects"
                mainClassName={[
                    styles.shellMain,
                    mobileViewportV2Enabled ? styles.shellMainViewportV2 : "",
                    focusMode === "conversation" ? styles.shellMainConversation : "",
                ].filter(Boolean).join(" ")}
                noMainPadding
                initiallyCollapsed
            >
                {isOnboardingRoute ? (
                    <div className={styles.onboardingBody}>{children}</div>
                ) : (
                    <>
                        <ProjectTabBar
                            focusMode={focusMode}
                            activeTab={activeTab}
                            onTabClick={handleTabClick}
                            onConversationClick={handleConversationClick}
                            projectName={project?.name}
                            onDeleteProject={handleDeleteProject}
                        />
                        {showDemoBanner ? <DemoBanner projectId={projectId} /> : null}

                        {focusMode === "conversation" ? (
                            <div className={styles.conversationBody}>
                                <ConversationMainView projectId={projectId} />
                            </div>
                        ) : (
                            <div className={styles.viewBody} style={viewBodyStyle}>
                                <div className={styles.viewContent}>{children}</div>

                                {shouldRenderSideCopilot ? (
                                    <>
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
                                            <ProjectCopilotPanel
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
                                    </>
                                ) : null}
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
    const router = useRouter();
    const pathname = usePathname();
    const projectId = params?.id ?? "";
    const projectEntryRestoreEnabled = isProjectEntryRestoreEnabled();
    const routeConversationIdentity = useMemo(
        () => parseProjectConversationPath(pathname),
        [pathname],
    );
    const routeConversationId = routeConversationIdentity?.projectId === projectId
        ? routeConversationIdentity.conversationId
        : null;
    const initialShellState = useMemo(() => deriveProjectShellBootState({
        pathname,
        projectId,
        projectEntryRestoreEnabled,
    }), [pathname, projectEntryRestoreEnabled, projectId]);
    useEffect(() => {
        if (!projectEntryRestoreEnabled) return;
        if (routeConversationId) return;
        if (pathname !== `/project/${projectId}`) return;
        const decision = decideConversationRestore(
            readProjectEntryState(projectId),
            Date.now(),
        );
        if (!decision.shouldRestore) {
            setProjectModeBucket(projectId, "workspace");
            return;
        }
        router.replace(buildProjectConversationPath(projectId, decision.conversationId));
    }, [pathname, projectEntryRestoreEnabled, projectId, routeConversationId, router]);

    return (
        <ProjectConversationProvider
            projectId={projectId}
            routeConversationId={routeConversationId}
        >
            <PopupChatProvider>
                <ProjectDataProvider projectId={projectId} bootMode={initialShellState.bootMode}>
                    <ProjectShellInner
                        projectId={projectId}
                        initialShellState={initialShellState}
                        routeConversationId={routeConversationId}
                    >
                        {children}
                    </ProjectShellInner>
                </ProjectDataProvider>
                <PopupChat projectId={projectId} />
            </PopupChatProvider>
        </ProjectConversationProvider>
    );
}
