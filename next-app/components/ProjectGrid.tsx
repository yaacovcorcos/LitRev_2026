import { Project } from "@/types/project";
import Link from "next/link";
import styles from "@/components/ProjectGrid.module.css";
import { useLedger } from "@/contexts/LedgerContext";
import { isDemoProjectId } from "@/lib/demo/constants";
import { SampleReviewCard } from "@/components/project/SampleReviewCard";

type ProjectGridProps = {
  projects: Project[];
  viewMode: "grid" | "list";
  onNewProject: () => void;
  showSampleCard?: boolean;
};

export function ProjectGrid({ projects, viewMode, onNewProject, showSampleCard = true }: ProjectGridProps) {
  const { getPaperCount } = useLedger();
  const gridClass = viewMode === "list" ? `${styles.projectGrid} ${styles.listView}` : styles.projectGrid;

  return (
    <div className={gridClass}>
      <div
        className={`${styles.card} ${styles.newProjectCard} ${viewMode === "list" ? styles.listViewNewCard : ""}`}
        role="button"
        tabIndex={0}
        aria-label="Create New Project"
        onClick={onNewProject}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onNewProject();
          }
        }}
      >
        <div className={styles.newProjectContent}>
          <div className={styles.iconCircle}>
            <span className={styles.plusIcon}>+</span>
          </div>
          <div>
            <h3 className={styles.newProjectTitle}>Create New Project</h3>
            <p className={styles.newProjectCopy}>Start a new Literature Review</p>
          </div>
        </div>
      </div>

      {projects.map((p) => {
        const isHarvesting = p.status === "harvesting";
        const isList = viewMode === "list";
        const isSample = isDemoProjectId(p.id);
        const cardClass = `${styles.card} ${viewMode === "list" ? styles.listViewCard : ""}`;
        const titleClass = `${styles.projectTitle} ${viewMode === "list" ? styles.listViewCardTitle : ""}`;
        const statusClass = `${styles.cardStatus} ${isHarvesting ? styles.statusHarvesting : styles.statusReady} ${viewMode === "list" ? styles.listViewStatus : ""
          }`;
        const buttonClass = `${styles.viewProjectBtn} ${viewMode === "list" ? styles.listViewButton : ""}`;
        const paperCount = getPaperCount(p.id);
        const paperCountInline = !isList && isHarvesting;
        const statusText = isSample ? "Sample" : p.statusText;

        return (
          <Link
            key={p.id}
            href={`/project/${p.id}`}
            className={cardClass}
            data-name={p.name}
            data-modified={p.modified}
            data-created={p.created}
            data-id={p.id}
            aria-label={`Open project ${p.name}`}
          >
            {isSample ? <span className={styles.sampleBadge}>Sample</span> : null}
            <div className={statusClass}>
              {statusText}
            </div>
            <h3 className={titleClass}>{p.name}</h3>
            {isHarvesting ? (
              <div className={styles.progressSection}>
                <div className={styles.progressText}>
                  <span>{p.progress?.phase}</span>
                  <span className={styles.percentage}>{p.progress?.percent}%</span>
                </div>
                <div className={styles.progressRow}>
                  <div className={styles.progressBar}>
                    <div className={styles.progressFill} style={{ width: `${p.progress?.percent ?? 0}%` }} />
                  </div>
                  {paperCountInline ? <div className={styles.paperCountInline}>{paperCount} Papers</div> : null}
                </div>
              </div>
            ) : null}
            {!paperCountInline ? <div className={styles.paperCountBottom}>{paperCount} Papers</div> : null}
            <span className={buttonClass} data-id={p.id}>
              View Project
            </span>
          </Link>
        );
      })}
      {showSampleCard ? <SampleReviewCard viewMode={viewMode} /> : null}
    </div>
  );
}
