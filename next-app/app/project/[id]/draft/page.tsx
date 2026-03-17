"use client";

import { Suspense, type CSSProperties } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import * as Dialog from "@radix-ui/react-dialog";
import { ProjectPageLayout } from "@/components/project/ProjectPageLayout";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { EmptyState, EmptyStateSkeleton } from "@/components/ui/EmptyState";
import { AddEvidenceModal } from "./AddEvidenceModal";
import { EvidencePane } from "./DraftContextRail";
import { EditorToolbar, FullSectionEditor } from "./DraftEditors";
import { DraftFormattingPanel, DraftTopBar } from "./DraftToolbar";
import { DraftSidebar } from "./DraftSidebar";
import { useDraftWorkspaceController } from "./useDraftWorkspaceController";
import styles from "./draft-studio.module.css";
import { UNSECTIONED_DRAFT_ID } from "@/types/draft";

const ExportModal = dynamic(() => import("@/components/ExportModal").then((module) => module.ExportModal), {
  ssr: false,
});

type DraftSectionHeadingProps = {
  id: string;
  label: string;
};

function DraftSectionHeading({ id, label }: DraftSectionHeadingProps) {
  return (
    <header className={styles.manuscriptSectionHeader}>
      <h2 id={id} className={styles.manuscriptSectionTitle}>
        {label}
      </h2>
    </header>
  );
}

function DraftContent() {
  const { id } = useParams<{ id: string }>();
  const controller = useDraftWorkspaceController({ projectId: id });

  const draftMainClassName = styles.appMainOverride;

  if (controller.isLoadingProjects) {
    return (
      <ProjectPageLayout noMainPadding initiallyCollapsed mainClassName={draftMainClassName} contentScrollMode="child">
        <EmptyStateSkeleton className={styles.notFound} />
      </ProjectPageLayout>
    );
  }

  if (controller.projectsError) {
    return (
      <ProjectPageLayout noMainPadding initiallyCollapsed mainClassName={draftMainClassName} contentScrollMode="child">
        <EmptyState
          variant="error"
          icon="cloud_off"
          title="Unable to load project"
          description={controller.projectsError}
          primaryAction={{ label: "Retry", onClick: () => window.location.reload() }}
          secondaryAction={{ label: "Back to Dashboard", href: "/" }}
          className={styles.notFound}
        />
      </ProjectPageLayout>
    );
  }

  if (!controller.project) {
    return (
      <ProjectPageLayout noMainPadding initiallyCollapsed mainClassName={draftMainClassName} contentScrollMode="child">
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

  const renderDraftRegion = (
    sectionId: string,
    label: string,
    placeholder?: string,
    editable = true,
    isWholeDraft = false,
  ) => (
    <section
      key={sectionId}
      className={`${styles.manuscriptSection} ${controller.currentTargetId === sectionId ? styles.manuscriptSectionActive : ""}`}
      data-section-id={sectionId}
    >
      <div className={styles.manuscriptSectionHeader}>
        <h2 className={styles.manuscriptSectionTitle}>{label}</h2>
      </div>

      <FullSectionEditor
        sectionId={sectionId}
        content={controller.draft.contentBySection[sectionId]}
        onFocusSection={controller.handleSectionFocus}
        onUpdateSection={controller.updateSectionContent}
        onSelectionChange={controller.handleSectionSelectionChange}
        registerEditor={controller.registerEditor}
        placeholderText={placeholder}
        surfaceClassName={styles.manuscriptEditorSurface}
        surfaceStyle={controller.formatVarsById[sectionId]}
        editable={editable}
      />
    </section>
  );

  const pageContent = (
    <>
      <div className={styles.page}>
        <DraftTopBar
          projectName={controller.project.name}
          activeSection={controller.draft.activeSection}
          mode={controller.draft.mode}
          canUseSectionMode={controller.hasEditableSections}
          orderedSections={controller.orderedSections}
          availableSections={controller.availableSections}
          draggingKey={controller.draggingKey}
          dragOverKey={controller.dragOverKey}
          dragOverPosition={controller.dragOverPosition}
          sectionTabRefs={controller.sectionTabRefs}
          addSectionRef={controller.addSectionRef}
          addSectionInputRef={controller.addSectionInputRef}
          isAddSectionOpen={controller.isAddSectionOpen}
          setAddSectionOpen={controller.setAddSectionOpen}
          customSectionName={controller.customSectionName}
          setCustomSectionName={controller.setCustomSectionName}
          onSelectSection={controller.selectSection}
          onSectionKeyDown={controller.handleSelectSectionKeyDown}
          onToggleMode={controller.handleToggleMode}
          onAddSection={controller.handleAddSection}
          onAddCustomSection={controller.handleAddCustomSection}
          onRemoveSection={controller.requestRemoveSection}
          onDragStart={controller.handleDragStart}
          onDragOver={controller.handleDragOver}
          onDrop={controller.handleDrop}
          onDragEnd={controller.handleDragEnd}
          hasDraftContent={controller.hasDraftContent}
          onExportClick={() => controller.setExportModalOpen(true)}
          saveStatus={controller.saveStatus}
        />

        <div
          className={styles.body}
          style={{
            "--ledger-width": controller.isSidebarCollapsed ? "60px" : controller.isCompactWorkspace ? "0px" : "320px",
          } as CSSProperties}
        >
            <DraftSidebar
              collapsed={controller.isSidebarCollapsed}
              isOverlay={controller.isCompactWorkspace}
              onToggleCollapsed={controller.toggleSidebar}
              onDismiss={() => controller.setSidebarOpen(false)}
            >
              <EvidencePane
                activeSectionLabel={controller.currentTargetLabel}
                isReferencesSection={controller.isReferencesTarget}
                usedEvidence={controller.usedEvidence}
                onAddEvidence={() => controller.setAddEvidenceOpen(true)}
                onCollapse={controller.toggleSidebar}
                onInsertCitation={controller.insertCitation}
                onRemoveEvidence={controller.handleRemoveEvidence}
                studyLabel={controller.studyLabel}
              />
            </DraftSidebar>

            <section className={styles.center} aria-label="Draft editor">
              <div className={styles.centerHeader}>
                <div className={styles.centerTitle}>
                  <span className="material-icons-round">edit</span>
                  {controller.activeSectionLabel}
                </div>
              </div>

              <div className={styles.toolbarRow}>
                <EditorToolbar editor={controller.activeEditor} dir={controller.paragraphDir} onAskAi={controller.handleAskAi} />
                <DraftFormattingPanel
                  isOpen={controller.isFormatOpen}
                  setOpen={controller.setFormatOpen}
                  formatRef={controller.formatRef}
                  activeSection={controller.currentTargetId}
                  activeFormat={controller.activeFormat}
                  activeFontFamily={controller.activeFontFamily}
                  onUpdateFormat={controller.updateSectionFormat}
                />
              </div>

              {controller.citationIssues.length > 0 ? (
                <div className={styles.citationIssues} role="status" aria-live="polite">
                  <div className={styles.citationIssuesTitle}>
                    <span className="material-icons-round">warning</span>
                    {controller.citationIssues.length} citation issue{controller.citationIssues.length === 1 ? "" : "s"} detected
                  </div>
                  <ul className={styles.citationIssuesList}>
                    {controller.citationIssues.slice(0, 3).map((issue) => (
                      <li key={`${issue.uid}-${issue.type}`}>{issue.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {controller.draft.mode === "section" && controller.draft.activeSection ? (
                <section className={styles.sectionEditorWrapper} role="tabpanel" id="draft-section-panel">
                  {controller.draft.activeSection === "references" ? (
                    <>
                      <div className={styles.editorSurface} style={controller.formatVarsById.references}>
                        <DraftSectionHeading id="draft-section-panel-heading" label={controller.activeSectionLabel} />
                        <pre className={styles.referencesReadOnly}>{controller.referencesText}</pre>
                      </div>
                      <div className={styles.helperText}>References are auto-generated from inline citations.</div>
                    </>
                  ) : (
                    <>
                      <FullSectionEditor
                        sectionId={controller.draft.activeSection}
                        content={controller.draft.contentBySection[controller.draft.activeSection]}
                        onFocusSection={controller.handleSectionFocus}
                        onUpdateSection={controller.updateSectionContent}
                        onSelectionChange={controller.handleSectionSelectionChange}
                        registerEditor={controller.registerEditor}
                        placeholderText={controller.orderedSections.find((section) => section.id === controller.draft.activeSection)?.placeholder}
                        surfaceClassName={styles.editorSurface}
                        surfaceStyle={controller.formatVarsById[controller.draft.activeSection]}
                        prefixContent={<DraftSectionHeading id="draft-section-panel-heading" label={controller.activeSectionLabel} />}
                      />
                      <div className={styles.helperText}>
                        {controller.orderedSections.find((section) => section.id === controller.draft.activeSection)?.placeholder}
                      </div>
                    </>
                  )}
                </section>
              ) : controller.orderedSections.length === 0 ? (
                <section className={styles.sectionEditorWrapper} role="region" aria-label="Whole draft">
                  <FullSectionEditor
                    sectionId={UNSECTIONED_DRAFT_ID}
                    content={controller.draft.contentBySection[UNSECTIONED_DRAFT_ID]}
                    onFocusSection={controller.handleSectionFocus}
                    onUpdateSection={controller.updateSectionContent}
                    onSelectionChange={controller.handleSectionSelectionChange}
                    registerEditor={controller.registerEditor}
                    placeholderText={controller.wholeDraftMeta.placeholder}
                    surfaceClassName={styles.editorSurface}
                    surfaceStyle={controller.formatVarsById[UNSECTIONED_DRAFT_ID]}
                    prefixContent={<DraftSectionHeading id="draft-whole-draft-heading" label={controller.wholeDraftMeta.label} />}
                  />
                  <div className={styles.helperText}>Start writing here. Add sections when you want structure.</div>
                </section>
              ) : (
                <div className={styles.fullDraftScroll} role="region" aria-label="Full draft">
                  <div className={styles.manuscript}>
                    <header className={styles.manuscriptHeader}>
                      <h1 className={styles.manuscriptTitle}>{controller.project.name}</h1>
                      <p className={styles.manuscriptSubtitle}>
                        {controller.orderedSections.length === 0
                          ? "Start drafting. Add sections when you want structure."
                          : "Full manuscript view — sections appear as you write them."}
                      </p>
                    </header>

                    {controller.shouldRenderWholeDraft
                      ? renderDraftRegion(
                          UNSECTIONED_DRAFT_ID,
                          controller.wholeDraftMeta.label,
                          controller.wholeDraftMeta.placeholder,
                          true,
                          true,
                        )
                      : null}

                    {controller.fullDraftSections.length === 0 && !controller.shouldRenderWholeDraft ? (
                      <div className={styles.emptyPanel}>
                        <div className={styles.emptyIcon}>
                          <span className="material-icons-round">description</span>
                        </div>
                        <h3>Nothing written yet</h3>
                        <p>Start drafting in Section mode — completed sections will show up here in order.</p>
                        <button
                          type="button"
                          className={styles.smallBtn}
                          onClick={() => controller.openSectionInSectionMode(controller.firstEditableSectionId)}
                          disabled={!controller.firstEditableSectionId}
                        >
                          Start drafting
                        </button>
                      </div>
                    ) : (
                      controller.fullDraftSections.map((section) =>
                        renderDraftRegion(
                          section.id,
                          section.label,
                          section.placeholder,
                          section.id !== "references",
                        ),
                      )
                    )}
                  </div>
                </div>
              )}
            </section>
        </div>
      </div>

      <Dialog.Root open={Boolean(controller.pendingSectionRequest)} onOpenChange={(open) => { if (!open) controller.cancelPendingSectionRequest(); }}>
        <Dialog.Portal>
          <Dialog.Overlay className="modal-overlay" />
          <Dialog.Content className={`modal-glass ${styles.choiceDialog}`}>
            <Dialog.Title className={styles.choiceDialogTitle}>Add your first section</Dialog.Title>
            <Dialog.Description className={styles.choiceDialogDescription}>
              You already have draft text in Whole draft. Decide how to place it before creating the first named section.
            </Dialog.Description>
            <div className={styles.choiceDialogActions}>
              <button type="button" className={styles.choiceDialogButton} onClick={controller.confirmPendingMove}>
                Move current text into the new section
              </button>
              <button type="button" className={styles.choiceDialogButtonSecondary} onClick={controller.confirmPendingKeep}>
                Keep it above as Whole draft
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfirmDialog
        isOpen={Boolean(controller.sectionToRemove)}
        title="Remove section?"
        message="This removes the section and its evidence links from the current draft."
        confirmLabel="Remove"
        variant="danger"
        onConfirm={controller.confirmRemoveSection}
        onCancel={controller.cancelRemoveSection}
      />

      <AddEvidenceModal
        isOpen={controller.isAddEvidenceOpen}
        onClose={() => controller.setAddEvidenceOpen(false)}
        studies={controller.studies}
        usedEvidenceIds={controller.usedEvidenceIds}
        onAddEvidence={controller.handleAddEvidence}
        projectId={id}
      />

      <ExportModal
        isOpen={controller.isExportModalOpen}
        onClose={() => controller.setExportModalOpen(false)}
        onExport={controller.handleExportDocx}
        exportMode={controller.exportMode}
        onExportModeChange={controller.setExportMode}
        citationIssuesCount={controller.citationIssues.length}
        blockingCitationIssuesCount={controller.blockingCitationIssuesCount}
        latestExport={controller.latestExport}
        exportHistory={controller.exportHistory}
        onDeleteExport={controller.handleDeleteExport}
      />
    </>
  );

  return (
    <ProjectPageLayout
      noMainPadding
      initiallyCollapsed
      mainClassName={draftMainClassName}
      contentScrollMode="child"
      copilot={controller.isEmbeddedInProjectShell ? undefined : {
        page: "draft",
        section: controller.currentTargetLabel,
        contextDisplay: `${controller.currentTargetLabel} · ${controller.usedEvidence.length} evidence`,
        emptyState: controller.copilotEmptyState,
        inputPlaceholder: `Ask about ${controller.currentTargetLabel}…`,
        onInsert: controller.insertCopilotText,
        panelId: "draft-copilot-panel",
      }}
    >
      {pageContent}
    </ProjectPageLayout>
  );
}

export default function DraftPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <DraftContent />
    </Suspense>
  );
}
