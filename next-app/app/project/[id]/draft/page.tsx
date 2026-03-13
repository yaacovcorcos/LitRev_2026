"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";
import { BaseBackButton } from "@/components/BaseBackButton";
import { ProjectPageLayout } from "@/components/project/ProjectPageLayout";
import { DemoGuideCard } from "@/components/project/DemoGuideCard";
import { EmptyState, EmptyStateSkeleton } from "@/components/ui/EmptyState";
import { AddEvidenceModal } from "./AddEvidenceModal";
import { DraftContextRail } from "./DraftContextRail";
import { EditorToolbar } from "./DraftEditors";
import { DraftFormattingPanel, DraftWorkspaceHeader as WorkspaceHeader } from "./DraftToolbar";
import { ManuscriptCanvas } from "./ManuscriptCanvas";
import { StructureRail } from "./StructureRail";
import { useDraftWorkspaceController } from "./useDraftWorkspaceController";
import styles from "./draft-studio.module.css";

const ExportModal = dynamic(() => import("@/components/ExportModal").then((module) => module.ExportModal), {
  ssr: false,
});

function DraftContent() {
  const { id } = useParams<{ id: string }>();
  const controller = useDraftWorkspaceController({ projectId: id });

  const draftMainClassName = `${styles.appMainOverride} ${controller.isMobileDraftV2Enabled ? styles.appMainOverrideMobileV2 : ""}`;
  const draftPageClassName = `${styles.page} ${controller.isMobileDraftV2Enabled ? styles.pageMobileV2 : ""}`;
  const showDraftContextToolbar = controller.captureEnabled
    && controller.contextToolbarEnabled
    && controller.showDesktopContextToolbar
    && !controller.isReferencesSection;

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

  const structureRail = (
    <StructureRail
      outline={controller.outlineView}
      activeSection={controller.draft.activeSection}
      collapsedSectionIds={controller.collapsedSectionIds}
      availableSections={controller.availableSections}
      customSectionName={controller.customSectionName}
      draggingSectionId={controller.draggingSectionId}
      dragOverSectionId={controller.dragOverSectionId}
      dragOverPosition={controller.dragOverPosition}
      statusLabelByKey={controller.statusLabelByKey}
      onCustomSectionNameChange={controller.setCustomSectionName}
      onAddCustomSection={controller.handleAddCustomSection}
      onAddOptionalSection={controller.addOptionalSection}
      onNavigateSection={controller.focusSection}
      onNavigateHeading={controller.focusHeading}
      onToggleSectionCollapsed={controller.toggleSectionCollapsed}
      onRemoveSection={controller.removeSection}
      onSectionKeyDown={controller.handleSelectSectionKeyDown}
      onDragStart={controller.handleSectionDragStart}
      onDragOver={controller.handleSectionDragOver}
      onDrop={controller.handleSectionDrop}
      onDragEnd={controller.handleSectionDragEnd}
    />
  );

  const contextRail = (
    <DraftContextRail
      activeSectionLabel={controller.activeSectionLabel}
      isReferencesSection={controller.isReferencesSection}
      usedEvidence={controller.usedEvidence}
      onAddEvidence={() => controller.setAddEvidenceOpen(true)}
      onInsertCitation={controller.insertCitation}
      onRemoveEvidence={controller.handleRemoveEvidence}
      studyLabel={controller.studyLabel}
    />
  );

  const pageContent = (
    <>
      <div className={draftPageClassName} data-mobile-draft-v2={controller.isMobileDraftV2Enabled ? "1" : "0"}>
        <WorkspaceHeader
          projectName={controller.project.name}
          hasDraftContent={controller.hasDraftContent}
          onExportClick={() => controller.setExportModalOpen(true)}
          saveStatus={controller.saveStatus}
          showCompactControls={controller.isCompactWorkspace}
          onToggleStructureRail={() => controller.setStructureDrawerOpen((prev) => !prev)}
          onToggleContextRail={() => controller.setContextDrawerOpen((prev) => !prev)}
        />

        <DemoGuideCard
          projectId={controller.project.id}
          guideId="draft-evidence-chain"
          text="Citations in this draft should map directly to included studies in the Ledger. Ask the copilot to find evidence for any claim you highlight."
          className={styles.demoGuide}
        />
        {controller.showResultsGuide ? (
          <DemoGuideCard
            projectId={controller.project.id}
            guideId="draft-results-empty"
            text="This Results section is intentionally empty. Ask the copilot to draft a results summary from your included studies."
            className={styles.demoGuide}
          />
        ) : null}

        <div className={styles.workspaceBody}>
          {!controller.isCompactWorkspace ? structureRail : null}

          <section className={styles.center} aria-label="Draft editor">
            <div className={styles.centerHeader}>
              <div className={styles.centerTitle}>
                {!controller.isEmbeddedInProjectShell ? (
                  <BaseBackButton
                    href={`/project/${id}`}
                    label="Back to project"
                    className={styles.draftBackBtn}
                  />
                ) : null}
                <span className="material-icons-round">edit</span>
                {controller.activeSectionLabel}
              </div>
            </div>

            <div className={styles.toolbarRow}>
              <EditorToolbar
                editor={controller.editor}
                dir={controller.paragraphDir}
                onAskAi={controller.handleAskAi}
              />

              {showDraftContextToolbar ? (
                <div className={styles.contextActionStrip} role="group" aria-label="Draft context actions">
                  <div className={styles.contextActionMeta}>Draft context</div>
                  <button
                    type="button"
                    className={styles.contextActionPrimary}
                    onClick={() => controller.handleDraftContextAction(
                      "send_to_copilot",
                      controller.sendToCopilotAction.defaultPrompt ?? "Use this context in your answer.",
                    )}
                    disabled={!controller.canRunDraftContextActions}
                    title={controller.canRunDraftContextActions ? "Attach this draft context to the copilot composer." : "Add draft text to enable context actions."}
                  >
                    <span className="material-icons-round">{controller.sendToCopilotAction.icon}</span>
                    {controller.sendToCopilotAction.label}
                  </button>
                  <button
                    type="button"
                    className={styles.contextActionButton}
                    onClick={() => controller.handleDraftContextAction(
                      "rewrite_selection",
                      controller.rewriteSelectionAction.defaultPrompt ?? "Rewrite this text for clarity while preserving the meaning and staying conservative.",
                    )}
                    disabled={!controller.canRunDraftContextActions}
                  >
                    <span className="material-icons-round">{controller.rewriteSelectionAction.icon}</span>
                    {controller.rewriteSelectionAction.label}
                  </button>
                  <button
                    type="button"
                    className={styles.contextActionButton}
                    onClick={() => controller.handleDraftContextAction(
                      "check_claim_support",
                      controller.checkClaimSupportAction.defaultPrompt ?? "Check whether this claim is supported and point out any missing or weak evidence.",
                    )}
                    disabled={!controller.canRunDraftContextActions}
                  >
                    <span className="material-icons-round">{controller.checkClaimSupportAction.icon}</span>
                    {controller.checkClaimSupportAction.label}
                  </button>
                </div>
              ) : null}

              <DraftFormattingPanel
                isOpen={controller.isFormatOpen}
                setOpen={controller.setFormatOpen}
                formatRef={controller.formatRef}
                activeSection={controller.draft.activeSection}
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

            <ManuscriptCanvas
              manuscriptDoc={controller.draft.manuscript.doc}
              formatVarsById={controller.formatVarsById}
              activeBlockId={controller.selectionState.activeBlockId}
              selectedBlockEntry={controller.activeBlockEntry}
              onEditorReady={controller.handleEditorReady}
              onManuscriptChange={controller.handleManuscriptChange}
              onEditorMapChange={controller.handleEditorMapChange}
              onSelectionUpdate={controller.handleSelectionUpdate}
              onEditorSignalsChange={controller.syncFormattingFromEditor}
              onMoveSelectedBlock={controller.moveSelectedBlock}
            />
          </section>

          {!controller.isCompactWorkspace ? contextRail : null}
        </div>

        {controller.isCompactWorkspace && controller.isStructureDrawerOpen ? (
          <div className={styles.drawerOverlay} role="presentation">
            <button
              type="button"
              className={styles.drawerBackdrop}
              aria-label="Close structure drawer"
              onClick={() => controller.setStructureDrawerOpen(false)}
            />
            <div className={`${styles.drawerPanel} ${styles.drawerPanelLeft}`}>
              {structureRail}
            </div>
          </div>
        ) : null}

        {controller.isCompactWorkspace && controller.isContextDrawerOpen ? (
          <div className={styles.drawerOverlay} role="presentation">
            <button
              type="button"
              className={styles.drawerBackdrop}
              aria-label="Close context drawer"
              onClick={() => controller.setContextDrawerOpen(false)}
            />
            <div className={`${styles.drawerPanel} ${styles.drawerPanelRight}`}>
              {contextRail}
            </div>
          </div>
        ) : null}
      </div>

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
        citationIssuesCount={controller.exportCitationIssues.length}
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
        section: controller.activeSectionLabel,
        contextDisplay: `${controller.activeSectionLabel} · ${controller.usedEvidence.length} evidence`,
        emptyState: controller.copilotEmptyState,
        inputPlaceholder: `Ask about ${controller.activeSectionLabel}…`,
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
