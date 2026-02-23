"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { resetDemoProjectAction } from "@/app/actions/demo";
import { DEMO_PROJECT_ID, isDemoProjectId } from "@/lib/demo/constants";
import { useProjects } from "@/contexts/ProjectsContext";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import styles from "./DemoBanner.module.css";

type DemoBannerProps = {
  projectId: string;
};

export function DemoBanner({ projectId }: DemoBannerProps) {
  const router = useRouter();
  const { deleteProject, refresh } = useProjects();
  const [isResetting, setIsResetting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!isDemoProjectId(projectId)) return null;

  return (
    <>
      <div className={styles.banner}>
        <p className={styles.text}>
          <span className={styles.sampleLabel}>Sample</span>
          Based on Cramer et al. (2018)
        </p>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.linkBtn}
            onClick={() => router.push("/?create=new")}
          >
            New review
          </button>
          <span className={styles.divider} aria-hidden="true" />
          <button
            type="button"
            className={styles.linkBtn}
            disabled={isResetting}
            onClick={() => setConfirmReset(true)}
          >
            {isResetting ? "Resetting…" : "Reset"}
          </button>
          <button
            type="button"
            className={`${styles.linkBtn} ${styles.linkBtnDanger}`}
            disabled={isDeleting}
            onClick={() => setConfirmDelete(true)}
          >
            {isDeleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
      {resetError ? <p className={styles.errorText}>{resetError}</p> : null}
      {deleteError ? <p className={styles.errorText}>{deleteError}</p> : null}

      <ConfirmDialog
        isOpen={confirmReset}
        title="Reset sample project"
        message="This will restore the sample protocol, studies, draft, notes, memory, and copilot seed chat."
        confirmLabel="Reset"
        cancelLabel="Cancel"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          setResetError(null);
          setIsResetting(true);
          resetDemoProjectAction(DEMO_PROJECT_ID)
            .then(async () => {
              await refresh();
              window.location.assign(`/project/${DEMO_PROJECT_ID}`);
            })
            .catch((err) => {
              console.error("Reset sample project failed", err);
              setResetError("Failed to reset the sample project. Please try again.");
            })
            .finally(() => setIsResetting(false));
        }}
      />

      <ConfirmDialog
        isOpen={confirmDelete}
        title="Delete sample project"
        message="The sample project will be removed. You can recreate it later from the home empty-state button."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false);
          setDeleteError(null);
          setIsDeleting(true);
          deleteProject(DEMO_PROJECT_ID)
            .then((success) => {
              if (success) {
                router.push("/");
                return;
              }
              setDeleteError("Failed to delete the sample project. Please try again.");
            })
            .catch((err) => {
              console.error("Delete sample project failed", err);
              setDeleteError("Failed to delete the sample project. Please try again.");
            })
            .finally(() => {
              setIsDeleting(false);
            });
        }}
      />
    </>
  );
}
