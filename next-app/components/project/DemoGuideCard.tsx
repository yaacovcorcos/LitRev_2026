"use client";

import { useState } from "react";
import { isDemoProject } from "@/lib/demo/constants";
import { useProjects } from "@/contexts/ProjectsContext";
import { useHydrated } from "@/hooks/useHydrated";
import styles from "./DemoGuideCard.module.css";

type DemoGuideCardProps = {
  projectId: string;
  guideId: string;
  text: string;
  className?: string;
};

function readDismissed(storageKey: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

type DemoGuideCardBodyProps = {
  storageKey: string;
  text: string;
  className?: string;
};

function DemoGuideCardBody({ storageKey, text, className }: DemoGuideCardBodyProps) {
  const [dismissed, setDismissed] = useState(false);
  const [initiallyDismissed] = useState(() => readDismissed(storageKey));

  if (dismissed || initiallyDismissed) {
    return null;
  }

  return (
    <aside className={`${styles.card} ${className ?? ""}`.trim()} aria-label="Guide note">
      <p className={styles.label}>Guide</p>
      <p className={styles.text}>{text}</p>
      <button
        type="button"
        className={styles.dismiss}
        aria-label="Dismiss guide note"
        onClick={() => {
          setDismissed(true);
          try {
            window.localStorage.setItem(storageKey, "1");
          } catch {
            // Ignore storage failures; UI dismissal still applies for current session.
          }
        }}
      >
        <span className="material-icons-round" style={{ fontSize: 16 }}>
          close
        </span>
      </button>
    </aside>
  );
}

export function DemoGuideCard({ projectId, guideId, text, className }: DemoGuideCardProps) {
  const hydrated = useHydrated();
  const { getProjectById } = useProjects();
  const project = getProjectById(projectId);
  const storageKey = `litrev:demo-guide-dismissed:${projectId}:${guideId}`;

  if (!hydrated || !isDemoProject(project)) {
    return null;
  }

  return (
    <DemoGuideCardBody
      key={storageKey}
      storageKey={storageKey}
      text={text}
      className={className}
    />
  );
}
