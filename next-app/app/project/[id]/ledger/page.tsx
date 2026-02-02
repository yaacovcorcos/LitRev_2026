"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { useProjects } from "@/contexts/ProjectsContext";
import { BaseBackButton } from "@/components/BaseBackButton";
import { StudyFilesPanel } from "@/components/StudyFilesPanel";
import styles from "./ledger.module.css";
import { useLedger } from "@/contexts/LedgerContext";
import { ProjectCopilot } from "@/components/ProjectCopilot";
import { useProjectCopilot } from "@/contexts/ProjectCopilotContext";
import { listProjectFilesAction, deleteFileAssetAction, uploadStudyFileAction } from "@/app/actions/files";
import type { FileAsset } from "@/types/files";
import type { Study, StudyDetails, TriageDecision } from "@/types/ledger";
import { validateStudyFile } from "@/lib/fileValidation";

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const RAIL_WIDTH = 44;

export default function LedgerPage() {
    const { id } = useParams<{ id: string }>();
    const { getProjectById } = useProjects();
    const { getStudiesByProject, updateStudies, updateSingleStudy } = useLedger();
    const { isCollapsed, panelWidth, setPanelWidth } = useProjectCopilot();

    const project = id ? getProjectById(id) : undefined;
    const studies = useMemo(() => (id ? getStudiesByProject(id) : []), [id, getStudiesByProject]);
    const studyIds = useMemo(() => new Set(studies.map((s) => s.id)), [studies]);

    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isSelectMode, setIsSelectMode] = useState(false);
    const [isAdding, setIsAdding] = useState(false);
    const [newStudy, setNewStudy] = useState({
        title: "",
        authors: "",
        year: new Date().getFullYear().toString(),
        status: "pending" as Study["status"],
        quality: "-" as Study["quality"],
    });
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

    // Triage counts
    const triageCounts = useMemo(() => {
        let keep = 0, exclude = 0, maybe = 0, pending = 0;
        for (const s of studies) {
            const decision = s.details?.triageDecision;
            if (decision === "keep") keep++;
            else if (decision === "exclude") exclude++;
            else if (decision === "maybe") maybe++;
            else pending++;
        }
        return { keep, exclude, maybe, pending };
    }, [studies]);

    // Study files panel state
    const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);
    const [studyFiles, setStudyFiles] = useState<FileAsset[]>([]);
    const [, setIsLoadingFiles] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const importInputRef = useRef<HTMLInputElement | null>(null);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    // Toggle select mode
    const toggleSelectMode = () => {
        if (isSelectMode) {
            setSelectedIds([]);
        }
        setIsSelectMode(!isSelectMode);
    };

    const createStudyId = () => {
        if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
            return crypto.randomUUID();
        }
        return `study-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    };

    const resetNewStudy = () =>
        setNewStudy({
            title: "",
            authors: "",
            year: new Date().getFullYear().toString(),
            status: "pending",
            quality: "-",
        });

    const loadStudyFiles = useCallback(async (studyId: string) => {
        if (!id) return;
        setIsLoadingFiles(true);
        try {
            const allFiles = await listProjectFilesAction(id);
            setStudyFiles(allFiles.filter((f) => f.studyId === studyId));
        } catch (err) {
            console.error("Failed to load study files", err);
            setStudyFiles([]);
        } finally {
            setIsLoadingFiles(false);
        }
    }, [id]);

    const handleOpenStudyFiles = useCallback((study: Study) => {
        setSelectedStudy(study);
        loadStudyFiles(study.id);
    }, [loadStudyFiles]);

    const handleCloseStudyFiles = useCallback(() => {
        setSelectedStudy(null);
        setStudyFiles([]);
    }, []);

    const handleUploadFile = useCallback(async (file: File) => {
        if (!id || !selectedStudy) return;
        const formData = new FormData();
        formData.append("file", file);
        await uploadStudyFileAction(id, selectedStudy.id, formData);
        await loadStudyFiles(selectedStudy.id);
    }, [id, selectedStudy, loadStudyFiles]);

    const handleDeleteFile = useCallback(async (fileId: string) => {
        if (!id || !selectedStudy) return;
        await deleteFileAssetAction(id, fileId);
        await loadStudyFiles(selectedStudy.id);
    }, [id, selectedStudy, loadStudyFiles]);

    const handleImportClick = () => {
        importInputRef.current?.click();
    };

    const handleImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!id) return;
        const file = e.target.files?.[0];
        if (!file) return;
        const validationError = validateStudyFile(file);
        if (validationError) {
            window.alert(validationError);
            if (importInputRef.current) importInputRef.current.value = "";
            return;
        }
        setIsImporting(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const baseTitle = file.name.replace(/\.[^/.]+$/, "");
            const newEntry: Study = {
                id: createStudyId(),
                title: baseTitle || "Untitled Study",
                authors: "Unknown",
                year: new Date().getFullYear(),
                status: "pending",
                quality: "-",
            };
            await updateStudies(id, [...studies, newEntry]);
            await uploadStudyFileAction(id, newEntry.id, formData);
            // Navigate to the new study's detail page
            window.location.href = `/project/${id}/ledger/${newEntry.id}`;
        } catch (err) {
            window.alert(err instanceof Error ? err.message : "Import failed");
            setIsImporting(false);
            if (importInputRef.current) importInputRef.current.value = "";
        }
    };

    // Triage handler
    const handleTriage = useCallback(async (studyId: string, decision: TriageDecision) => {
        if (!id) return;
        try {
            await updateSingleStudy(id, studyId, {
                details: {
                    ...studies.find(s => s.id === studyId)?.details,
                    triageDecision: decision,
                    triageDate: new Date().toISOString(),
                },
            });
        } catch (err) {
            console.error("Failed to update triage decision", err);
        }
    }, [id, updateSingleStudy, studies]);

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
        updateStudies(id, studies.filter((study) => study.id !== studyId)).catch(() => undefined);
    };

    const handleBulkDelete = () => {
        if (!id || !hasSelection) return;
        const confirmed = window.confirm(`Delete ${validSelectedIds.length} selected studies?`);
        if (!confirmed) return;
        updateStudies(id, studies.filter((study) => !selectedSet.has(study.id))).catch(() => undefined);
        setSelectedIds([]);
    };

    const handleAddStudy = async () => {
        if (!id) return;
        const title = newStudy.title.trim() || "Untitled Study";
        const authors = newStudy.authors.trim() || "Unknown";
        const year = Number.parseInt(newStudy.year, 10);
        const safeYear = Number.isFinite(year) ? year : new Date().getFullYear();
        const study: Study = {
            id: createStudyId(),
            title,
            authors,
            year: safeYear,
            status: newStudy.status,
            quality: newStudy.quality,
        };
        try {
            await updateStudies(id, [...studies, study]);
            setIsAdding(false);
            resetNewStudy();
        } catch (err) {
            window.alert(err instanceof Error ? err.message : "Failed to add study");
        }
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
                                    <button
                                        className={`header-btn ${isSelectMode ? "header-btn-active" : ""}`}
                                        onClick={toggleSelectMode}
                                    >
                                        <span className="material-icons-round">{isSelectMode ? "close" : "checklist"}</span>
                                        {isSelectMode ? "Cancel" : "Select"}
                                    </button>
                                    {hasSelection && isSelectMode ? (
                                        <button className="header-btn header-btn-danger" onClick={handleBulkDelete}>
                                            <span className="material-icons-round">delete</span>
                                            Delete {validSelectedIds.length}
                                        </button>
                                    ) : null}
                                    <button className="header-btn" onClick={async () => {
                                        if (!id) return;
                                        const newEntry: Study = {
                                            id: createStudyId(),
                                            title: "New Study",
                                            authors: "",
                                            year: new Date().getFullYear(),
                                            status: "pending",
                                            quality: "-",
                                        };
                                        await updateStudies(id, [...studies, newEntry]);
                                        window.location.href = `/project/${id}/ledger/${newEntry.id}`;
                                    }}>
                                        <span className="material-icons-round">add</span>
                                        Add Study
                                    </button>
                                    <button className="header-btn" onClick={handleImportClick} disabled={isImporting}>
                                        <span className="material-icons-round">upload_file</span>
                                        {isImporting ? "Importing..." : "Import PDF"}
                                    </button>
                                </div>
                            </header>
                            <input
                                ref={importInputRef}
                                type="file"
                                accept=".pdf,application/pdf"
                                style={{ display: "none" }}
                                onChange={handleImportChange}
                            />

                            <div className={styles.statsRow}>
                                <div className={styles.statChip}>
                                    <span className="material-icons-round">description</span>
                                    <span>{studies.length} total</span>
                                </div>
                                <div className={styles.statChip} style={{ color: "var(--status-ready-text)" }}>
                                    <span className="material-icons-round">check_circle</span>
                                    <span>{triageCounts.keep} kept</span>
                                </div>
                                <div className={styles.statChip} style={{ color: "#c0392b" }}>
                                    <span className="material-icons-round">cancel</span>
                                    <span>{triageCounts.exclude} excluded</span>
                                </div>
                                <div className={styles.statChip} style={{ color: "var(--accent-tertiary)" }}>
                                    <span className="material-icons-round">help_outline</span>
                                    <span>{triageCounts.maybe} maybe</span>
                                </div>
                                <div className={styles.statChip}>
                                    <span className="material-icons-round">pending</span>
                                    <span>{triageCounts.pending} untriaged</span>
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
                                            <th className={styles.expandCell}></th>
                                            {isSelectMode && (
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
                                            )}
                                            <th>Study</th>
                                            <th>Authors</th>
                                            <th>Year</th>
                                            <th>Status</th>
                                            <th>Quality</th>
                                            <th>Triage</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {isAdding ? (
                                            <tr className={styles.addRow}>
                                                <td className={styles.expandCell}></td>
                                                {isSelectMode && <td className={styles.selectCell}></td>}
                                                <td>
                                                    <input
                                                        className={styles.inputField}
                                                        placeholder="Study title"
                                                        value={newStudy.title}
                                                        onChange={(e) => setNewStudy((prev) => ({ ...prev, title: e.target.value }))}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        className={styles.inputField}
                                                        placeholder="Authors"
                                                        value={newStudy.authors}
                                                        onChange={(e) => setNewStudy((prev) => ({ ...prev, authors: e.target.value }))}
                                                    />
                                                </td>
                                                <td>
                                                    <input
                                                        className={styles.inputField}
                                                        type="number"
                                                        placeholder="Year"
                                                        value={newStudy.year}
                                                        onChange={(e) => setNewStudy((prev) => ({ ...prev, year: e.target.value }))}
                                                    />
                                                </td>
                                                <td>
                                                    <select
                                                        className={styles.inputField}
                                                        value={newStudy.status}
                                                        onChange={(e) =>
                                                            setNewStudy((prev) => ({
                                                                ...prev,
                                                                status: e.target.value as Study["status"],
                                                            }))
                                                        }
                                                    >
                                                        <option value="pending">Pending</option>
                                                        <option value="extracted">Extracted</option>
                                                    </select>
                                                </td>
                                                <td>
                                                    <select
                                                        className={styles.inputField}
                                                        value={newStudy.quality}
                                                        onChange={(e) =>
                                                            setNewStudy((prev) => ({
                                                                ...prev,
                                                                quality: e.target.value as Study["quality"],
                                                            }))
                                                        }
                                                    >
                                                        <option value="-">-</option>
                                                        <option value="High">High</option>
                                                        <option value="Medium">Medium</option>
                                                        <option value="Low">Low</option>
                                                    </select>
                                                </td>
                                                <td>{/* Triage - empty for new study */}</td>
                                                <td>
                                                    <div className={styles.addActions}>
                                                        <button className={styles.addBtn} onClick={handleAddStudy}>
                                                            Save
                                                        </button>
                                                        <button
                                                            className={styles.cancelBtn}
                                                            onClick={() => {
                                                                setIsAdding(false);
                                                                resetNewStudy();
                                                            }}
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ) : null}
                                        {studies.map((study) => {
                                            const d: StudyDetails = study.details ?? {};
                                            const isExpanded = expandedIds.has(study.id);
                                            const toggleExpand = () => {
                                                setExpandedIds((prev) => {
                                                    const next = new Set(prev);
                                                    if (next.has(study.id)) next.delete(study.id);
                                                    else next.add(study.id);
                                                    return next;
                                                });
                                            };

                                            // Get one-sentence summary from abstract or AI summary
                                            const summaryText = d.aiSummary || d.abstract || "No summary available.";
                                            const oneSentence = summaryText.split(/[.!?](?:\s|$)/)[0] + ".";
                                            const displaySummary = oneSentence.length > 200 ? oneSentence.slice(0, 200) + "..." : oneSentence;

                                            const rowClass = `${selectedSet.has(study.id) ? styles.rowSelected : ""} ${isExpanded ? styles.rowExpanded : ""} ${styles.clickableRow}`.trim();

                                            const handleRowClick = (e: React.MouseEvent) => {
                                                // Don't navigate if clicking on interactive elements
                                                const target = e.target as HTMLElement;
                                                if (target.closest('button, input, a, [role="button"]')) return;
                                                window.location.href = `/project/${id}/ledger/${study.id}`;
                                            };

                                            return (
                                                <>
                                                    <tr key={study.id} className={rowClass} onClick={handleRowClick}>
                                                        <td className={styles.expandCell}>
                                                            <button
                                                                className={`${styles.expandBtn} ${isExpanded ? styles.expanded : ""}`}
                                                                onClick={(e) => { e.stopPropagation(); toggleExpand(); }}
                                                                aria-label={isExpanded ? "Collapse" : "Expand"}
                                                                aria-expanded={isExpanded}
                                                            >
                                                                <span className="material-icons-round">expand_more</span>
                                                            </button>
                                                        </td>
                                                        {isSelectMode && (
                                                            <td className={styles.selectCell}>
                                                                <input
                                                                    className={styles.selectCheckbox}
                                                                    type="checkbox"
                                                                    checked={selectedSet.has(study.id)}
                                                                    onChange={() => toggleStudySelection(study.id)}
                                                                    aria-label={`Select ${study.title}`}
                                                                />
                                                            </td>
                                                        )}
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
                                                            {d.triageDecision ? (
                                                                <span className={`${styles.triageBadge} ${
                                                                    d.triageDecision === "keep" ? styles.triageBadgeKeep :
                                                                    d.triageDecision === "exclude" ? styles.triageBadgeExclude :
                                                                    styles.triageBadgeMaybe
                                                                }`}>
                                                                    <span className="material-icons-round">
                                                                        {d.triageDecision === "keep" ? "check_circle" :
                                                                         d.triageDecision === "exclude" ? "cancel" : "help_outline"}
                                                                    </span>
                                                                    {d.triageDecision === "keep" ? "Keep" :
                                                                     d.triageDecision === "exclude" ? "Exclude" : "Maybe"}
                                                                </span>
                                                            ) : (
                                                                <span className={styles.triageBadge} style={{ opacity: 0.5 }}>—</span>
                                                            )}
                                                        </td>
                                                        <td>
                                                            <button
                                                                className={styles.actionBtn}
                                                                title="Manage Files"
                                                                onClick={() => handleOpenStudyFiles(study)}
                                                            >
                                                                <span className="material-icons-round">attach_file</span>
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
                                                    {isExpanded && (
                                                        <tr key={`${study.id}-details`} className={styles.expandedRow}>
                                                            <td colSpan={isSelectMode ? 9 : 8}>
                                                                <div className={styles.expandedContent}>
                                                                    <div className={styles.expandedSection}>
                                                                        <p className={styles.abstractText}>
                                                                            {displaySummary}
                                                                        </p>
                                                                    </div>

                                                                    {/* Triage Actions */}
                                                                    <div className={styles.triageActions}>
                                                                        <button
                                                                            className={`${styles.triageBtn} ${styles.triageBtnKeep} ${d.triageDecision === "keep" ? styles.active : ""}`}
                                                                            onClick={(e) => { e.stopPropagation(); handleTriage(study.id, "keep"); }}
                                                                        >
                                                                            <span className="material-icons-round">check_circle</span>
                                                                            Keep
                                                                        </button>
                                                                        <button
                                                                            className={`${styles.triageBtn} ${styles.triageBtnExclude} ${d.triageDecision === "exclude" ? styles.active : ""}`}
                                                                            onClick={(e) => { e.stopPropagation(); handleTriage(study.id, "exclude"); }}
                                                                        >
                                                                            <span className="material-icons-round">cancel</span>
                                                                            Exclude
                                                                        </button>
                                                                        <button
                                                                            className={`${styles.triageBtn} ${styles.triageBtnMaybe} ${d.triageDecision === "maybe" ? styles.active : ""}`}
                                                                            onClick={(e) => { e.stopPropagation(); handleTriage(study.id, "maybe"); }}
                                                                        >
                                                                            <span className="material-icons-round">help_outline</span>
                                                                            Maybe
                                                                        </button>
                                                                    </div>

                                                                    <div className={styles.expandedMeta}>
                                                                        {d.journal && (
                                                                            <span className={styles.metaChip}>
                                                                                <span className="material-icons-round">menu_book</span>
                                                                                {d.journal}
                                                                            </span>
                                                                        )}
                                                                        {d.studyType && (
                                                                            <span className={styles.metaChip}>
                                                                                <span className="material-icons-round">category</span>
                                                                                {d.studyType}
                                                                            </span>
                                                                        )}
                                                                        {d.doi && (
                                                                            <a
                                                                                href={`https://doi.org/${d.doi}`}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className={styles.metaChip}
                                                                            >
                                                                                <span className="material-icons-round">link</span>
                                                                                DOI
                                                                            </a>
                                                                        )}
                                                                        <Link href={`/project/${id}/ledger/${study.id}`} className={styles.viewDetailsLink}>
                                                                            View Full Details →
                                                                        </Link>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </>
                                            );
                                        })}
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

                {/* Study Files Side Panel */}
                {selectedStudy && (
                    <div className={styles.filesPanel}>
                        <StudyFilesPanel
                            projectId={id}
                            studyId={selectedStudy.id}
                            studyTitle={selectedStudy.title}
                            files={studyFiles}
                            onUpload={handleUploadFile}
                            onDelete={handleDeleteFile}
                            onClose={handleCloseStudyFiles}
                        />
                    </div>
                )}
            </div>
        </AppShell>
    );
}
