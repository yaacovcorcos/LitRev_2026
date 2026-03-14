import { type RefObject } from "react";
import type { DraftSectionId } from "@/types/draft";
import type { DraftSectionFormat } from "@/lib/draftStorage";
import {
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  PARAGRAPH_SPACING_OPTIONS,
} from "./draft-helpers";
import styles from "./draft-studio.module.css";

export type DraftWorkspaceHeaderProps = {
  projectName: string;
  hasDraftContent: boolean;
  onExportClick: () => void;
  saveStatus: "saved" | "saving" | "error";
};

export function DraftWorkspaceHeader({
  projectName,
  hasDraftContent,
  onExportClick,
  saveStatus,
}: DraftWorkspaceHeaderProps) {
  return (
    <div className={styles.top}>
      <div className={styles.topLeft}>
        <div className={styles.projectMeta}>
          <div className={styles.projectEyebrow}>Draft</div>
          <div className={styles.projectName} title={projectName}>
            {projectName}
          </div>
        </div>
      </div>

      <div className={styles.topRight}>
        <button
          type="button"
          className={styles.exportBtn}
          onClick={onExportClick}
          disabled={!hasDraftContent}
          title={hasDraftContent ? "Export draft" : "Add content to enable export"}
        >
          <span className="material-icons-round">download</span>
          Export
        </button>

        <div className={styles.saveBadge} role="status" aria-live="polite" aria-atomic="true">
          <span className="material-icons-round">{saveStatus === "saving" ? "sync" : saveStatus === "error" ? "error_outline" : "check_circle"}</span>
          {saveStatus === "saving" ? "Saving" : saveStatus === "error" ? "Save failed" : "Saved"}
        </div>
      </div>
    </div>
  );
}

export type DraftFormattingPanelProps = {
  isOpen: boolean;
  setOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  formatRef: RefObject<HTMLDivElement | null>;
  activeSection: DraftSectionId;
  activeFormat: DraftSectionFormat;
  activeFontFamily: string;
  onUpdateFormat: (sectionId: DraftSectionId, updates: Partial<DraftSectionFormat>) => void;
};

export function DraftFormattingPanel({
  isOpen,
  setOpen,
  formatRef,
  activeSection,
  activeFormat,
  activeFontFamily,
  onUpdateFormat,
}: DraftFormattingPanelProps) {
  return (
    <div className={styles.formattingControls} ref={formatRef}>
      <button
        type="button"
        className={styles.formatToggle}
        aria-expanded={isOpen}
        aria-label="Open formatting options"
        onClick={() => setOpen((prev: boolean) => !prev)}
      >
        <span className="material-icons-round">tune</span>
        Formatting
      </button>
      {isOpen ? (
        <div className={styles.formatPanel} role="dialog" aria-label="Formatting options">
          <div className={styles.formatGrid}>
            <label className={styles.formatField}>
              <span className={styles.formatFieldLabel}>Font</span>
              <select
                className={styles.formatSelect}
                value={activeFontFamily}
                onChange={(event) =>
                  onUpdateFormat(activeSection, { fontFamily: event.target.value })
                }
              >
                {FONT_FAMILY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.formatField}>
              <span className={styles.formatFieldLabel}>Font size</span>
              <select
                className={styles.formatSelect}
                value={activeFormat.fontSize}
                onChange={(event) =>
                  onUpdateFormat(activeSection, { fontSize: Number(event.target.value) })
                }
              >
                {FONT_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}px
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.formatField}>
              <span className={styles.formatFieldLabel}>Line spacing</span>
              <select
                className={styles.formatSelect}
                value={activeFormat.lineHeight}
                onChange={(event) =>
                  onUpdateFormat(activeSection, { lineHeight: Number(event.target.value) })
                }
              >
                {LINE_HEIGHT_OPTIONS.map((height) => (
                  <option key={height} value={height}>
                    {height}
                  </option>
                ))}
              </select>
            </label>

            <label className={styles.formatField}>
              <span className={styles.formatFieldLabel}>Paragraph spacing</span>
              <select
                className={styles.formatSelect}
                value={activeFormat.paragraphSpacing}
                onChange={(event) =>
                  onUpdateFormat(activeSection, { paragraphSpacing: Number(event.target.value) })
                }
              >
                {PARAGRAPH_SPACING_OPTIONS.map((space) => (
                  <option key={space} value={space}>
                    {space}px
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}
