"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/components/ProjectGrid.module.css";
import { openOrCreateDemoProjectAction } from "@/app/actions/demo";
import { useProjects } from "@/contexts/ProjectsContext";
import { isDemoProject } from "@/lib/demo/constants";
import { dismissSampleCard, isSampleCardDismissed } from "@/lib/demo/sample-card";
import { isAuthError, redirectToLogin } from "@/lib/action-client";

type SampleReviewCardProps = {
  viewMode: "grid" | "list";
};

export function SampleReviewCard({ viewMode }: SampleReviewCardProps) {
  const { projects, refresh } = useProjects();
  const router = useRouter();
  const [dismissed, setDismissed] = useState(() => isSampleCardDismissed());
  const [isOpening, setIsOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpen = useCallback(async () => {
    setIsOpening(true);
    setError(null);
    try {
      const result = await openOrCreateDemoProjectAction();
      if (!result.success) {
        if (isAuthError(result)) { redirectToLogin(); return; }
        const existingSample = projects.find((project) => isDemoProject(project));
        if (existingSample) {
          router.push(`/project/${existingSample.id}`);
          return;
        }
        setError("Unable to open sample review. Please try again.");
        return;
      }
      await refresh();
      router.push(`/project/${result.data.id}`);
    } catch {
      const existingSample = projects.find((project) => isDemoProject(project));
      if (existingSample) {
        router.push(`/project/${existingSample.id}`);
        return;
      }
      setError("Unable to open sample review. Please try again.");
    } finally {
      setIsOpening(false);
    }
  }, [projects, refresh, router]);

  const handleDismiss = useCallback(() => {
    dismissSampleCard();
    setDismissed(true);
  }, []);

  const demoAlreadyExists = projects.some((project) => isDemoProject(project));
  if (dismissed || demoAlreadyExists) return null;

  const cardClass = [
    styles.card,
    styles.sampleEntryCard,
    viewMode === "list" ? styles.sampleEntryListCard : styles.sampleEntryGridCard,
  ].join(" ");

  return (
    <div className={cardClass}>
      <button
        type="button"
        className={styles.sampleEntryOpenBtn}
        aria-label="Open sample review"
        aria-busy={isOpening || undefined}
        onClick={() => {
          if (isOpening) return;
          void handleOpen();
        }}
      >
        <span className={styles.sampleEntryBadge}>Sample</span>
        <div className={styles.sampleEntryContent}>
          <div className={styles.sampleEntryIcon}>
            <span className="material-icons-round" aria-hidden>
              science
            </span>
          </div>
          <div className={styles.sampleEntryBody}>
            <p className={styles.sampleEntryEyebrow}>Guided example</p>
            <h3 className={styles.sampleEntryTitle}>{isOpening ? "Opening..." : "Explore Sample Review"}</h3>
            <p className={styles.sampleEntryCopy}>Based on Cramer et al. (2018): Yoga for Anxiety</p>
          </div>
        </div>
        {error ? <p className={styles.sampleEntryError} role="alert">{error}</p> : null}
      </button>
      <button
        type="button"
        className={styles.sampleEntryDismissBtn}
        aria-label="Dismiss sample review card"
        onClick={handleDismiss}
      >
        <span className="material-icons-round">close</span>
      </button>
    </div>
  );
}
