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
import { listStudyFilesAction, deleteFileAssetAction, uploadStudyFileAction } from "@/app/actions/files";
import { extractStudyFromPdfAction, deepAnalyzeStudyAction } from "@/app/actions/extraction";
import { getDraftAction } from "@/app/actions/drafts";
import { DRAFT_SECTIONS, DraftSectionId } from "@/types/draft";
import { loadDraftState, DraftState } from "@/lib/draftStorage";
import type { Study, StudyDetails } from "@/types/ledger";
import type { FileAsset } from "@/types/files";
import { AlertDialog } from "@/components/ConfirmDialog";
import styles from "./study.module.css";

// Build lookup for section labels
const SECTION_LABELS: Record<string, string> = {};
for (const section of DRAFT_SECTIONS) {
    SECTION_LABELS[section.key] = section.label;
}

type DraftBacklink = {
    sectionId: DraftSectionId;
    label: string;
};

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

    // Extraction state
    const [extractingFileId, setExtractingFileId] = useState<string | null>(null);
    const [extractError, setExtractError] = useState<string | null>(null);

    // Deep analysis state
    const [isDeepAnalyzing, setIsDeepAnalyzing] = useState(false);
    const [deepAnalysisError, setDeepAnalysisError] = useState<string | null>(null);

    // Draft backlinks state
    const [draftBacklinks, setDraftBacklinks] = useState<DraftBacklink[]>([]);

    // Collapsible abstract
    const [abstractOpen, setAbstractOpen] = useState(false);

    // Error display state
    const [alertMsg, setAlertMsg] = useState<string | null>(null);

    // Keep a stable ref so the effect doesn't re-fire when ledgerMap changes
    const getStudyByIdRef = useRef(getStudyById);
    useEffect(() => { getStudyByIdRef.current = getStudyById; }, [getStudyById]);

    // Load study
    useEffect(() => {
        if (!id || !studyId) return;
        let active = true;
        setIsLoading(true);
        getStudyByIdRef.current(id, studyId).then((s) => {
            if (active) {
                setStudy(s);
                setIsLoading(false);
            }
        });
        return () => { active = false; };
    }, [id, studyId]);

    // Load files
    const loadFiles = useCallback(async () => {
        if (!id || !studyId) return;
        try {
            const files = await listStudyFilesAction(id, studyId);
            setStudyFiles(files);
        } catch (err) {
            console.error("Failed to load files", err);
            setAlertMsg("Failed to load study files.");
        }
    }, [id, studyId]);

    useEffect(() => {
        loadFiles();
    }, [loadFiles]);

    // Load draft backlinks (sections that cite this study)
    useEffect(() => {
        if (!id || !studyId) return;
        let active = true;

        const loadBacklinks = async () => {
            try {
                // Try to get draft from backend first, fallback to localStorage
                let draft: DraftState | null = null;
                try {
                    draft = await getDraftAction(id);
                } catch {
                    draft = loadDraftState(id);
                }

                if (!draft || !active) return;

                // Find all sections that reference this study
                const backlinks: DraftBacklink[] = [];
                for (const [sectionId, studyIds] of Object.entries(draft.ledgerBySection)) {
                    if (studyIds.includes(studyId)) {
                        // Get label from base sections or custom sections
                        const label = SECTION_LABELS[sectionId] || draft.customSections[sectionId]?.label || sectionId;
                        backlinks.push({ sectionId, label });
                    }
                }

                setDraftBacklinks(backlinks);
            } catch (err) {
                console.error("Failed to load draft backlinks", err);
            }
        };

        loadBacklinks();
        return () => { active = false; };
    }, [id, studyId]);

    // Handle PDF extraction
    const handleExtract = useCallback(async (fileId: string) => {
        if (!id || !studyId) return;
        setExtractingFileId(fileId);
        setExtractError(null);
        try {
            const result = await extractStudyFromPdfAction(id, studyId, fileId);
            if (result.success && result.study) {
                setStudy(result.study);
            } else {
                setExtractError(result.error || "Extraction failed");
            }
        } catch (err) {
            setExtractError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setExtractingFileId(null);
        }
    }, [id, studyId]);

    // Handle deep analysis (Stage 2)
    const handleDeepAnalysis = useCallback(async (fileId: string) => {
        if (!id || !studyId) return;
        setIsDeepAnalyzing(true);
        setDeepAnalysisError(null);
        try {
            const result = await deepAnalyzeStudyAction(id, studyId, fileId);
            if (result.success && result.study) {
                setStudy(result.study);
            } else {
                setDeepAnalysisError(result.error || "Deep analysis failed");
            }
        } catch (err) {
            setDeepAnalysisError(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setIsDeepAnalyzing(false);
        }
    }, [id, studyId]);

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
            setAlertMsg("Failed to save changes. Please try again.");
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
    const pdfFile = useMemo(() => studyFiles.find((f) => f.mimeType === "application/pdf"), [studyFiles]);

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

                            {/* Extraction Progress Banner (Stage 1) */}
                            {extractingFileId && (
                                <div className={styles.extractionBanner}>
                                    <div className={styles.extractionBannerContent}>
                                        <span className={`material-icons-round ${styles.extractionBannerIcon}`}>auto_awesome</span>
                                        <div>
                                            <strong>Extracting study data from PDF...</strong>
                                            <p>Reading title, abstract, authors, and more</p>
                                        </div>
                                    </div>
                                    <div className={styles.extractionProgress}>
                                        <div className={styles.extractionProgressFill} />
                                    </div>
                                </div>
                            )}

                            {/* Deep Analysis Progress Banner (Stage 2) */}
                            {isDeepAnalyzing && (
                                <div className={styles.extractionBanner}>
                                    <div className={styles.extractionBannerContent}>
                                        <span className={`material-icons-round ${styles.extractionBannerIcon}`}>psychology</span>
                                        <div>
                                            <strong>Running deep analysis...</strong>
                                            <p>Generating AI summary, study type, keywords, and quality assessment</p>
                                        </div>
                                    </div>
                                    <div className={styles.extractionProgress}>
                                        <div className={styles.extractionProgressFill} />
                                    </div>
                                </div>
                            )}

                            {/* Extraction Error Banner */}
                            {extractError && !extractingFileId && (
                                <div className={styles.extractionError}>
                                    <span className="material-icons-round">error_outline</span>
                                    <span>{extractError}</span>
                                    <button className={styles.extractionErrorDismiss} onClick={() => setExtractError(null)}>
                                        <span className="material-icons-round">close</span>
                                    </button>
                                </div>
                            )}

                            {/* Deep Analysis Error Banner */}
                            {deepAnalysisError && !isDeepAnalyzing && (
                                <div className={styles.extractionError}>
                                    <span className="material-icons-round">error_outline</span>
                                    <span>{deepAnalysisError}</span>
                                    <button className={styles.extractionErrorDismiss} onClick={() => setDeepAnalysisError(null)}>
                                        <span className="material-icons-round">close</span>
                                    </button>
                                </div>
                            )}

                            {/* Stage 1: Quick Extract prompt (only if pending and not auto-extracted) */}
                            {!extractingFileId && pdfFile && study.status === "pending" && (
                                <div className={styles.analyzePrompt}>
                                    <span className="material-icons-round">auto_awesome</span>
                                    <div className={styles.analyzePromptText}>
                                        <strong>PDF ready for extraction</strong>
                                        <p>Extract title, authors, abstract, and reference info</p>
                                    </div>
                                    {pdfFile.publicUrl && (
                                        <a
                                            href={pdfFile.publicUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={styles.analyzePromptBtn}
                                            style={{ background: "var(--bg-tertiary)", color: "var(--text-primary)" }}
                                        >
                                            <span className="material-icons-round">open_in_new</span>
                                            View PDF
                                        </a>
                                    )}
                                    <button
                                        className={styles.analyzePromptBtn}
                                        onClick={() => handleExtract(pdfFile.id)}
                                    >
                                        <span className="material-icons-round">psychology</span>
                                        Extract
                                    </button>
                                </div>
                            )}

                            {/* Stage 2: Deep Analysis prompt (extracted but not deeply analyzed) */}
                            {!isDeepAnalyzing && !extractingFileId && pdfFile && study.status === "extracted" && !d.deepAnalysisComplete && (
                                <div className={styles.analyzePrompt}>
                                    <span className="material-icons-round">psychology</span>
                                    <div className={styles.analyzePromptText}>
                                        <strong>Run Deep Analysis</strong>
                                        <p>Generate AI summary, study type, keywords, and quality assessment</p>
                                    </div>
                                    <button
                                        className={styles.analyzePromptBtn}
                                        onClick={() => handleDeepAnalysis(pdfFile.id)}
                                    >
                                        <span className="material-icons-round">auto_awesome</span>
                                        Analyze
                                    </button>
                                </div>
                            )}

                            {/* View PDF link (when study is already extracted) */}
                            {pdfFile?.publicUrl && study.status !== "pending" && !extractingFileId && (
                                <a
                                    href={pdfFile.publicUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={styles.pdfLink}
                                >
                                    <span className="material-icons-round">picture_as_pdf</span>
                                    <span>{pdfFile.filename}</span>
                                    <span className="material-icons-round" style={{ fontSize: 16, marginLeft: "auto" }}>open_in_new</span>
                                </a>
                            )}

                            {/* Quick Info */}
                            <StudyQuickInfo study={study} />

                            {/* Abstract */}
                            <section className={styles.section}>
                                <h2
                                    className={`${styles.sectionTitle} ${styles.sectionTitleCollapsible}`}
                                    onClick={() => !isEditing && setAbstractOpen((o) => !o)}
                                >
                                    <span className="material-icons-round">description</span>
                                    Abstract
                                    {!isEditing && (
                                        <span className={`material-icons-round ${styles.collapseChevron} ${abstractOpen ? styles.collapseChevronOpen : ""}`}>
                                            expand_more
                                        </span>
                                    )}
                                </h2>
                                {isEditing ? (
                                    <textarea
                                        className={styles.abstractTextarea}
                                        value={(editForm.details as StudyDetails)?.abstract ?? ""}
                                        onChange={(e) => updateEditDetails("abstract", e.target.value)}
                                        placeholder="Enter abstract..."
                                        rows={6}
                                    />
                                ) : abstractOpen ? (
                                    d.abstract ? (
                                        <p className={styles.abstractText}>{d.abstract}</p>
                                    ) : (
                                        <p className={styles.emptyText}>No abstract available</p>
                                    )
                                ) : null}
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

                            {/* Keywords */}
                            {d.keywords && d.keywords.length > 0 && (
                                <section className={styles.section}>
                                    <h2 className={styles.sectionTitle}>
                                        <span className="material-icons-round">label</span>
                                        Keywords
                                    </h2>
                                    <div className={styles.keywordsList}>
                                        {d.keywords.map((kw) => (
                                            <span key={kw} className={styles.keywordChip}>{kw}</span>
                                        ))}
                                    </div>
                                </section>
                            )}

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
                                {d.qualityRationale && (
                                    <p className={styles.qualityRationale}>{d.qualityRationale}</p>
                                )}
                            </section>

                            {/* Draft Backlinks */}
                            <section className={styles.section}>
                                <h2 className={styles.sectionTitle}>
                                    <span className="material-icons-round">format_quote</span>
                                    Cited In Draft
                                </h2>
                                {draftBacklinks.length > 0 ? (
                                    <div className={styles.backlinksList}>
                                        {draftBacklinks.map((backlink) => (
                                            <Link
                                                key={backlink.sectionId}
                                                href={`/project/${id}/draft?section=${backlink.sectionId}`}
                                                className={styles.backlinkItem}
                                            >
                                                <span className="material-icons-round">edit_note</span>
                                                <span>{backlink.label}</span>
                                                <span className="material-icons-round">arrow_forward</span>
                                            </Link>
                                        ))}
                                    </div>
                                ) : (
                                    <div className={styles.placeholder}>
                                        <span className="material-icons-round">link_off</span>
                                        <p>Not cited in any draft sections yet</p>
                                        <Link href={`/project/${id}/draft`} className={styles.placeholderLink}>
                                            Go to Draft
                                        </Link>
                                    </div>
                                )}
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

                {/* Files Popup */}
                {showFilesPanel && (
                    <>
                        <div className={styles.filesPopupBackdrop} onClick={() => setShowFilesPanel(false)} />
                        <div className={styles.filesPopup}>
                            <StudyFilesPanel
                                projectId={id}
                                studyId={studyId}
                                studyTitle={study.title}
                                files={studyFiles}
                                onUpload={handleUploadFile}
                                onDelete={handleDeleteFile}
                                onClose={() => setShowFilesPanel(false)}
                                onExtract={handleExtract}
                                extractingFileId={extractingFileId ?? undefined}
                            />
                        </div>
                    </>
                )}
            </div>

            <AlertDialog
                isOpen={alertMsg !== null}
                title="Error"
                message={alertMsg ?? ""}
                onClose={() => setAlertMsg(null)}
            />
        </AppShell>
    );
}
