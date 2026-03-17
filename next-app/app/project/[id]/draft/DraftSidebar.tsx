"use client";

import { useEffect, type ReactNode } from "react";
import styles from "./draft-studio.module.css";

type DraftSidebarProps = {
  collapsed: boolean;
  isOverlay: boolean;
  onToggleCollapsed: () => void;
  onDismiss: () => void;
  children: ReactNode;
};

export function DraftSidebar({
  collapsed,
  isOverlay,
  onToggleCollapsed,
  onDismiss,
  children,
}: DraftSidebarProps) {
  const overlayOpen = isOverlay && !collapsed;

  useEffect(() => {
    if (!overlayOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onDismiss();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onDismiss, overlayOpen]);

  return (
    <>
      {overlayOpen ? (
        <button
          type="button"
          className={styles.sidebarScrim}
          aria-label="Close evidence ledger overlay"
          onClick={onDismiss}
        />
      ) : null}

      {collapsed ? (
        <div className={styles.collapsedRailLeft} aria-label="Evidence ledger (collapsed)">
          <button
            type="button"
            className={styles.panelToggle}
            aria-label="Expand evidence ledger"
            onClick={onToggleCollapsed}
          >
            <span className="material-icons-round">menu_open</span>
          </button>
          <span className={styles.collapsedLabel}>Evidence</span>
        </div>
      ) : (
        <aside
          className={`${styles.ledger} ${isOverlay ? styles.sidebarOverlay : ""}`}
          aria-label="Evidence ledger"
          data-overlay={overlayOpen ? "true" : "false"}
        >
          {children}
        </aside>
      )}
    </>
  );
}
