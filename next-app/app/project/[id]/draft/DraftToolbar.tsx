import { type DragEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import type { DraftMode, DraftSectionId } from "@/types/draft";
import type { DraftSectionFormat } from "@/lib/draft-storage";
import {
  FONT_FAMILY_OPTIONS,
  FONT_SIZE_OPTIONS,
  LINE_HEIGHT_OPTIONS,
  PARAGRAPH_SPACING_OPTIONS,
  type SectionMeta,
} from "./draft-helpers";
import styles from "./draft-studio.module.css";

/* ------------------------------------------------------------------ */
/*  Section Tabs + Mode Toggle + Export + Save Badge                   */
/* ------------------------------------------------------------------ */

export type DraftTopBarProps = {
  projectName: string;
  activeSection: DraftSectionId | null;
  mode: DraftMode;
  canUseSectionMode: boolean;
  orderedSections: SectionMeta[];
  availableSections: SectionMeta[];
  // Drag state
  draggingKey: DraftSectionId | null;
  dragOverKey: DraftSectionId | null;
  dragOverPosition: "before" | "after" | null;
  // Refs
  sectionTabRefs: RefObject<Record<DraftSectionId, HTMLButtonElement | null>>;
  addSectionRef: RefObject<HTMLDivElement | null>;
  addSectionInputRef: RefObject<HTMLInputElement | null>;
  // Add section state
  isAddSectionOpen: boolean;
  setAddSectionOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  customSectionName: string;
  setCustomSectionName: (name: string) => void;
  // Callbacks
  onSelectSection: (key: DraftSectionId) => void;
  onSectionKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>, index: number) => void;
  onToggleMode: (mode: DraftMode) => void;
  onAddSection: (key: DraftSectionId) => void;
  onAddCustomSection: () => void;
  onRemoveSection: (key: DraftSectionId) => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>, key: DraftSectionId) => void;
  onDragOver: (event: DragEvent<HTMLButtonElement>, key: DraftSectionId) => void;
  onDrop: (event: DragEvent<HTMLButtonElement>, key: DraftSectionId) => void;
  onDragEnd: () => void;
  // Export
  hasDraftContent: boolean;
  onExportClick: () => void;
  saveStatus: "saved" | "saving" | "error";
};

export function DraftTopBar({
  activeSection,
  mode,
  canUseSectionMode,
  orderedSections,
  availableSections,
  draggingKey,
  dragOverKey,
  dragOverPosition,
  sectionTabRefs,
  addSectionRef,
  addSectionInputRef,
  isAddSectionOpen,
  setAddSectionOpen,
  customSectionName,
  setCustomSectionName,
  onSelectSection,
  onSectionKeyDown,
  onToggleMode,
  onAddSection,
  onAddCustomSection,
  onRemoveSection,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
  hasDraftContent,
  onExportClick,
  saveStatus,
  projectName,
}: DraftTopBarProps) {
  return (
    <div className={styles.top}>
      <div className={styles.topLeft}>
        <div className={styles.projectName} title={projectName}>
          {projectName}
        </div>
      </div>

      <div className={styles.topCenter}>
        <div className={styles.sectionTabsWrap}>
          <div className={styles.sectionTabs} role="tablist" aria-label="Draft sections" aria-orientation="horizontal">
            {orderedSections.map((section, index) => {
              const isDragging = draggingKey === section.id;
              const isDragOver = dragOverKey === section.id && draggingKey && draggingKey !== section.id;
              const dropClass =
                isDragOver && dragOverPosition === "after"
                  ? styles.sectionTabDropAfter
                  : isDragOver && dragOverPosition === "before"
                    ? styles.sectionTabDropBefore
                    : "";
              const canRemove = orderedSections.length > 1;
              return (
                <button
                  key={section.id}
                  type="button"
                  role="tab"
                  draggable
                  aria-grabbed={isDragging}
                  aria-selected={activeSection === section.id}
                  aria-controls={mode === "section" ? "draft-section-panel" : undefined}
                  id={`draft-tab-${section.id}`}
                  className={`${styles.sectionTab} ${activeSection === section.id ? styles.sectionTabActive : ""} ${isDragging ? styles.sectionTabDragging : ""
                    } ${dropClass}`}
                  onClick={() => onSelectSection(section.id)}
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (canRemove) onRemoveSection(section.id);
                  }}
                  onKeyDown={(event) => onSectionKeyDown(event, index)}
                  onDragStart={(event) => onDragStart(event, section.id)}
                  onDragOver={(event) => onDragOver(event, section.id)}
                  onDrop={(event) => onDrop(event, section.id)}
                  onDragEnd={onDragEnd}
                  tabIndex={activeSection === section.id ? 0 : -1}
                  title={canRemove ? "Double-click to remove" : ""}
                  ref={(el) => {
                    sectionTabRefs.current[section.id] = el;
                  }}
                >
                  {section.label}
                </button>
              );
            })}
          </div>

          <div className={styles.addSectionDivider} aria-hidden="true" />

          <div className={styles.addSectionDocked} ref={addSectionRef}>
            <button
              type="button"
              className={styles.addSectionButtonIconOnly}
              onClick={() => setAddSectionOpen((prev: boolean) => !prev)}
              aria-haspopup="menu"
              aria-expanded={isAddSectionOpen}
              aria-label="Add a section"
              title="Add a section"
            >
              <span className="material-icons-round">add</span>
            </button>
            {isAddSectionOpen ? (
              <div className={styles.sectionMenu} role="menu" aria-label="Add section">
                <div className={styles.customSectionInput}>
                  <input
                    ref={addSectionInputRef}
                    type="text"
                    placeholder="New section name..."
                    value={customSectionName}
                    onChange={(e) => setCustomSectionName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        onAddCustomSection();
                      }
                    }}
                    className={styles.customSectionField}
                  />
                  <button
                    type="button"
                    className={styles.customSectionBtn}
                    onClick={onAddCustomSection}
                    disabled={!customSectionName.trim()}
                  >
                    <span className="material-icons-round">add</span>
                  </button>
                </div>
                {availableSections.length > 0 && (
                  <div className={styles.sectionMenuDivider} />
                )}
                {availableSections.map((section) => (
                  <button
                    key={section.id}
                    type="button"
                    role="menuitem"
                    className={styles.sectionMenuItem}
                    onClick={() => onAddSection(section.id)}
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

      <div className={styles.topRight}>
        <div className={styles.modeToggle} role="group" aria-label="Draft mode">
          <button
            type="button"
            className={`${styles.modeOption} ${mode === "section" ? styles.modeActive : ""}`}
            onClick={() => onToggleMode("section")}
            aria-pressed={mode === "section"}
            disabled={!canUseSectionMode}
          >
            Section
          </button>
          <button
            type="button"
            className={`${styles.modeOption} ${mode === "full" ? styles.modeActive : ""}`}
            onClick={() => onToggleMode("full")}
            aria-pressed={mode === "full"}
          >
            Full Draft
          </button>
          <div
            className={`${styles.modeSlider} ${mode === "full" ? styles.modeSliderRight : ""}`}
            aria-hidden="true"
          />
        </div>

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

/* ------------------------------------------------------------------ */
/*  Formatting Panel                                                   */
/* ------------------------------------------------------------------ */

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
