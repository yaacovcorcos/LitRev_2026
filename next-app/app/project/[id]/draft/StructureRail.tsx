"use client";

import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { OPTIONAL_SECTION_KEYS, type DraftSectionId } from "@/types/draft";
import type { DraftOutlineViewModel, DraftSectionStatus } from "./workspace-view-model";
import type { SectionMeta } from "./draft-helpers";
import styles from "./draft-studio.module.css";

type StructureRailProps = {
  outline: DraftOutlineViewModel[];
  activeSection: DraftSectionId;
  collapsedSectionIds: Set<DraftSectionId>;
  availableSections: SectionMeta[];
  customSectionName: string;
  draggingSectionId: DraftSectionId | null;
  dragOverSectionId: DraftSectionId | null;
  dragOverPosition: "before" | "after" | null;
  statusLabelByKey: Record<DraftSectionStatus, string>;
  onCustomSectionNameChange: (value: string) => void;
  onAddCustomSection: () => void;
  onAddOptionalSection: (sectionId: DraftSectionId) => void;
  onNavigateSection: (sectionId: DraftSectionId) => void;
  onNavigateHeading: (sectionId: DraftSectionId, headingId: string) => void;
  onToggleSectionCollapsed: (sectionId: DraftSectionId) => void;
  onRemoveSection: (sectionId: DraftSectionId) => void;
  onSectionKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => void;
  onDragStart: (event: ReactDragEvent<HTMLButtonElement>, sectionId: DraftSectionId) => void;
  onDragOver: (event: ReactDragEvent<HTMLButtonElement>, sectionId: DraftSectionId) => void;
  onDrop: (event: ReactDragEvent<HTMLButtonElement>, sectionId: DraftSectionId) => void;
  onDragEnd: () => void;
};

function isRemovableSection(sectionId: DraftSectionId, kind: "base" | "custom") {
  return kind === "custom" || OPTIONAL_SECTION_KEYS.includes(sectionId as (typeof OPTIONAL_SECTION_KEYS)[number]);
}

export function OutlinePane({
  outline,
  activeSection,
  collapsedSectionIds,
  availableSections,
  customSectionName,
  draggingSectionId,
  dragOverSectionId,
  dragOverPosition,
  statusLabelByKey,
  onCustomSectionNameChange,
  onAddCustomSection,
  onAddOptionalSection,
  onNavigateSection,
  onNavigateHeading,
  onToggleSectionCollapsed,
  onRemoveSection,
  onSectionKeyDown,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: StructureRailProps) {
  return (
    <div className={styles.outlinePane} data-testid="outline-pane">
      <div className={styles.utilityPaneHeader}>
        <div>
          <div className={styles.utilityPaneEyebrow}>Navigate</div>
          <h2 className={styles.utilityPaneTitle}>Outline</h2>
        </div>
      </div>

      <div className={styles.structureList} role="tree" aria-label="Manuscript structure">
        {outline.map((section, index) => {
          const isCollapsed = collapsedSectionIds.has(section.sectionId);
          const isActive = activeSection === section.sectionId;
          const isDragging = draggingSectionId === section.sectionId;
          const isDragOver = dragOverSectionId === section.sectionId && draggingSectionId !== section.sectionId;
          const dropClass =
            isDragOver && dragOverPosition === "after"
              ? styles.structureDropAfter
              : isDragOver && dragOverPosition === "before"
                ? styles.structureDropBefore
                : "";
          const canRemove = isRemovableSection(section.sectionId, section.kind);
          const canDrag = section.sectionId !== "references";

          return (
            <div key={section.sectionNodeId} className={`${styles.structureSection} ${dropClass}`}>
              <div className={styles.structureSectionRow}>
                <button
                  type="button"
                  className={styles.structureFoldButton}
                  aria-label={isCollapsed ? `Expand ${section.label}` : `Collapse ${section.label}`}
                  onClick={() => onToggleSectionCollapsed(section.sectionId)}
                >
                  <span className="material-icons-round">
                    {isCollapsed ? "chevron_right" : "expand_more"}
                  </span>
                </button>
                <button
                  type="button"
                  draggable={canDrag}
                  className={`${styles.structureSectionButton} ${isActive ? styles.structureSectionButtonActive : ""} ${isDragging ? styles.structureSectionButtonDragging : ""}`}
                  aria-current={isActive ? "true" : undefined}
                  onClick={() => onNavigateSection(section.sectionId)}
                  onKeyDown={(event) => onSectionKeyDown(event, index)}
                  onDragStart={(event) => onDragStart(event, section.sectionId)}
                  onDragOver={(event) => onDragOver(event, section.sectionId)}
                  onDrop={(event) => onDrop(event, section.sectionId)}
                  onDragEnd={onDragEnd}
                >
                  <div className={styles.structureSectionMain}>
                    <span className={styles.structureSectionLabel}>{section.label}</span>
                    <span className={styles.structureStatus} data-status={section.status}>
                      {statusLabelByKey[section.status]}
                    </span>
                  </div>
                  {section.issueCount > 0 ? (
                    <span className={styles.structureIssueBadge}>{section.issueCount}</span>
                  ) : null}
                </button>
                {canRemove ? (
                  <button
                    type="button"
                    className={styles.structureIconButton}
                    aria-label={`Remove ${section.label}`}
                    onClick={() => onRemoveSection(section.sectionId)}
                  >
                    <span className="material-icons-round">delete</span>
                  </button>
                ) : null}
              </div>

              {!isCollapsed && section.headings.length > 0 ? (
                <div className={styles.structureHeadings}>
                  {section.headings.map((heading) => (
                    <button
                      key={heading.id}
                      type="button"
                      className={styles.structureHeadingButton}
                      onClick={() => onNavigateHeading(section.sectionId, heading.id)}
                    >
                      <span className={styles.structureHeadingLevel}>H{heading.level}</span>
                      <span className={styles.structureHeadingLabel}>{heading.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className={styles.structureFooter}>
        <div className={styles.structureAddCard}>
          <div className={styles.utilityPaneEyebrow}>Add section</div>
          <div className={styles.structureAddRow}>
            <input
              type="text"
              value={customSectionName}
              onChange={(event) => onCustomSectionNameChange(event.target.value)}
              placeholder="Custom section name"
              className={styles.structureInput}
            />
            <button
              type="button"
              className={styles.smallBtn}
              onClick={onAddCustomSection}
              disabled={!customSectionName.trim()}
            >
              Add
            </button>
          </div>
          {availableSections.length > 0 ? (
            <div className={styles.structureChipList}>
              {availableSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  className={styles.structureChip}
                  onClick={() => onAddOptionalSection(section.id)}
                >
                  <span>{section.label}</span>
                  <span className="material-icons-round">add</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
