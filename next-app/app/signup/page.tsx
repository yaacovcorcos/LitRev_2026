"use client";

import { Suspense } from "react";
import { AuthScreen } from "@/app/auth/AuthScreen";
import styles from "@/app/login/login.module.css";

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.shell}>
          <div className={styles.grainOverlay} />
          <section className={styles.content} aria-label="Create account loading">
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
            <div className={styles.card}>
              <div className={styles.cardAccent} />
              <p className={styles.subtitle}>Loading account creation options...</p>
            </div>
          </section>
        </main>
      }
    >
      <AuthScreen mode="signup" />
    </Suspense>
  );
}
