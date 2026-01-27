"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { useProjects } from "@/contexts/ProjectsContext";
import Link from "next/link";
import { BaseBackButton } from "@/components/BaseBackButton";
import styles from "./ledger.module.css";
import { useLedger } from "@/contexts/LedgerContext";
import { ProjectCopilot } from "@/components/ProjectCopilot";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const RAIL_WIDTH = 44;

export default function LedgerPage() {
    const { id } = useParams<{ id: string }>();
    const { getProjectById } = useProjects();
    const { getStudiesByProject, updateStudies } = useLedger();
    const { isCollapsed, panelWidth, setPanelWidth } = useProjectCopilot();

    const project = id ? getProjectById(id) : undefined;
    const studies = useMemo(() => (id ? getStudiesByProject(id) : []), [id, getStudiesByProject]);
    const studyIds = useMemo(() => new Set(studies.map((s) => s.id)), [studies]);

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    // Filter out any selected IDs that no longer exist in studies
    const validSelectedIds = useMemo(
        () => selectedIds.filter((sid) => studyIds.has(sid)),
        [selectedIds, studyIds]
    );
    const selectedSet = useMemo(() => new Set(validSelectedIds), [validSelectedIds]);
    const allSelected = studies.length > 0 && validSelectedIds.length === studies.length;
    const hasSelection = validSelectedIds.length > 0;
    const selectAllRef = useRef<HTMLInputElement | null>(null);

    const extractedCount = studies.filter((s) => s.status === "extracted").length;

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

    // Checkbox handlers
    useEffect(() => {
        if (!selectAllRef.current) return;
        selectAllRef.current.indeterminate = hasSelection && !allSelected;
    }, [hasSelection, allSelected]);

    const toggleStudySelection = (studyId: string) => {
        setSelectedIds((prev) =>
            prev.includes(studyId) ? prev.filter((sId) => sId !== studyId) : [...prev, studyId]
        );
    };

    const toggleSelectAll = () => {
        if (allSelected) {
            setSelectedIds([]);
            return;
        }
        setSelectedIds(studies.map((study) => study.id));
    };

    const handleDeleteStudy = (studyId: string) => {
        if (!id) return;
        const confirmed = window.confirm("Delete this study from the evidence ledger?");
        if (!confirmed) return;
        updateStudies(id, studies.filter((study) => study.id !== studyId));
    };

    const handleBulkDelete = () => {
        if (!id || !hasSelection) return;
        const confirmed = window.confirm(`Delete ${validSelectedIds.length} selected studies?`);
        if (!confirmed) return;
        updateStudies(id, studies.filter((study) => !selectedSet.has(study.id)));
        setSelectedIds([]);
    };

    if (!project) {
        return (
            <AppShell activeNav="projects">
                <div className={styles.notFound}>
                    <h1>Project not found</h1>
                    <Link href="/" className="btn-minimal" style={{ width: "auto", padding: "12px 24px" }}>
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
                                        <span className={styles.eyebrow}>Evidence Ledger</span>
                                    </div>
                                    <h1>{project.name}</h1>
                                </div>
                                <div className={styles.headerActions}>
                                    {hasSelection ? (
                                        <button className="header-btn header-btn-danger" onClick={handleBulkDelete}>
                                            <span className="material-icons-round">delete</span>
                                            Delete {validSelectedIds.length} Selected
                                        </button>
                                    ) : null}
                                    <button className="header-btn">
                                        <span className="material-icons-round">upload_file</span>
                                        Import Studies
                                    </button>
                                </div>
                            </header>

                            <div className={styles.statsRow}>
                                <div className={styles.statChip}>
                                    <span className="material-icons-round">description</span>
                                    <span>{studies.length} total studies</span>
                                </div>
                                <div className={styles.statChip}>
                                    <span className="material-icons-round">check_circle</span>
                                    <span>{extractedCount} extracted</span>
                                </div>
                                <div className={styles.statChip}>
                                    <span className="material-icons-round">pending</span>
                                    <span>{studies.length - extractedCount} pending</span>
                                </div>
                                {hasSelection ? (
                                    <div className={styles.statChip}>
                                        <span className="material-icons-round">checklist</span>
                                        <span>{validSelectedIds.length} selected</span>
                                    </div>
                                ) : null}
                            </div>

                            <div className={styles.tableWrapper}>
                                <table className={styles.ledgerTable}>
                                    <thead>
                                        <tr>
                                            <th className={styles.selectCell}>
                                                <input
                                                    ref={selectAllRef}
                                                    className={styles.selectCheckbox}
                                                    type="checkbox"
                                                    checked={allSelected}
                                                    onChange={toggleSelectAll}
                                                    aria-label={allSelected ? "Deselect all studies" : "Select all studies"}
                                                />
                                            </th>
                                            <th>Study</th>
                                            <th>Authors</th>
                                            <th>Year</th>
                                            <th>Status</th>
                                            <th>Quality</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {studies.map((study) => (
                                            <tr key={study.id} className={selectedSet.has(study.id) ? styles.rowSelected : undefined}>
                                                <td className={styles.selectCell}>
                                                    <input
                                                        className={styles.selectCheckbox}
                                                        type="checkbox"
                                                        checked={selectedSet.has(study.id)}
                                                        onChange={() => toggleStudySelection(study.id)}
                                                        aria-label={`Select ${study.title}`}
                                                    />
                                                </td>
                                                <td className={styles.titleCell}>{study.title}</td>
                                                <td>{study.authors}</td>
                                                <td>{study.year}</td>
                                                <td>
                                                    <span className={`${styles.statusPill} ${study.status === "extracted" ? styles.statusExtracted : styles.statusPending}`}>
                                                        {study.status === "extracted" ? "Extracted" : "Pending"}
                                                    </span>
                                                </td>
                                                <td>
                                                    <span className={`${styles.qualityBadge} ${study.quality === "High" ? styles.qualityHigh : study.quality === "Medium" ? styles.qualityMedium : ""}`}>
                                                        {study.quality}
                                                    </span>
                                                </td>
                                                <td>
                                                    <button className={styles.actionBtn} title="Open Study">
                                                        <span className="material-icons-round">open_in_new</span>
                                                    </button>
                                                    <button className={styles.actionBtn} title="Extract Data">
                                                        <span className="material-icons-round">edit_note</span>
                                                    </button>
                                                    <button
                                                        className={styles.actionBtn}
                                                        title="Delete Study"
                                                        aria-label={`Delete ${study.title}`}
                                                        onClick={() => handleDeleteStudy(study.id)}
                                                    >
                                                        <span className="material-icons-round">delete</span>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
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
                        page="ledger"
                        contextDisplay={`${studies.length} studies · ${extractedCount} extracted`}
                        emptyState={{
                            icon: "search",
                            title: "Search your evidence",
                            description: "Ask questions about your studies, find patterns, or get evidence summaries.",
                            suggestions: [
                                { label: "Summarize", prompt: "Summarize the key findings across all studies" },
                                { label: "Find Themes", prompt: "What are the common themes in this evidence?" },
                                { label: "Find Conflicts", prompt: "Which studies have conflicting findings?" },
                            ],
                        }}
                        inputPlaceholder="Ask about your evidence…"
                        panelId="ledger-copilot-panel"
                    />
                </div>
            </div>
        </AppShell>
    );
}
