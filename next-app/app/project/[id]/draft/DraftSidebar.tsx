"use client";

import { useEffect, useId } from "react";
import type { ReactNode } from "react";
import styles from "./draft-studio.module.css";

export type DraftSidebarView = "sections" | "evidence";

type DraftSidebarProps = {
  collapsed: boolean;
  activeView: DraftSidebarView;
  isOverlay: boolean;
  onToggleCollapsed: () => void;
  onDismiss: () => void;
  onViewChange: (view: DraftSidebarView) => void;
  sectionsPane: ReactNode;
  evidencePane: ReactNode;
};

export function DraftSidebar({
  collapsed,
  activeView,
  isOverlay,
  onToggleCollapsed,
  onDismiss,
  onViewChange,
  sectionsPane,
  evidencePane,
}: DraftSidebarProps) {
  const sectionsPanelId = useId();
  const evidencePanelId = useId();
  const overlayOpen = isOverlay && !collapsed;

  useEffect(() => {
    if (!overlayOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onDismiss, overlayOpen]);

  return (
    <>
      {overlayOpen ? (
        <button
          type="button"
          className={styles.sidebarScrim}
          aria-label="Close draft sidebar overlay"
          onClick={onDismiss}
        />
      ) : null}

      <aside
        className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""} ${isOverlay ? styles.sidebarOverlay : ""}`}
        aria-label="Draft sidebar"
        data-overlay={overlayOpen ? "true" : "false"}
      >
        <div className={styles.sidebarHeader}>
          <div className={styles.sidebarSegmentControl} role="tablist" aria-label="Draft sidebar views">
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "sections"}
              aria-controls={sectionsPanelId}
              className={activeView === "sections" ? styles.segmentActive : ""}
              onClick={() => onViewChange("sections")}
            >
              Sections
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeView === "evidence"}
              aria-controls={evidencePanelId}
              className={activeView === "evidence" ? styles.segmentActive : ""}
              onClick={() => onViewChange("evidence")}
            >
              Evidence
            </button>
          </div>

          <button
            type="button"
            className={styles.sidebarToggleBtn}
            aria-label={collapsed ? "Open draft sidebar" : "Collapse draft sidebar"}
            onClick={onToggleCollapsed}
          >
            <span className="material-icons-round">{collapsed ? "keyboard_double_arrow_right" : "keyboard_double_arrow_left"}</span>
          </button>
        </div>

        {!collapsed ? (
          <div className={styles.sidebarContent}>
            <div
              id={sectionsPanelId}
              role="tabpanel"
              aria-label="Sections sidebar panel"
              hidden={activeView !== "sections"}
            >
              {sectionsPane}
            </div>
            <div
              id={evidencePanelId}
              role="tabpanel"
              aria-label="Evidence sidebar panel"
              hidden={activeView !== "evidence"}
            >
              {evidencePane}
            </div>
          </div>
        ) : (
          <div className={styles.sidebarCollapsedRail}>
            <button
              type="button"
              className={`${styles.sidebarRailBtn} ${activeView === "sections" ? styles.sidebarRailBtnActive : ""}`}
              aria-label="Show sections"
              onClick={() => {
                onViewChange("sections");
                onToggleCollapsed();
              }}
            >
              <span className="material-icons-round">toc</span>
            </button>
            <button
              type="button"
              className={`${styles.sidebarRailBtn} ${activeView === "evidence" ? styles.sidebarRailBtnActive : ""}`}
              aria-label="Show evidence"
              onClick={() => {
                onViewChange("evidence");
                onToggleCollapsed();
              }}
            >
              <span className="material-icons-round">library_books</span>
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
