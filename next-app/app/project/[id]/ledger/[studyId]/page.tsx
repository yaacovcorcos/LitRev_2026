"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useProjects } from "@/contexts/ProjectsContext";
import { EmptyState, EmptyStateSkeleton } from "@/components/ui/EmptyState";
import { useProjectShell } from "@/contexts/ProjectShellContext";
import { useLedger } from "@/contexts/LedgerContext";
import { BaseBackButton } from "@/components/BaseBackButton";
import { ProjectPageLayout } from "@/components/project/ProjectPageLayout";
import { CitationBlock } from "@/components/CitationBlock";
import { StudyFilesPanel } from "@/components/StudyFilesPanel";
import { listStudyFilesAction, deleteFileAssetAction, uploadStudyFileAction } from "@/app/actions/files";
import {
    deepAnalyzeStudyAction,
    extractStudyFromPdfAction,
    prioritizeStudyProcessingAction,
} from "@/app/actions/extraction";
import { getDraftAction } from "@/app/actions/drafts";
import { DRAFT_SECTIONS, DraftSectionId } from "@/types/draft";
import { loadDraftState, DraftState } from "@/lib/draft-storage";
import type { Study, StudyDetails, StudyProcessingPhase, StudyRelevance } from "@/types/ledger";
import type { FileAsset } from "@/types/files";
import { AlertDialog } from "@/components/ConfirmDialog";
import { compileDraftCitations, getCitedSectionIdsByStudyId } from "@/lib/citation-compiler";
import { isMobileLedgerV2Enabled } from "@/lib/mobile/feature-flags";
import { getStudyProcessingStatusView, isStudyProcessingActive } from "@/lib/study-processing-ui";
import { useStudyProcessingSync } from "@/hooks/useStudyProcessingSync";
import { normalizeRouteParam } from "@/lib/route-params";
import { buildLedgerRouteHref, readLedgerRouteState } from "@/lib/durable-route-state";
import { LedgerStudySnapshot } from "@/app/project/[id]/ledger/LedgerStudySnapshot";
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

const RELEVANCE_COMPONENT_LABELS: Record<keyof NonNullable<StudyRelevance["components"]>, string> = {
    protocolFit: "Protocol Fit",
    designFit: "Design Fit",
    outcomeDirectness: "Outcome Directness",
    applicability: "Applicability",
    completeness: "Completeness",
};
const RELEVANCE_COMPONENT_KEYS = Object.keys(RELEVANCE_COMPONENT_LABELS) as Array<keyof NonNullable<StudyRelevance["components"]>>;

export default function StudyDetailPage() {
    const params = useParams<{ id: string | string[]; studyId: string | string[] }>();
    const searchParams = useSearchParams();
    const id = normalizeRouteParam(params.id);
    const studyId = normalizeRouteParam(params.studyId);
    const mobileLedgerV2Enabled = isMobileLedgerV2Enabled();
    const { getProjectById, isLoadingProjects, projectsError } = useProjects();
    const { getStudyById, updateSingleStudy } = useLedger();
    const { isEmbeddedInProjectShell } = useProjectShell();

    const project = id ? getProjectById(id) : undefined;
    const ledgerStudyMainClassName = `${styles.appMainOverride} ${mobileLedgerV2Enabled ? styles.appMainOverrideMobileV2 : ""}`;
    const ledgerRouteState = useMemo(() => readLedgerRouteState(searchParams), [searchParams]);
    const backToLedgerHref = id
        ? buildLedgerRouteHref(
            id,
            { studyId: null, criteriaFilter: ledgerRouteState.criteriaFilter },
            searchParams,
        )
        : "/";
    const [study, setStudy] = useState<Study | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isEditing, setIsEditing] = useState(false);
    const [editForm, setEditForm] = useState<Partial<Study>>({});

    // Files state
    const [studyFiles, setStudyFiles] = useState<FileAsset[]>([]);
    const [showFilesPanel, setShowFilesPanel] = useState(false);

    const [submittingPhase, setSubmittingPhase] = useState<StudyProcessingPhase | null>(null);

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
        const loadStudy = async () => {
            try {
                const nextStudy = await getStudyByIdRef.current(id, studyId);
                if (active) {
                    setStudy(nextStudy);
                }
            } finally {
                if (active) {
                    setIsLoading(false);
                }
            }
        };
        void loadStudy();
        return () => { active = false; };
    }, [id, studyId]);

    // Refresh current study if ledger mutations happen elsewhere (copilot artifact apply, AI page, etc.)
    useEffect(() => {
        if (!id || !studyId) return;
        const handler = (e: Event) => {
            const projectId = (e as CustomEvent).detail?.projectId as string | undefined;
            if (!projectId || projectId !== id) return;
            const refreshStudy = async () => {
                try {
                    const nextStudy = await getStudyByIdRef.current(id, studyId);
                    setStudy(nextStudy);
                } catch (err) {
                    console.error("Failed to refresh study after ledger update", err);
                }
            };
            void refreshStudy();
        };
        window.addEventListener("litrev:ledger-changed", handler);
        return () => window.removeEventListener("litrev:ledger-changed", handler);
    }, [id, studyId]);

    // Load files
    const loadFiles = useCallback(async () => {
        if (!id || !studyId) return;
        try {
            const result = await listStudyFilesAction(id, studyId);
            if (!result.success) { setAlertMsg("Failed to load study files."); return; }
            setStudyFiles(result.data);
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
                    const draftResult = await getDraftAction(id);
                    draft = draftResult.success ? draftResult.data : null;
                } catch {
                    draft = loadDraftState(id);
                }

                if (!draft || !active) return;

                const compiled = compileDraftCitations({
                    contentBySection: draft.contentBySection,
                    sectionOrder: draft.sectionOrder,
                    includeNumberInNodes: false,
                });
                const sectionIds = getCitedSectionIdsByStudyId({
                    citations: compiled.citations,
                    studyId,
                });
                const order = new Map(draft.sectionOrder.map((sectionId, index) => [sectionId, index]));
                const backlinks: DraftBacklink[] = sectionIds
                    .slice()
                    .sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER))
                    .map((sectionId) => {
                        const label = SECTION_LABELS[sectionId] || draft.customSections[sectionId]?.label || sectionId;
                        return { sectionId, label };
                    });

                setDraftBacklinks(backlinks);
            } catch (err) {
                console.error("Failed to load draft backlinks", err);
            }
        };

        loadBacklinks();
        return () => { active = false; };
    }, [id, studyId]);

    useStudyProcessingSync({
        projectId: id,
        studyIds: study ? [study.id] : [],
        enabled: Boolean(study && isStudyProcessingActive(study)),
        intervalMs: 2000,
        onStudiesReceived: (updatedStudies) => {
            const updatedStudy = updatedStudies[0];
            if (updatedStudy) {
                setStudy(updatedStudy);
            }
        },
    });

    const prioritizedJobKeyRef = useRef<string | null>(null);

    useEffect(() => {
        if (!id || !study?.processing?.currentPhase || !isStudyProcessingActive(study)) return;
        const phase = study.processing.currentPhase;
        const phaseSnapshot =
            phase === "deep_analysis"
                ? study.processing.byPhase.deepAnalysis
                : study.processing.byPhase.quickExtract;
        if (phaseSnapshot.priority !== "background") return;

        const requestKey = `${study.id}:${phase}:${phaseSnapshot.state}:${phaseSnapshot.priority}`;
        if (prioritizedJobKeyRef.current === requestKey) return;
        prioritizedJobKeyRef.current = requestKey;

        const prioritize = async () => {
            const result = await prioritizeStudyProcessingAction(id, study.id, phase);
            if (result.success && result.study) {
                setStudy(result.study);
            }
        };

        void prioritize();
    }, [id, study]);

    // Handle PDF extraction
    const handleExtract = useCallback(async (fileId: string) => {
        if (!id || !studyId) return;
        setSubmittingPhase("quick_extract");
        try {
            const result = await extractStudyFromPdfAction(id, studyId, fileId);
            if (result.success && result.study) {
                setStudy(result.study);
            } else {
                setAlertMsg(result.error || "Unable to queue extraction.");
            }
        } catch (err) {
            setAlertMsg(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setSubmittingPhase(null);
        }
    }, [id, studyId]);

    // Handle deep analysis (Stage 2)
    const handleDeepAnalysis = useCallback(async (fileId: string) => {
        if (!id || !studyId) return;
        setSubmittingPhase("deep_analysis");
        try {
            const result = await deepAnalyzeStudyAction(id, studyId, fileId);
            if (result.success && result.study) {
                setStudy(result.study);
            } else {
                setAlertMsg(result.error || "Unable to queue deep analysis.");
            }
        } catch (err) {
            setAlertMsg(err instanceof Error ? err.message : "Unknown error");
        } finally {
            setSubmittingPhase(null);
        }
    }, [id, studyId]);

    const handleUploadFile = useCallback(async (file: File) => {
        if (!id || !studyId) return;
        const formData = new FormData();
        formData.append("file", file);
        const uploadResult = await uploadStudyFileAction(id, studyId, formData);
        if (!uploadResult.success) {
            throw new Error(uploadResult.error || "Upload failed");
        }
        await loadFiles();
    }, [id, studyId, loadFiles]);

    const handleDeleteFile = useCallback(async (fileId: string) => {
        if (!id) return;
        const delResult = await deleteFileAssetAction(id, fileId);
        if (!delResult.success) { console.error("Delete failed:", delResult.error); return; }
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
        const updates: Partial<Study> = { ...editForm };
        const details = (updates.details as StudyDetails | undefined) ?? undefined;
        const relevance = (details?.relevance as StudyRelevance | undefined) ?? undefined;
        if (relevance) {
            const rationale = typeof relevance.rationale === "string" ? relevance.rationale.trim() : "";
            if (!rationale) {
                setAlertMsg("Relevance rationale is required.");
                return;
            }
            if (!Number.isFinite(relevance.score)) {
                setAlertMsg("Relevance score must be a number between 0 and 100.");
                return;
            }
            const normalizedComponents: NonNullable<StudyRelevance["components"]> = {};
            for (const key of RELEVANCE_COMPONENT_KEYS) {
                const raw = relevance.components?.[key];
                if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
                normalizedComponents[key] = Math.max(0, Math.min(100, raw));
            }
            updates.details = {
                ...(details ?? {}),
                relevance: {
                    ...relevance,
                    score: Math.max(0, Math.min(100, relevance.score)),
                    rationale,
                    components: Object.keys(normalizedComponents).length > 0 ? normalizedComponents : undefined,
                },
            };
        }
        try {
            const updated = await updateSingleStudy(id, studyId, updates);
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

    const d: StudyDetails = study?.details ?? {};
    const editRelevance = ((editForm.details as StudyDetails | undefined)?.relevance as StudyRelevance | undefined) ?? undefined;
    const relevance = (d.relevance as StudyRelevance | undefined) ?? undefined;
    const relevanceBandLabel = relevance ? relevance.band.charAt(0).toUpperCase() + relevance.band.slice(1) : "Not scored";
    const updateEditRelevance = (patch: Partial<StudyRelevance>) => {
        setEditForm((prev) => {
            const details = (prev.details as StudyDetails) ?? {};
            const base: StudyRelevance = (details.relevance as StudyRelevance | undefined) ?? {
                score: 50,
                band: "moderate",
                rationale: "Needs assessment.",
            };
            return {
                ...prev,
                details: {
                    ...details,
                    relevance: {
                        ...base,
                        ...patch,
                    },
                },
            };
        });
    };
    const updateEditRelevanceComponent = (
        key: keyof NonNullable<StudyRelevance["components"]>,
        value: number | undefined
    ) => {
        setEditForm((prev) => {
            const details = (prev.details as StudyDetails) ?? {};
            const base: StudyRelevance = (details.relevance as StudyRelevance | undefined) ?? {
                score: 50,
                band: "moderate",
                rationale: "Needs assessment.",
            };
            const components = { ...(base.components ?? {}), [key]: value };
            return {
                ...prev,
                details: {
                    ...details,
                    relevance: {
                        ...base,
                        components,
                    },
                },
            };
        });
    };
    const pdfFile = useMemo(() => studyFiles.find((f) => f.mimeType === "application/pdf"), [studyFiles]);
    const processingStatus = study ? getStudyProcessingStatusView(study) : null;

    if (isLoadingProjects) {
        return (
            <ProjectPageLayout mainClassName={ledgerStudyMainClassName}>
                <EmptyStateSkeleton className={styles.notFound} />
            </ProjectPageLayout>
        );
    }

    if (projectsError) {
        return (
            <ProjectPageLayout mainClassName={ledgerStudyMainClassName}>
                <EmptyState
                    variant="error"
                    icon="cloud_off"
                    title="Unable to load project"
                    description={projectsError}
                    primaryAction={{ label: "Retry", onClick: () => window.location.reload() }}
                    secondaryAction={{ label: "Back to Dashboard", href: "/" }}
                    className={styles.notFound}
                />
            </ProjectPageLayout>
        );
    }

    if (!id || !project) {
        return (
            <ProjectPageLayout mainClassName={ledgerStudyMainClassName}>
                <EmptyState
                    variant="error"
                    icon="folder_off"
                    title="Project not found"
                    description="This project may have been deleted or you don't have access."
                    primaryAction={{ label: "Back to Dashboard", href: "/" }}
                    className={styles.notFound}
                />
            </ProjectPageLayout>
        );
    }

    if (isLoading) {
        return (
            <ProjectPageLayout mainClassName={ledgerStudyMainClassName}>
                <EmptyStateSkeleton className={styles.notFound} />
            </ProjectPageLayout>
        );
    }

    if (!studyId || !study) {
        return (
            <ProjectPageLayout mainClassName={ledgerStudyMainClassName}>
                <EmptyState
                    variant="error"
                    icon="article"
                    title="Study not found"
                    description="This study may have been removed from the ledger."
                    primaryAction={{ label: "Back to Ledger", href: backToLedgerHref }}
                    className={styles.notFound}
                />
            </ProjectPageLayout>
        );
    }

    // Shared content: main pane with header, sections, files popup, alert
    const mainPane = (
        <div className={styles.mainContent}>
            <div className={styles.layout}>
                {/* Header */}
                <header className={styles.header}>
                                <div className={styles.headerText}>
                                    <div style={{ display: "flex", alignItems: "center" }}>
                                        {!isEmbeddedInProjectShell && <BaseBackButton href={backToLedgerHref} label="Back to ledger" />}
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

                            <LedgerStudySnapshot
                                study={study}
                                mode="full"
                                showSummary={false}
                                showProcessingDescription={false}
                            />

                            {pdfFile && processingStatus && (
                                <section className={styles.processingCard}>
                                    <div className={styles.processingCardHeader}>
                                        <div>
                                            <span className={styles.processingEyebrow}>PDF Processing</span>
                                            <h2 className={styles.processingTitle}>{processingStatus.label}</h2>
                                        </div>
                                        {submittingPhase ? (
                                            <span className={styles.processingPulse}>Saving…</span>
                                        ) : null}
                                    </div>
                                    <p className={styles.processingDescription}>{processingStatus.description}</p>
                                    {processingStatus.isActive ? (
                                        <p className={styles.processingWaitCopy}>
                                            This PDF is being processed on the server. You can wait here or leave this page.
                                        </p>
                                    ) : null}
                                    <div className={styles.processingActions}>
                                        {pdfFile.downloadUrl || pdfFile.publicUrl ? (
                                            <a
                                                href={pdfFile.downloadUrl ?? pdfFile.publicUrl}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={styles.processingActionSecondary}
                                            >
                                                <span className="material-icons-round">open_in_new</span>
                                                View PDF
                                            </a>
                                        ) : null}
                                        {!processingStatus.isActive &&
                                        processingStatus.currentPhaseSnapshot.phase === "quick_extract" &&
                                        (study.processing?.nextAction === "extract" || processingStatus.canRetry) ? (
                                            <button
                                                className={styles.processingActionPrimary}
                                                onClick={() => handleExtract(pdfFile.id)}
                                                disabled={submittingPhase !== null}
                                            >
                                                <span className="material-icons-round">
                                                    {processingStatus.canRetry ? "refresh" : "auto_awesome"}
                                                </span>
                                                {processingStatus.canRetry ? "Retry extraction" : "Extract"}
                                            </button>
                                        ) : null}
                                        {!processingStatus.isActive &&
                                        study.processing?.nextAction === "analyze" ? (
                                            <button
                                                className={styles.processingActionPrimary}
                                                onClick={() => handleDeepAnalysis(pdfFile.id)}
                                                disabled={submittingPhase !== null}
                                            >
                                                <span className="material-icons-round">psychology</span>
                                                Analyze
                                            </button>
                                        ) : null}
                                        {!processingStatus.isActive &&
                                        processingStatus.currentPhaseSnapshot.phase === "deep_analysis" &&
                                        processingStatus.canRetry ? (
                                            <button
                                                className={styles.processingActionPrimary}
                                                onClick={() => handleDeepAnalysis(pdfFile.id)}
                                                disabled={submittingPhase !== null}
                                            >
                                                <span className="material-icons-round">refresh</span>
                                                Retry analysis
                                            </button>
                                        ) : null}
                                    </div>
                                </section>
                            )}
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

                            <section className={styles.section}>
                                <h2 className={styles.sectionTitle}>
                                    <span className="material-icons-round">insights</span>
                                    Relevance Assessment
                                </h2>
                                {isEditing ? (
                                    <div className={styles.relevanceEditor}>
                                        <label className={styles.relevanceField}>
                                            <span>Score (0-100)</span>
                                            <input
                                                type="number"
                                                min={0}
                                                max={100}
                                                value={editRelevance?.score ?? ""}
                                                onChange={(e) =>
                                                    updateEditRelevance({
                                                        score: Number.isFinite(e.target.valueAsNumber)
                                                            ? Math.max(0, Math.min(100, e.target.valueAsNumber))
                                                            : 0,
                                                    })
                                                }
                                            />
                                        </label>
                                        <label className={styles.relevanceField}>
                                            <span>Band</span>
                                            <select
                                                value={editRelevance?.band ?? "moderate"}
                                                onChange={(e) => updateEditRelevance({ band: e.target.value as StudyRelevance["band"] })}
                                            >
                                                <option value="high">High</option>
                                                <option value="moderate">Moderate</option>
                                                <option value="low">Low</option>
                                            </select>
                                        </label>
                                        <label className={styles.relevanceField}>
                                            <span>Rationale</span>
                                            <textarea
                                                rows={4}
                                                value={editRelevance?.rationale ?? ""}
                                                onChange={(e) => updateEditRelevance({ rationale: e.target.value })}
                                                placeholder="Short justification for relevance score"
                                                required
                                            />
                                        </label>
                                        <div className={styles.relevanceComponents}>
                                            {Object.entries(RELEVANCE_COMPONENT_LABELS).map(([key, label]) => (
                                                <label key={key} className={styles.relevanceField}>
                                                    <span>{label}</span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        max={100}
                                                        value={editRelevance?.components?.[key as keyof NonNullable<StudyRelevance["components"]>] ?? ""}
                                                        onChange={(e) =>
                                                            updateEditRelevanceComponent(
                                                                key as keyof NonNullable<StudyRelevance["components"]>,
                                                                Number.isFinite(e.target.valueAsNumber)
                                                                    ? Math.max(0, Math.min(100, e.target.valueAsNumber))
                                                                    : undefined
                                                            )
                                                        }
                                                    />
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ) : relevance ? (
                                    <div className={styles.relevanceDisplay}>
                                        <span className={`${styles.relevanceBadgeLarge} ${relevance.band === "high" ? styles.relevanceHigh : relevance.band === "moderate" ? styles.relevanceModerate : styles.relevanceLow}`}>
                                            {relevanceBandLabel} {typeof relevance.score === "number" ? `(${relevance.score})` : ""}
                                        </span>
                                        <p className={styles.relevanceRationale}>{relevance.rationale}</p>
                                        {relevance.components && (
                                            <div className={styles.relevanceComponentsReadOnly}>
                                                {Object.entries(relevance.components).map(([key, value]) =>
                                                    typeof value === "number" ? (
                                                        <span key={key} className={styles.relevanceComponentChip}>
                                                            {RELEVANCE_COMPONENT_LABELS[key as keyof NonNullable<StudyRelevance["components"]>]}: {value}
                                                        </span>
                                                    ) : null
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ) : (
                                    <p className={styles.emptyText}>No relevance score available.</p>
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
    );

    const filesPopup = showFilesPanel && id && studyId && (
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
                    extractingFileId={submittingPhase === "quick_extract" ? pdfFile?.id : undefined}
                    processingLabel={processingStatus?.isActive ? processingStatus.label : undefined}
                    processingDescription={processingStatus?.isActive ? processingStatus.description : undefined}
                    disableExtract={processingStatus?.isActive}
                />
            </div>
        </>
    );

    const alertDialog = (
        <AlertDialog
            isOpen={alertMsg !== null}
            title="Error"
            message={alertMsg ?? ""}
            onClose={() => setAlertMsg(null)}
        />
    );

    return (
        <ProjectPageLayout
            mainClassName={ledgerStudyMainClassName}
            copilot={{
                page: "study",
                studyId,
                contextDisplay: study.title,
                emptyState: {
                    icon: "psychology",
                    title: "Ask about this study",
                    description: "Get help understanding findings, methodology, or how this study relates to your review.",
                    suggestions: [
                        { label: "Summarize", prompt: "Summarize the key findings of this study" },
                        { label: "Strengths", prompt: "What are the strengths and limitations?" },
                        { label: "Compare", prompt: "How does this compare to other studies?" },
                    ],
                },
                inputPlaceholder: "Ask about this study\u2026",
                panelId: "study-copilot-panel",
            }}
        >
            {mainPane}
            {filesPopup}
            {alertDialog}
        </ProjectPageLayout>
    );
}
