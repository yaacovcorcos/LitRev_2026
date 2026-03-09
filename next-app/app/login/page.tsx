"use client";

import { Suspense } from "react";
import { AuthScreen } from "@/app/auth/AuthScreen";
import { AuthShellFrame } from "@/app/auth/AuthShellFrame";
import styles from "./login.module.css";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <AuthShellFrame
          ariaLabel="Sign in loading"
          mode="signin"
          telemetryRouteTemplate="/login"
          telemetryState="loading"
        >
          <div className={styles.authPanel}>
            <div className={styles.card}>
              <div className={styles.cardAccent} />
              <p className={styles.subtitle}>Loading sign-in options...</p>
            </div>
          </div>
        </AuthShellFrame>
      }
    >
      <AuthScreen mode="signin" />
    </Suspense>
  );
}
