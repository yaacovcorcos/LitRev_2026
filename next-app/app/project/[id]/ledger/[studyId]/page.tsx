"use client";

import { useEffect, useState, useCallback, useMemo, useRef, CSSProperties } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { useProjects } from "@/contexts/ProjectsContext";
import { useLedger } from "@/contexts/LedgerContext";
import { BaseBackButton } from "@/components/BaseBackButton";
import { ProjectCopilot } from "@/components/ProjectCopilot";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import { CitationBlock } from "@/components/CitationBlock";
import { StudyQuickInfo } from "@/components/StudyQuickInfo";
import { StudyFilesPanel } from "@/components/StudyFilesPanel";
import { listProjectFilesAction, deleteFileAssetAction, uploadStudyFileAction } from "@/app/actions/files";
import type { Study, StudyDetails } from "@/types/ledger";
import type { FileAsset } from "@/types/files";
import styles from "./study.module.css";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const RAIL_WIDTH = 44;

export default function StudyDetailPage() {
    const { id, studyId } = useParams<{ id: string; studyId: string }>();
    const { getProjectById } = useProjects();
    const { getStudyById, updateSingleStudy } = useLedger();
    const { isCollapsed, panelWidth, setPanelWidth } = useProjectCopilot();

    const project = id ? getProjectById(id) : undefined;
    const [study, setStudy] = useState<Study | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<Partial<Study>>({});

    // Files state
    const [studyFiles, setStudyFiles] = useState<FileAsset[]>([]);
    const [showFilesPanel, setShowFilesPanel] = useState(false);

    // Load study
    useEffect(() => {
        if (!id || !studyId) return;
        let active = true;
        setIsLoading(true);
        getStudyById(id, studyId).then((s) => {
            if (active) {
                setStudy(s);
                setIsLoading(false);
            }
        });
        return () => { active = false; };
    }, [id, studyId, getStudyById]);

    // Load files
    const loadFiles = useCallback(async () => {
        if (!id || !studyId) return;
        try {
            const allFiles = await listProjectFilesAction(id);
            setStudyFiles(allFiles.filter((f) => f.studyId === studyId));
        } catch (err) {
            console.error("Failed to load files", err);
        }
    }, [id, studyId]);

    useEffect(() => {
        loadFiles();
    }, [loadFiles]);

    const handleUploadFile = useCallback(async (file: File) => {
        if (!id || !studyId) return;
        const formData = new FormData();
        formData.append("file", file);
        await uploadStudyFileAction(id, studyId, formData);
        await loadFiles();
    }, [id, studyId, loadFiles]);

    const handleDeleteFile = useCallback(async (fileId: string) => {
        if (!id) return;
        await deleteFileAssetAction(id, fileId);
        await loadFiles();
    }, [id, loadFiles]);

    // Edit handlers
    const startEdit = () => {
        if (!study) return;
        setEditForm({
            title: study.title,
            authors: study.authors,
            year: study.year,
            status: study.status,
            quality: study.quality,
            details: { ...study.details },
        });
        setIsEditing(true);
    };

    const cancelEdit = () => {
        setIsEditing(false);
        setEditForm({});
    };

    const saveEdit = async () => {
        if (!id || !studyId || !study) return;
        try {
            const updated = await updateSingleStudy(id, studyId, editForm);
            setStudy(updated);
            setIsEditing(false);
            setEditForm({});
        } catch (err) {
            console.error("Failed to update study", err);
            window.alert("Failed to save changes");
        }
    };

    const updateEditField = <K extends keyof Study>(key: K, value: Study[K]) => {
        setEditForm((prev) => ({ ...prev, [key]: value }));
    };

    const updateEditDetails = <K extends keyof StudyDetails>(key: K, value: StudyDetails[K]) => {
        setEditForm((prev) => ({
            ...prev,
            details: { ...((prev.details as StudyDetails) ?? {}), [key]: value },
        }));
    };

    // Panel sizing
    const computePanelVars = (): CSSProperties => {
        const copilot = isCollapsed ? RAIL_WIDTH : clamp(panelWidth, 300, 560);
        const gridCols = isCollapsed ? `1fr 0px ${RAIL_WIDTH}px` : `1fr 1px ${copilot}px`;
        return { "--copilot-width": `${copilot}px`, gridTemplateColumns: gridCols } as CSSProperties;
    };

    // Resize
    type ResizeState = { side: "copilot"; startX: number; startWidth: number } | null;
    const resizeRef = useRef<ResizeState>(null);
    const handlersRef = useRef<{ move: (e: MouseEvent) => void; end: () => void } | null>(null);

    const startResize = useCallback((side: "copilot", startX: number) => {
        const startWidth = clamp(panelWidth, 300, 560);
        resizeRef.current = { side, startX, startWidth };
        const handleMove = (e: MouseEvent) => {
            if (!resizeRef.current) return;
            const dx = resizeRef.current.startX - e.clientX;
            setPanelWidth(clamp(resizeRef.current.startWidth + dx, 300, 560));
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

    useEffect(() => {
        return () => {
            if (handlersRef.current) {
                window.removeEventListener("mousemove", handlersRef.current.move);
                window.removeEventListener("mouseup", handlersRef.current.end);
            }
        };
    }, []);

    const d: StudyDetails = study?.details ?? {};

    if (!project) {
        return (
            <AppShell activeNav="projects">
                <div className={styles.notFound}>
                    <h1>Project not found</h1>
                    <Link href="/" className="btn-minimal">Back to Dashboard</Link>
                </div>
            </AppShell>
        );
    }

    if (isLoading) {
        return (
            <AppShell activeNav="projects" mainClassName={styles.appMainOverride}>
                <div className={styles.loading}>Loading study...</div>
            </AppShell>
        );
    }

    if (!study) {
        return (
            <AppShell activeNav="projects">
                <div className={styles.notFound}>
                    <h1>Study not found</h1>
                    <Link href={`/project/${id}/ledger`} className="btn-minimal">Back to Ledger</Link>
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
                            {/* Header */}
                            <header className={styles.header}>
                                <div className={styles.headerText}>
                                    <div style={{ display: "flex", alignItems: "center" }}>
                                        <BaseBackButton href={`/project/${id}/ledger`} />
                                        <span className={styles.eyebrow}>Study Details</span>
                                    </div>
                                    {isEditing ? (
                                        <input
                                            className={styles.titleInput}
                                            value={editForm.title ?? ""}
                                            onChange={(e) => updateEditField("title", e.target.value)}
                                            placeholder="Study title"
                                        />
                                    ) : (
                                        <h1>{study.title}</h1>
                                    )}
                                    {isEditing ? (
                                        <input
                                            className={styles.authorsInput}
                                            value={editForm.authors ?? ""}
                                            onChange={(e) => updateEditField("authors", e.target.value)}
                                            placeholder="Authors"
                                        />
                                    ) : (
                                        <p className={styles.authors}>{study.authors} ({study.year})</p>
                                    )}
                                </div>
                                <div className={styles.headerActions}>
                                    {isEditing ? (
                                        <>
                                            <button className="header-btn" onClick={saveEdit}>
                                                <span className="material-icons-round">check</span>
                                                Save
                                            </button>
                                            <button className="header-btn" onClick={cancelEdit}>
                                                <span className="material-icons-round">close</span>
                                                Cancel
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button className="header-btn" onClick={startEdit}>
                                                <span className="material-icons-round">edit</span>
                                                Edit
                                            </button>
                                            <button className="header-btn" onClick={() => setShowFilesPanel(true)}>
                                                <span className="material-icons-round">attach_file</span>
                                                Files ({studyFiles.length})
                                            </button>
                                        </>
                                    )}
                                </div>
                            </header>

                            {/* Status & Quality */}
                            <div className={styles.statusRow}>
                                <span className={`${styles.statusPill} ${study.status === "extracted" ? styles.statusExtracted : styles.statusPending}`}>
                                    {study.status === "extracted" ? "Extracted" : "Pending"}
                                </span>
                                <span className={`${styles.qualityBadge} ${study.quality === "High" ? styles.qualityHigh : study.quality === "Medium" ? styles.qualityMedium : ""}`}>
                                    Quality: {study.quality}
                                </span>
                            </div>

                            {/* Quick Info */}
                            <StudyQuickInfo study={study} />

                            {/* Abstract */}
                            <section className={styles.section}>
                                <h2 className={styles.sectionTitle}>
                                    <span className="material-icons-round">description</span>
                                    Abstract
                                </h2>
                                {isEditing ? (
                                    <textarea
                                        className={styles.abstractTextarea}
                                        value={(editForm.details as StudyDetails)?.abstract ?? ""}
                                        onChange={(e) => updateEditDetails("abstract", e.target.value)}
                                        placeholder="Enter abstract..."
                                        rows={6}
                                    />
                                ) : d.abstract ? (
                                    <p className={styles.abstractText}>{d.abstract}</p>
                                ) : (
                                    <p className={styles.emptyText}>No abstract available</p>
                                )}
                            </section>

                            {/* AI Summary Placeholder */}
                            <section className={styles.section}>
                                <h2 className={styles.sectionTitle}>
                                    <span className="material-icons-round">auto_awesome</span>
                                    AI Summary
                                </h2>
                                {d.aiSummary ? (
                                    <p className={styles.summaryText}>{d.aiSummary}</p>
                                ) : (
                                    <div className={styles.placeholder}>
                                        <span className="material-icons-round">smart_toy</span>
                                        <p>AI-generated summary will appear here</p>
                                    </div>
                                )}
                            </section>

                            {/* Citation */}
                            <section className={styles.section}>
                                <CitationBlock study={study} />
                            </section>

                            {/* Quality Assessment */}
                            <section className={styles.section}>
                                <h2 className={styles.sectionTitle}>
                                    <span className="material-icons-round">verified</span>
                                    Quality Assessment
                                </h2>
                                {isEditing ? (
                                    <select
                                        className={styles.qualitySelect}
                                        value={editForm.quality ?? study.quality}
                                        onChange={(e) => updateEditField("quality", e.target.value as Study["quality"])}
                                    >
                                        <option value="-">Not Assessed</option>
                                        <option value="High">High</option>
                                        <option value="Medium">Medium</option>
                                        <option value="Low">Low</option>
                                    </select>
                                ) : (
                                    <div className={styles.qualityDisplay}>
                                        <span className={`${styles.qualityBadgeLarge} ${study.quality === "High" ? styles.qualityHigh : study.quality === "Medium" ? styles.qualityMedium : ""}`}>
                                            {study.quality === "-" ? "Not Assessed" : study.quality}
                                        </span>
                                    </div>
                                )}
                            </section>

                            {/* Draft Backlinks Placeholder */}
                            <section className={styles.section}>
                                <h2 className={styles.sectionTitle}>
                                    <span className="material-icons-round">format_quote</span>
                                    Draft References
                                </h2>
                                <div className={styles.placeholder}>
                                    <span className="material-icons-round">link_off</span>
                                    <p>No linked draft statements yet</p>
                                </div>
                            </section>
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
                        page="study"
                        contextDisplay={study.title}
                        emptyState={{
                            icon: "psychology",
                            title: "Ask about this study",
                            description: "Get help understanding findings, methodology, or how this study relates to your review.",
                            suggestions: [
                                { label: "Summarize", prompt: "Summarize the key findings of this study" },
                                { label: "Strengths", prompt: "What are the strengths and limitations?" },
                                { label: "Compare", prompt: "How does this compare to other studies?" },
                            ],
                        }}
                        inputPlaceholder="Ask about this study…"
                        panelId="study-copilot-panel"
                    />
                </div>

                {/* Files Panel */}
                {showFilesPanel && (
                    <div className={styles.filesPanel}>
                        <StudyFilesPanel
                            projectId={id}
                            studyId={studyId}
                            studyTitle={study.title}
                            files={studyFiles}
                            onUpload={handleUploadFile}
                            onDelete={handleDeleteFile}
                            onClose={() => setShowFilesPanel(false)}
                        />
                    </div>
                )}
            </div>
        </AppShell>
    );
}
