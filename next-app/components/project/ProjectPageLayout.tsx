"use client";

import { CSSProperties, ReactNode, useMemo, useSyncExternalStore } from "react";
import { AppShell } from "@/components/AppShell";
import { ProjectCopilot, type ProjectCopilotProps } from "@/components/ProjectCopilot";
import { ResizableSplitter } from "@/components/ui/ResizableSplitter";
import { useProjectShell } from "@/contexts/ProjectShellContext";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import { getViewportClass, type ResponsiveViewportClass } from "@/lib/mobile/tiers";
import styles from "./ProjectPageLayout.module.css";

const RAIL_WIDTH = 44;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function subscribeViewportClass(onStoreChange: () => void) {
    if (typeof window === "undefined") {
        return () => {};
    }

    window.addEventListener("resize", onStoreChange, { passive: true });
    window.addEventListener("orientationchange", onStoreChange, { passive: true });

    return () => {
        window.removeEventListener("resize", onStoreChange);
        window.removeEventListener("orientationchange", onStoreChange);
    };
}

function getClientViewportClassSnapshot(): ResponsiveViewportClass {
    if (typeof window === "undefined") {
        return "unknown";
    }

    return getViewportClass(window);
}

function getServerViewportClassSnapshot(): ResponsiveViewportClass {
    return "unknown";
}

export type ProjectPageLayoutProps = {
    children: ReactNode;
    /** If provided, renders a standalone copilot panel with resize handle in non-embedded mode */
    copilot?: ProjectCopilotProps;
    /** AppShell passthrough: removes default main padding */
    noMainPadding?: boolean;
    /** AppShell passthrough: start with sidebar collapsed */
    initiallyCollapsed?: boolean;
    /** AppShell passthrough: extra class on the main element */
    mainClassName?: string;
    /** Standalone copilot collapse threshold. Defaults to legacy <900 behavior. */
    copilotCollapseMode?: "legacy-mobile" | "phone-only";
    /** Standalone scroll ownership. Defaults to wrapper scroll. */
    contentScrollMode?: "wrapper" | "child";
};

/**
 * Shared wrapper for all project sub-pages.
 *
 * Handles the embedded-vs-standalone shell contract:
 * - When embedded in ProjectShell (isEmbeddedInProjectShell === true):
 *   renders children only — the parent layout.tsx already provides AppShell,
 *   tab bar, copilot panel, and resize handle.
 * - When standalone (direct URL access):
 *   wraps in AppShell and optionally renders a copilot side panel with
 *   a resize handle.
 *
 * Pages still handle their own back buttons, loading states, and not-found
 * views internally — this wrapper only handles the outermost shell contract.
 */
export function ProjectPageLayout({
    children,
    copilot,
    noMainPadding,
    initiallyCollapsed,
    mainClassName,
    copilotCollapseMode = "legacy-mobile",
    contentScrollMode = "wrapper",
}: ProjectPageLayoutProps) {
    const { isEmbeddedInProjectShell } = useProjectShell();

    // ── Embedded: content-only ────────────────────────────────────────────
    if (isEmbeddedInProjectShell) {
        return <>{children}</>;
    }

    // ── Standalone: wrap in AppShell ──────────────────────────────────────
    if (!copilot) {
        return (
            <AppShell
                activeNav="projects"
                noMainPadding={noMainPadding}
                initiallyCollapsed={initiallyCollapsed}
                mainClassName={mainClassName}
            >
                {children}
            </AppShell>
        );
    }

    // ── Standalone with copilot panel ─────────────────────────────────────
    return (
        <AppShell
            activeNav="projects"
            noMainPadding={noMainPadding}
            initiallyCollapsed={initiallyCollapsed}
            mainClassName={mainClassName}
        >
            <StandaloneCopilotGrid
                copilot={copilot}
                copilotCollapseMode={copilotCollapseMode}
                contentScrollMode={contentScrollMode}
            >
                {children}
            </StandaloneCopilotGrid>
        </AppShell>
    );
}

// ── Internal: grid layout with copilot + resize handle ───────────────────
// Extracted so the useProjectCopilot() hook is only called when needed.

function StandaloneCopilotGrid({
    children,
    copilot,
    copilotCollapseMode,
    contentScrollMode,
}: {
    children: ReactNode;
    copilot: ProjectCopilotProps;
    copilotCollapseMode: "legacy-mobile" | "phone-only";
    contentScrollMode: "wrapper" | "child";
}) {
    const { isCollapsed, panelWidth, setPanelWidth } = useProjectCopilot();
    const liveViewportClass = useSyncExternalStore(
        subscribeViewportClass,
        getClientViewportClassSnapshot,
        getServerViewportClassSnapshot,
    );
    const viewportClass = copilotCollapseMode === "phone-only" ? liveViewportClass : "unknown";
    const boundedWidth = clamp(panelWidth, 300, 560);

    const panelVars = useMemo<CSSProperties>(() => {
        const w = isCollapsed ? RAIL_WIDTH : boundedWidth;
        const cols = isCollapsed ? `1fr 0px ${RAIL_WIDTH}px` : `1fr 1px ${w}px`;
        return {
            "--copilot-width": `${w}px`,
            "--copilot-grid-template-columns": cols,
        } as CSSProperties;
    }, [boundedWidth, isCollapsed]);

    return (
        <div
            className={styles.grid}
            style={panelVars}
            data-copilot-collapse-mode={copilotCollapseMode}
            data-viewport-class={viewportClass}
            data-testid="project-page-layout-grid"
        >
            <div
                className={styles.content}
                data-scroll-owner={contentScrollMode}
                data-testid="project-page-layout-content"
            >
                {children}
            </div>

            <ResizableSplitter
                className={`${styles.resizeHandle} ${isCollapsed ? styles.resizeHandleHidden : ""}`}
                ariaLabel="Resize copilot panel"
                hidden={isCollapsed}
                disabled={isCollapsed}
                value={boundedWidth}
                min={300}
                max={560}
                dragDirection="reverse"
                onChange={setPanelWidth}
            />

            <div className={styles.copilotPane}>
                <ProjectCopilot {...copilot} />
            </div>
        </div>
    );
}
