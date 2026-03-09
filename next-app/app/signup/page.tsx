"use client";

import { Suspense } from "react";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { AuthShellFrame } from "@/app/auth/AuthShellFrame";
import styles from "@/app/login/login.module.css";

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <AuthShellFrame
          ariaLabel="Create account loading"
          mode="signup"
          telemetryRouteTemplate="/signup"
          telemetryState="loading"
        >
          <div className={styles.authPanel}>
            <div className={styles.card}>
              <div className={styles.cardAccent} />
              <p className={styles.subtitle}>Loading account creation options...</p>
            </div>
          </div>
        </AuthShellFrame>
      }
    >
      <AuthScreen mode="signup" />
    </Suspense>
  );
}
