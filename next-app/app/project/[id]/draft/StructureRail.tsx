"use client";

import type { DraftSectionId } from "@/types/draft";
import styles from "./draft-studio.module.css";

export type DraftSidebarHeading = {
  id: string;
  label: string;
  level: number;
  blockId?: string;
};

export type DraftSidebarSection = {
  id: DraftSectionId;
  label: string;
  isWholeDraft?: boolean;
  isGenerated?: boolean;
  isRemovable?: boolean;
  headings: DraftSidebarHeading[];
};

type SectionsPaneProps = {
  sections: DraftSidebarSection[];
  activeTargetId: DraftSectionId;
  onSelectSection: (sectionId: DraftSectionId) => void;
  onSelectHeading: (sectionId: DraftSectionId, blockId?: string) => void;
  onMoveSection: (sectionId: DraftSectionId, direction: "up" | "down") => void;
  onRemoveSection: (sectionId: DraftSectionId) => void;
};

export function SectionsPane({
  sections,
  activeTargetId,
  onSelectSection,
  onSelectHeading,
  onMoveSection,
  onRemoveSection,
}: SectionsPaneProps) {
  return (
    <div className={styles.sectionsPane} data-testid="sections-pane">
      <div className={styles.ledgerHeader}>
        <div className={styles.ledgerHeaderTop}>
          <span className={styles.ledgerTitle}>Sections</span>
        </div>
        <div className={styles.sidebarHelpText}>Navigate the draft and manage section order.</div>
      </div>

      <div className={styles.panelBody}>
        <div className={styles.sectionsList}>
          {sections.map((section) => {
            const isActive = activeTargetId === section.id;
            return (
              <div key={section.id} className={styles.sectionsListItem}>
                <div className={styles.sectionsRow}>
                  <button
                    type="button"
                    className={`${styles.sectionsButton} ${isActive ? styles.sectionsButtonActive : ""}`}
                    onClick={() => onSelectSection(section.id)}
                  >
                    <span className={styles.sectionsButtonLabel}>{section.label}</span>
                    {section.isGenerated ? <span className={styles.sectionsBadge}>Generated</span> : null}
                  </button>

                  {!section.isWholeDraft && !section.isGenerated ? (
                    <div className={styles.sectionsActions}>
                      <button
                        type="button"
                        className={styles.structureIconButton}
                        aria-label={`Move ${section.label} up`}
                        onClick={() => onMoveSection(section.id, "up")}
                      >
                        <span className="material-icons-round">arrow_upward</span>
                      </button>
                      <button
                        type="button"
                        className={styles.structureIconButton}
                        aria-label={`Move ${section.label} down`}
                        onClick={() => onMoveSection(section.id, "down")}
                      >
                        <span className="material-icons-round">arrow_downward</span>
                      </button>
                      {section.isRemovable ? (
                        <button
                          type="button"
                          className={styles.structureIconButton}
                          aria-label={`Remove ${section.label}`}
                          onClick={() => onRemoveSection(section.id)}
                        >
                          <span className="material-icons-round">delete</span>
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {section.headings.length > 0 ? (
                  <div className={styles.sectionsHeadings}>
                    {section.headings.map((heading) => (
                      <button
                        key={heading.id}
                        type="button"
                        className={styles.structureHeadingButton}
                        onClick={() => onSelectHeading(section.id, heading.blockId)}
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
      </div>
    </div>
  );
}
