"use client";

import { useEffect, useMemo, useState } from "react";
import { isDemoProject } from "@/lib/demo/constants";
import { useProjects } from "@/contexts/ProjectsContext";
import styles from "./DemoGuideCard.module.css";

type DemoGuideCardProps = {
  projectId: string;
  guideId: string;
  text: string;
  className?: string;
};

export function DemoGuideCard({ projectId, guideId, text, className }: DemoGuideCardProps) {
  const { getProjectById } = useProjects();
  const project = getProjectById(projectId);
  const [hasMounted, setHasMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const storageKey = useMemo(
    () => `litrev:demo-guide-dismissed:${projectId}:${guideId}`,
    [projectId, guideId]
  );

  useEffect(() => {
    setHasMounted(true);
    if (!isDemoProject(project)) return;
    try {
      setDismissed(window.localStorage.getItem(storageKey) === "1");
    } catch {
      setDismissed(false);
    }
  }, [project, storageKey]);

  if (!hasMounted || dismissed || !isDemoProject(project)) {
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
