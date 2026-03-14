"use client";

import type { ReactNode } from "react";
import type { UtilityPaneMode } from "./DraftUtilityDock";
import styles from "./draft-studio.module.css";

type DraftUtilityDrawerProps = {
  mode: Exclude<UtilityPaneMode, "closed">;
  isPhone: boolean;
  onClose: () => void;
  children: ReactNode;
};

export function DraftUtilityDrawer({
  mode,
  isPhone,
  onClose,
  children,
}: DraftUtilityDrawerProps) {
  const ariaLabel = mode === "outline" ? "Draft outline" : "Section evidence";

  return (
    <div className={styles.drawerOverlay} role="presentation">
      <button
        type="button"
        className={styles.drawerBackdrop}
        aria-label="Close draft drawer"
        onClick={onClose}
      />
      <div
        className={`${styles.drawerPanel} ${styles.drawerPanelLeft} ${isPhone ? styles.drawerPanelPhone : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        {children}
      </div>
    </div>
  );
}
