"use client";

import { CSSProperties, ReactNode, useCallback, useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { ProjectCopilot, type ProjectCopilotProps } from "@/components/ProjectCopilot";
import { useProjectShell } from "@/contexts/ProjectShellContext";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import styles from "./ProjectPageLayout.module.css";

const RAIL_WIDTH = 44;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

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
            <StandaloneCopilotGrid copilot={copilot}>
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
}: {
    children: ReactNode;
    copilot: ProjectCopilotProps;
}) {
    const { isCollapsed, panelWidth, setPanelWidth } = useProjectCopilot();

    const panelVars = useMemo<CSSProperties>(() => {
        const w = isCollapsed ? RAIL_WIDTH : clamp(panelWidth, 300, 560);
        const cols = isCollapsed ? `1fr 0px ${RAIL_WIDTH}px` : `1fr 1px ${w}px`;
        return { "--copilot-width": `${w}px`, gridTemplateColumns: cols } as CSSProperties;
    }, [isCollapsed, panelWidth]);

    const startResize = useCallback(
        (startX: number) => {
            const startWidth = clamp(panelWidth, 300, 560);
            const handleMove = (e: MouseEvent) => {
                const dx = startX - e.clientX;
                setPanelWidth(clamp(startWidth + dx, 300, 560));
            };
            const handleEnd = () => {
                window.removeEventListener("mousemove", handleMove);
                window.removeEventListener("mouseup", handleEnd);
            };
            window.addEventListener("mousemove", handleMove);
            window.addEventListener("mouseup", handleEnd);
        },
        [panelWidth, setPanelWidth],
    );

    return (
        <div className={styles.grid} style={panelVars}>
            <div className={styles.content}>{children}</div>

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
                <ProjectCopilot {...copilot} />
            </div>
        </div>
    );
}
