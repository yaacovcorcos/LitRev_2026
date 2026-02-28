"use client";

import styles from "./ErrorFallback.module.css";

type ErrorFallbackProps = {
  message: string;
  onRetry: () => void;
  title?: string;
  retryLabel?: string;
};

export function ErrorFallback({
  message,
  onRetry,
  title = "Something went wrong",
  retryLabel = "Try again",
}: ErrorFallbackProps) {
  return (
    <div className={styles.root} role="alert" aria-live="polite">
      <span className={`material-icons-round ${styles.icon}`} aria-hidden="true">
        error_outline
      </span>
      <h2 className={styles.title}>{title}</h2>
      <p className={styles.message}>{message}</p>
      <button type="button" className={styles.retryButton} onClick={onRetry}>
        {retryLabel}
      </button>
    </div>
  );
}
