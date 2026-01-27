"use client";

import { CSSProperties, useCallback, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useProjects } from "@/contexts/ProjectsContext";
import Link from "next/link";
import { BaseBackButton } from "@/components/BaseBackButton";
import styles from "./protocol.module.css";
import { ProjectCopilot } from "@/components/ProjectCopilot";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const RAIL_WIDTH = 44;

export default function ProtocolPage() {
    const { id } = useParams<{ id: string }>();
    const { getProjectById } = useProjects();
    const { isCollapsed, panelWidth, setPanelWidth } = useProjectCopilot();
    const project = id ? getProjectById(id) : undefined;

    // Calculate panel widths
    const computePanelVars = (): CSSProperties => {
        const copilot = isCollapsed ? RAIL_WIDTH : clamp(panelWidth, 300, 560);
        // When collapsed, hide the resize handle column
        const gridCols = isCollapsed
            ? `1fr 0px ${RAIL_WIDTH}px`
            : `1fr 1px ${copilot}px`;
        return {
            "--copilot-width": `${copilot}px`,
            "gridTemplateColumns": gridCols,
        } as CSSProperties;
    };

    // Resize state
    type ResizeState = { side: "copilot"; startX: number; startWidth: number } | null;
    const resizeRef = useRef<ResizeState>(null);
    const handlersRef = useRef<{ move: (e: MouseEvent) => void; end: () => void } | null>(null);

    const startResize = useCallback((side: "copilot", startX: number) => {
        const startWidth = clamp(panelWidth, 300, 560);
        resizeRef.current = { side, startX, startWidth };

        const handleMove = (e: MouseEvent) => {
            if (!resizeRef.current) return;
            const { startX: sx, startWidth: sw } = resizeRef.current;
            const dx = sx - e.clientX;
            const next = clamp(sw + dx, 300, 560);
            setPanelWidth(next);
        };

        const handleEnd = () => {
            resizeRef.current = null;
            if (handlersRef.current) {
                window.removeEventListener("mousemove", handlersRef.current.move);
                window.removeEventListener("mouseup", handlersRef.current.end);
                handlersRef.current = null;
            }
        };

        handlersRef.current = { move: handleMove, end: handleEnd };
        window.addEventListener("mousemove", handleMove);
        window.addEventListener("mouseup", handleEnd);
    }, [panelWidth, setPanelWidth]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (handlersRef.current) {
                window.removeEventListener("mousemove", handlersRef.current.move);
                window.removeEventListener("mouseup", handlersRef.current.end);
            }
        };
    }, []);

    if (!project) {
        return (
            <AppShell activeNav="projects">
                <div className={styles.notFound}>
                    <h1>Project not found</h1>
                    <Link href="/" className="btn btn-primary" style={{ width: "auto", padding: "12px 24px" }}>
                        Back to Dashboard
                    </Link>
                </div>
            </AppShell>
        );
    }

    return (
        <AppShell activeNav="projects" mainClassName={styles.appMainOverride}>
            <div className={styles.page}>
                <div className={styles.body} style={computePanelVars()}>
                    {/* Main Content */}
                    <div className={styles.mainContent}>
                        <div className={styles.layout}>
                            <header className={styles.header}>
                                <div className={styles.headerText}>
                                    <div style={{ display: "flex", alignItems: "center" }}>
                                        <BaseBackButton href={`/project/${project.id}`} />
                                        <span className={styles.eyebrow}>Study Protocol</span>
                                    </div>
                                    <h1>{project.name}</h1>
                                </div>
                            </header>

                            <div className={styles.content}>
                                <section className={styles.section}>
                                    <h2 className={styles.sectionTitle}>
                                        <span className="material-icons-round">target</span>
                                        PICO Framework
                                    </h2>
                                    <div className={styles.picoGrid}>
                                        <div className={styles.picoCard}>
                                            <span className={styles.picoLabel}>Population</span>
                                            <p className={styles.picoValue}>Adults diagnosed with early-stage tumors</p>
                                        </div>
                                        <div className={styles.picoCard}>
                                            <span className={styles.picoLabel}>Intervention</span>
                                            <p className={styles.picoValue}>AI-assisted imaging analysis</p>
                                        </div>
                                        <div className={styles.picoCard}>
                                            <span className={styles.picoLabel}>Comparison</span>
                                            <p className={styles.picoValue}>Standard radiologist review</p>
                                        </div>
                                        <div className={styles.picoCard}>
                                            <span className={styles.picoLabel}>Outcome</span>
                                            <p className={styles.picoValue}>Detection accuracy and time to diagnosis</p>
                                        </div>
                                    </div>
                                </section>

                                <section className={styles.section}>
                                    <h2 className={styles.sectionTitle}>
                                        <span className="material-icons-round">checklist</span>
                                        Eligibility Criteria
                                    </h2>
                                    <div className={styles.criteriaLists}>
                                        <div className={styles.criteriaGroup}>
                                            <h3 className={styles.criteriaHeading}>Inclusion</h3>
                                            <ul className={styles.criteriaList}>
                                                <li>Published between 2018-2024</li>
                                                <li>Peer-reviewed journal articles</li>
                                                <li>Reports quantitative outcomes</li>
                                                <li>English language</li>
                                            </ul>
                                        </div>
                                        <div className={styles.criteriaGroup}>
                                            <h3 className={styles.criteriaHeading}>Exclusion</h3>
                                            <ul className={styles.criteriaList}>
                                                <li>Conference abstracts only</li>
                                                <li>Case reports with n &lt; 10</li>
                                                <li>Non-human subjects</li>
                                            </ul>
                                        </div>
                                    </div>
                                </section>

                                <section className={styles.section}>
                                    <h2 className={styles.sectionTitle}>
                                        <span className="material-icons-round">search</span>
                                        Search Strategy
                                    </h2>
                                    <div className={styles.searchBox}>
                                        <code className={styles.searchQuery}>
                                            (&quot;deep learning&quot; OR &quot;machine learning&quot; OR &quot;artificial intelligence&quot;) AND
                                            (&quot;radiology&quot; OR &quot;imaging&quot; OR &quot;CT&quot; OR &quot;MRI&quot;) AND
                                            (&quot;tumor detection&quot; OR &quot;cancer screening&quot;)
                                        </code>
                                    </div>
                                    <div className={styles.databaseList}>
                                        <span className={styles.databaseChip}>PubMed</span>
                                        <span className={styles.databaseChip}>Embase</span>
                                        <span className={styles.databaseChip}>Cochrane Library</span>
                                        <span className={styles.databaseChip}>Web of Science</span>
                                    </div>
                                </section>
                            </div>
                        </div>
                    </div>

                    {/* Resize Handle */}
                    <div
                        className={`${styles.resizeHandle} ${isCollapsed ? styles.resizeHandleHidden : ""}`}
                        role="separator"
                        aria-label="Resize copilot panel"
                        aria-hidden={isCollapsed}
                        onMouseDown={(e) => {
                            if (isCollapsed) return;
                            startResize("copilot", e.clientX);
                        }}
                    />

                    {/* Copilot Panel */}
                    <ProjectCopilot
                        page="protocol"
                        contextDisplay="PICO · Criteria · Search"
                        emptyState={{
                            icon: "assignment",
                            title: "Refine your protocol",
                            description: "Get help defining PICO criteria, search strategies, and eligibility rules.",
                            suggestions: [
                                { label: "PICO Help", prompt: "Help me refine my PICO criteria" },
                                { label: "Search Terms", prompt: "Suggest additional search terms for my topic" },
                                { label: "Criteria Review", prompt: "Review my eligibility criteria for gaps" },
                            ],
                        }}
                        inputPlaceholder="Ask about your protocol…"
                        panelId="protocol-copilot-panel"
                    />
                </div>
            </div>
        </AppShell>
    );
}
