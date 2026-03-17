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
        className={`${collapsed ? styles.collapsedRailLeft : styles.ledger} ${isOverlay ? styles.sidebarOverlay : ""}`}
        aria-label={collapsed ? "Draft sidebar (collapsed)" : "Draft sidebar"}
        data-overlay={overlayOpen ? "true" : "false"}
      >
        {!collapsed ? (
          <>
            <div className={styles.sidebarHeaderRow}>
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
                className={styles.panelToggle}
                aria-label="Collapse draft sidebar"
                onClick={onToggleCollapsed}
              >
                <span className="material-icons-round">keyboard_double_arrow_left</span>
              </button>
            </div>

            <div
              id={sectionsPanelId}
              role="tabpanel"
              aria-label="Sections sidebar panel"
              hidden={activeView !== "sections"}
              className={styles.sidebarPanel}
            >
              {sectionsPane}
            </div>

            <div
              id={evidencePanelId}
              role="tabpanel"
              aria-label="Evidence sidebar panel"
              hidden={activeView !== "evidence"}
              className={styles.sidebarPanel}
            >
              {evidencePane}
            </div>
          </>
        ) : (
          <div className={styles.collapsedRailButtons}>
            <button
              type="button"
              className={`${styles.panelToggle} ${activeView === "sections" ? styles.panelToggleActive : ""}`}
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
              className={`${styles.panelToggle} ${activeView === "evidence" ? styles.panelToggleActive : ""}`}
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
