"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useProjects } from "@/contexts/ProjectsContext";
import { EmptyState, EmptyStateSkeleton } from "@/components/ui/EmptyState";
import { useProjectShell } from "@/contexts/ProjectShellContext";
import { BaseBackButton } from "@/components/BaseBackButton";
import { StudyFilesPanel } from "@/components/StudyFilesPanel";
import styles from "./ledger.module.css";
import { useLedger } from "@/contexts/LedgerContext";
import { ProjectPageLayout } from "@/components/project/ProjectPageLayout";
import {
  listStudyFilesAction,
  deleteFileAssetAction,
  uploadStudyFileAction,
  importStudyWithPdfAction,
} from "@/app/actions/files";
import { extractStudyFromPdfAction } from "@/app/actions/extraction";
import { useProjectData } from "@/hooks/useProjectData";
import {
  evaluateCriteria,
  type CriteriaMatchResult,
} from "@/lib/criteriaMatching";
import { createDefaultProtocolData, type ProtocolData } from "@/types/protocol";
import type { FileAsset } from "@/types/files";
import type { Study } from "@/types/ledger";
import { validateStudyFile } from "@/lib/fileValidation";
import { ConfirmDialog, AlertDialog } from "@/components/ConfirmDialog";
import { DemoGuideCard } from "@/components/project/DemoGuideCard";
import { StudyRow } from "./StudyRow";
import { LedgerStatsBar } from "./LedgerStatsBar";
import { isMobileLedgerV2Enabled } from "@/lib/mobile/feature-flags";
import { useContextCaptureActions } from "@/hooks/useContextCaptureActions";
import { buildStudySetTarget } from "@/lib/context-capture/targets";
import {
  useLedgerActions,
  type LedgerConfirmDialogState,
} from "./useLedgerActions";

type CriteriaFilter =
  | "all"
  | "meets-criteria"
  | "fails-criteria"
  | "in-date-range"
  | "matching-design";

export default function LedgerPage() {
  const { id } = useParams<{ id: string }>();
  const mobileLedgerV2Enabled = isMobileLedgerV2Enabled();
  const { captureEnabled, runAction, sendToCopilot } = useContextCaptureActions();
  const { getProjectById, isLoadingProjects, projectsError } = useProjects();
  const { isEmbeddedInProjectShell } = useProjectShell();
  const {
    getStudiesByProject,
    addStudy,
    replaceStudyInCache,
    removeStudies,
    upsertNewStudy,
    updateSingleStudy,
  } = useLedger();

  const project = id ? getProjectById(id) : undefined;
  const studies = useMemo(
    () => (id ? getStudiesByProject(id) : []),
    [id, getStudiesByProject],
  );
  const extractedCount = studies.filter((s) => s.status === "extracted").length;
  const ledgerMainClassName = `${styles.appMainOverride} ${mobileLedgerV2Enabled ? styles.appMainOverrideMobileV2 : ""}`;

  // Study files panel state
  const [selectedStudy, setSelectedStudy] = useState<Study | null>(null);
  const [studyFiles, setStudyFiles] = useState<FileAsset[]>([]);
  const [, setIsLoadingFiles] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  // Dialog state (replaces window.alert / window.confirm)
  const [alertMsg, setAlertMsg] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] =
    useState<LedgerConfirmDialogState>(null);

  const {
    allSelected,
    expandedIds,
    hasSelection,
    isAdding,
    isSelectMode,
    newStudy,
    selectedSet,
    selectAllRef,
    validSelectedIds,
    handleAddStudy,
    handleBulkDelete,
    handleDeleteStudy,
    handleQuickAddStudy,
    handleTriage,
    resetNewStudy,
    setIsAdding,
    setNewStudy,
    toggleExpand,
    toggleSelectAll,
    toggleSelectMode,
    toggleStudySelection,
  } = useLedgerActions({
    projectId: id,
    studies,
    removeStudies,
    upsertNewStudy,
    updateSingleStudy,
    setAlertMsg,
    setConfirmDialog,
  });

  // Protocol & criteria filtering
  const { protocol: cachedProtocol, warmDomain } = useProjectData();
  const [protocol, setProtocol] = useState<ProtocolData>(
    createDefaultProtocolData,
  );
  const [criteriaFilter, setCriteriaFilter] = useState<CriteriaFilter>("all");

  // Load protocol data from preload cache
  useEffect(() => {
    if (cachedProtocol.state === "ready" && cachedProtocol.data) {
      setProtocol(cachedProtocol.data);
    } else if (cachedProtocol.state === "error") {
      setAlertMsg("Failed to load protocol criteria. Filtering may be unavailable.");
    } else if (cachedProtocol.state === "idle") {
      warmDomain("protocol");
    }
  }, [cachedProtocol, warmDomain]);

  // Compute criteria matches for all studies
  const studyCriteriaMap = useMemo(() => {
    const map = new Map<string, CriteriaMatchResult>();
    for (const study of studies) {
      map.set(study.id, evaluateCriteria(study, protocol));
    }
    return map;
  }, [studies, protocol]);

  // Criteria counts
  const criteriaCounts = useMemo(() => {
    let meetsCriteria = 0;
    let failsCriteria = 0;
    let inDateRange = 0;
    let matchingDesign = 0;
    for (const result of studyCriteriaMap.values()) {
      if (result.meetsAllCriteria) meetsCriteria++;
      else failsCriteria++;
      if (result.matchesYearRange) inDateRange++;
      if (result.matchesStudyDesign) matchingDesign++;
    }
    return { meetsCriteria, failsCriteria, inDateRange, matchingDesign };
  }, [studyCriteriaMap]);

  // Check if protocol has any criteria defined
  const hasProtocolCriteria = useMemo(() => {
    return !!(
      protocol.methodology.timeFrameStart ||
      protocol.methodology.timeFrameEnd ||
      protocol.methodology.studyDesigns.length > 0
    );
  }, [protocol]);

  // Filter studies based on criteria filter
  const filteredStudies = useMemo(() => {
    if (criteriaFilter === "all" || !hasProtocolCriteria) return studies;
    return studies.filter((study) => {
      const match = studyCriteriaMap.get(study.id);
      if (!match) return true;
      switch (criteriaFilter) {
        case "meets-criteria":
          return match.meetsAllCriteria;
        case "fails-criteria":
          return !match.meetsAllCriteria;
        case "in-date-range":
          return match.matchesYearRange;
        case "matching-design":
          return match.matchesStudyDesign;
        default:
          return true;
      }
    });
  }, [studies, criteriaFilter, studyCriteriaMap, hasProtocolCriteria]);

  const selectedStudies = useMemo(
    () => validSelectedIds
      .map((studyId) => studies.find((study) => study.id === studyId))
      .filter((study): study is Study => Boolean(study)),
    [studies, validSelectedIds],
  );

  const canUseStudySetActions = captureEnabled && validSelectedIds.length >= 2 && validSelectedIds.length <= 6;
  const studySetTarget = canUseStudySetActions
    ? buildStudySetTarget({
      projectId: id,
      studies: selectedStudies.map((study) => ({
        studyId: study.id,
        title: study.title,
        authors: study.authors,
        year: study.year,
        abstract: study.details?.abstract,
        journal: study.details?.journal,
        quality: study.quality,
        aiSummary: study.details?.aiSummary,
      })),
    })
    : null;

  const loadStudyFiles = useCallback(
    async (studyId: string) => {
      if (!id) return;
      setIsLoadingFiles(true);
      try {
        const result = await listStudyFilesAction(id, studyId);
        if (!result.success) {
          console.error("Failed to load files:", result.error);
          setStudyFiles([]);
          return;
        }
        setStudyFiles(result.data);
      } catch (err) {
        console.error("Failed to load study files", err);
        setStudyFiles([]);
      } finally {
        setIsLoadingFiles(false);
      }
    },
    [id],
  );

  const handleOpenStudyFiles = useCallback(
    (study: Study) => {
      setSelectedStudy(study);
      loadStudyFiles(study.id);
    },
    [loadStudyFiles],
  );

  const handleCloseStudyFiles = useCallback(() => {
    setSelectedStudy(null);
    setStudyFiles([]);
  }, []);

  const handleUploadFile = useCallback(
    async (file: File) => {
      if (!id || !selectedStudy) return;
      const formData = new FormData();
      formData.append("file", file);
      const uploadResult = await uploadStudyFileAction(
        id,
        selectedStudy.id,
        formData,
      );
      if (!uploadResult.success) {
        console.error("Upload failed:", uploadResult.error);
        return;
      }
      await loadStudyFiles(selectedStudy.id);
    },
    [id, selectedStudy, loadStudyFiles],
  );

  const handleDeleteFile = useCallback(
    async (fileId: string) => {
      if (!id || !selectedStudy) return;
      const delResult = await deleteFileAssetAction(id, fileId);
      if (!delResult.success) {
        console.error("Delete failed:", delResult.error);
        return;
      }
      await loadStudyFiles(selectedStudy.id);
    },
    [id, selectedStudy, loadStudyFiles],
  );

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (!id) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const validationError = validateStudyFile(file);
    if (validationError) {
      setAlertMsg(validationError);
      if (importInputRef.current) importInputRef.current.value = "";
      return;
    }
    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const importResult = await importStudyWithPdfAction(id, formData);
      if (!importResult.success) throw new Error(importResult.error);
      const { study, fileAsset } = importResult.data;
      addStudy(id, study);

      // Fire Stage 1 extraction in the background (non-blocking)
      if (fileAsset.mimeType === "application/pdf") {
        const runBackgroundExtraction = async () => {
          try {
            const result = await extractStudyFromPdfAction(id, study.id, fileAsset.id);
            if (result.success && result.study) {
              replaceStudyInCache(id, result.study);
            } else if (result.error) {
              console.error("Background extraction failed:", result.error);
            }
          } catch (err) {
            console.error("Background extraction error:", err);
          }
        };
        void runBackgroundExtraction();
      }
    } catch (err) {
      setAlertMsg(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  // Loading state
  if (isLoadingProjects) {
    return (
      <ProjectPageLayout mainClassName={ledgerMainClassName}>
        <EmptyStateSkeleton className={styles.notFound} />
      </ProjectPageLayout>
    );
  }

  // Error state
  if (projectsError) {
    return (
      <ProjectPageLayout mainClassName={ledgerMainClassName}>
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

  // Not found state
  if (!project) {
    return (
      <ProjectPageLayout mainClassName={ledgerMainClassName}>
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

  const mainContent = (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.headerText}>
          {!isEmbeddedInProjectShell && (
            <div style={{ display: "flex", alignItems: "center" }}>
              <BaseBackButton
                href={`/project/${project.id}`}
                label="Back to project"
              />
              <span className={styles.eyebrow}>Evidence Ledger</span>
            </div>
          )}
          <h1>{project.name}</h1>
        </div>
        <div className={styles.headerActions}>
          <button
            className={`header-btn ${isSelectMode ? "header-btn-active" : ""}`}
            onClick={toggleSelectMode}
          >
            <span className="material-icons-round">
              {isSelectMode ? "close" : "checklist"}
            </span>
            {isSelectMode ? "Cancel" : "Select"}
          </button>
          {hasSelection && isSelectMode ? (
            <button
              className="header-btn header-btn-danger"
              onClick={handleBulkDelete}
            >
              <span className="material-icons-round">delete</span>
              Delete {validSelectedIds.length}
            </button>
          ) : null}
          {canUseStudySetActions && studySetTarget ? (
            <>
              <button
                className="header-btn"
                onClick={() => runAction({
                  actionId: "compare_selected_studies",
                  targets: [studySetTarget],
                  prompt: "Compare these selected studies and highlight the main agreements, disagreements, and screening implications.",
                  page: "ledger",
                  section: "Selected studies",
                })}
              >
                <span className="material-icons-round">compare_arrows</span>
                Compare {validSelectedIds.length}
              </button>
              <button
                className="header-btn"
                onClick={() => sendToCopilot({
                  targets: [studySetTarget],
                  prompt: "Review these selected studies and propose a concise screening rationale that explains the main similarities, differences, and keep/exclude signals.",
                  page: "ledger",
                  section: "Selected studies",
                })}
              >
                <span className="material-icons-round">fact_check</span>
                Screening Rationale
              </button>
            </>
          ) : null}
          {captureEnabled && isSelectMode && validSelectedIds.length > 6 ? (
            <span className={styles.selectionHint}>
              Compare up to 6 studies at a time.
            </span>
          ) : null}
          <button className="header-btn" onClick={handleQuickAddStudy}>
            <span className="material-icons-round">add</span>
            Add Study
          </button>
          <button
            className="header-btn"
            onClick={handleImportClick}
            disabled={isImporting}
          >
            <span className="material-icons-round">upload_file</span>
            {isImporting ? "Importing..." : "Import PDF"}
          </button>
        </div>
      </header>
      <DemoGuideCard
        projectId={project.id}
        guideId="ledger-screening"
        text="These are real studies from the Cramer et al. (2018) evidence base. Try changing triage on one study and the copilot will ask for your rationale."
      />
      <input
        ref={importInputRef}
        type="file"
        accept=".pdf,application/pdf"
        style={{ display: "none" }}
        onChange={handleImportChange}
      />

      <LedgerStatsBar
        studies={studies}
        selectedCount={validSelectedIds.length}
      />

      {/* Protocol Criteria Filters */}
      {hasProtocolCriteria && (
        <div className={styles.criteriaFilters}>
          <span className={styles.criteriaLabel}>
            <span className="material-icons-round">filter_list</span>
            Protocol Criteria:
          </span>
          <button
            type="button"
            className={`${styles.criteriaChip} ${criteriaFilter === "all" ? styles.criteriaChipActive : ""}`}
            onClick={() => setCriteriaFilter("all")}
          >
            All
          </button>
          <button
            type="button"
            className={`${styles.criteriaChip} ${styles.criteriaChipMeets} ${criteriaFilter === "meets-criteria" ? styles.criteriaChipActive : ""}`}
            onClick={() => setCriteriaFilter("meets-criteria")}
          >
            <span className="material-icons-round">check</span>
            Meets Criteria ({criteriaCounts.meetsCriteria})
          </button>
          <button
            type="button"
            className={`${styles.criteriaChip} ${styles.criteriaChipFails} ${criteriaFilter === "fails-criteria" ? styles.criteriaChipActive : ""}`}
            onClick={() => setCriteriaFilter("fails-criteria")}
          >
            <span className="material-icons-round">close</span>
            Fails Criteria ({criteriaCounts.failsCriteria})
          </button>
          {(protocol.methodology.timeFrameStart ||
            protocol.methodology.timeFrameEnd) && (
            <button
              type="button"
              className={`${styles.criteriaChip} ${criteriaFilter === "in-date-range" ? styles.criteriaChipActive : ""}`}
              onClick={() => setCriteriaFilter("in-date-range")}
            >
              <span className="material-icons-round">date_range</span>
              In Date Range ({criteriaCounts.inDateRange})
            </button>
          )}
          {protocol.methodology.studyDesigns.length > 0 && (
            <button
              type="button"
              className={`${styles.criteriaChip} ${criteriaFilter === "matching-design" ? styles.criteriaChipActive : ""}`}
              onClick={() => setCriteriaFilter("matching-design")}
            >
              <span className="material-icons-round">science</span>
              Matching Design ({criteriaCounts.matchingDesign})
            </button>
          )}
          <Link
            href={`/project/${id}/protocol`}
            className={styles.criteriaLink}
          >
            Edit Protocol
          </Link>
        </div>
      )}

      <DemoGuideCard
        projectId={project.id}
        guideId="ledger-maybe"
        text="Use Maybe for borderline studies that need team review or protocol refinement before a final inclusion decision."
      />
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
                    aria-label={
                      allSelected
                        ? "Deselect all studies"
                        : "Select all studies"
                    }
                  />
                </th>
              )}
              <th>Study</th>
              <th>Status</th>
              <th>Quality</th>
              <th>Triage</th>
              {hasProtocolCriteria && <th>Criteria</th>}
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
                    onChange={(e) =>
                      setNewStudy((prev) => ({
                        ...prev,
                        title: e.target.value,
                      }))
                    }
                  />
                  <div className={styles.addRowMeta}>
                    <input
                      className={styles.inputField}
                      placeholder="Authors"
                      value={newStudy.authors}
                      onChange={(e) =>
                        setNewStudy((prev) => ({
                          ...prev,
                          authors: e.target.value,
                        }))
                      }
                    />
                    <input
                      className={`${styles.inputField} ${styles.inputFieldYear}`}
                      type="number"
                      placeholder="Year"
                      value={newStudy.year}
                      onChange={(e) =>
                        setNewStudy((prev) => ({
                          ...prev,
                          year: e.target.value,
                        }))
                      }
                    />
                  </div>
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
            {filteredStudies.map((study) => (
              <StudyRow
                key={study.id}
                study={study}
                projectId={id}
                isExpanded={expandedIds.has(study.id)}
                isSelected={selectedSet.has(study.id)}
                isSelectMode={isSelectMode}
                hasProtocolCriteria={hasProtocolCriteria}
                criteriaMatch={studyCriteriaMap.get(study.id)}
                onToggleExpand={toggleExpand}
                onToggleSelect={toggleStudySelection}
                onOpenFiles={handleOpenStudyFiles}
                onDeleteStudy={handleDeleteStudy}
                onTriage={handleTriage}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const filesPopup = selectedStudy ? (
    <>
      <div
        className={styles.filesPopupBackdrop}
        onClick={handleCloseStudyFiles}
      />
      <div className={styles.filesPopup}>
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
    </>
  ) : null;

  const dialogs = (
    <>
      <AlertDialog
        isOpen={alertMsg !== null}
        title="Notice"
        message={alertMsg ?? ""}
        onClose={() => setAlertMsg(null)}
      />
      <ConfirmDialog
        isOpen={confirmDialog !== null}
        title="Confirm"
        message={confirmDialog?.message ?? ""}
        variant="danger"
        confirmLabel="Delete"
        onConfirm={() => confirmDialog?.onConfirm()}
        onCancel={() => setConfirmDialog(null)}
      />
    </>
  );

  return (
    <ProjectPageLayout
      mainClassName={ledgerMainClassName}
      copilot={{
        page: "ledger",
        contextDisplay: `${studies.length} studies \u00b7 ${extractedCount} extracted`,
        emptyState: {
          icon: "search",
          title: "Search your evidence",
          description:
            "Ask questions about your studies, find patterns, or get evidence summaries.",
          suggestions: [
            {
              label: "Summarize",
              prompt: "Summarize the key findings across all studies",
            },
            {
              label: "Find Themes",
              prompt: "What are the common themes in this evidence?",
            },
            {
              label: "Find Conflicts",
              prompt: "Which studies have conflicting findings?",
            },
          ],
        },
        inputPlaceholder: "Ask about your evidence\u2026",
        panelId: "ledger-copilot-panel",
      }}
    >
      <div className={styles.page} data-mobile-ledger-v2={mobileLedgerV2Enabled ? "true" : "false"}>
        <div className={styles.mainContent}>{mainContent}</div>
        {filesPopup}
        {dialogs}
      </div>
    </ProjectPageLayout>
  );
}
