"use client";

import styles from "./draft-studio.module.css";

export type UtilityPaneMode = "closed" | "outline" | "evidence";

type DraftUtilityDockProps = {
  activeMode: UtilityPaneMode;
  evidenceCount: number;
  onToggleMode: (mode: Exclude<UtilityPaneMode, "closed">) => void;
};

export function DraftUtilityDock({
  activeMode,
  evidenceCount,
  onToggleMode,
}: DraftUtilityDockProps) {
  return (
    <div className={styles.utilityDock} aria-label="Draft tools">
      <button
        type="button"
        className={`${styles.utilityDockButton} ${activeMode === "outline" ? styles.utilityDockButtonActive : ""}`}
        aria-label="Toggle outline drawer"
        aria-pressed={activeMode === "outline"}
        title="Outline"
        onClick={() => onToggleMode("outline")}
      >
        <span className="material-icons-round">toc</span>
      </button>

      <button
        type="button"
        className={`${styles.utilityDockButton} ${activeMode === "evidence" ? styles.utilityDockButtonActive : ""}`}
        aria-label="Toggle evidence drawer"
        aria-pressed={activeMode === "evidence"}
        title="Evidence"
        onClick={() => onToggleMode("evidence")}
      >
        <span className="material-icons-round">menu_book</span>
        {evidenceCount > 0 ? <span className={styles.utilityDockBadge}>{evidenceCount}</span> : null}
      </button>
    </div>
  );
}
