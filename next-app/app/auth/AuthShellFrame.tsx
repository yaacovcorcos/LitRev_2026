"use client";

import { ReactNode } from "react";
import styles from "@/app/login/login.module.css";

type AuthShellFrameProps = {
  ariaLabel: string;
  mode?: "signin" | "signup";
  children: ReactNode;
};

export function AuthShellFrame({ ariaLabel, mode, children }: AuthShellFrameProps) {
  return (
    <main
      className={`${styles.shell} surface-root`}
      data-surface-height="phone-min"
      data-auth-shell="true"
    >
      <div className={styles.grainOverlay} />
      <div className={styles.scrollFrame}>
        <section className={styles.content} aria-label={ariaLabel} data-auth-mode={mode}>
          <header className={styles.logoBlock}>
            <div className={styles.logoMark} aria-hidden="true">
              <svg viewBox="0 0 48 48" className={styles.logoSvg} fill="none">
                <path
                  d="M24 6 L24 42 M12 14 Q24 4 36 14 M10 26 Q24 18 38 26 M14 36 Q24 30 34 36"
                  strokeLinecap="round"
                />
              </svg>
            </div>
            <p className={styles.brandName}>LitRev</p>
            <p className={styles.brandSubtitle}>Literature Review Assistant</p>
          </header>
          {children}
        </section>
      </div>
    </main>
  );
}
