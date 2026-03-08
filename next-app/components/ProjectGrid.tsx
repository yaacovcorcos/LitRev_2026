import { Project } from "@/types/project";
import Link from "next/link";
import styles from "@/components/ProjectGrid.module.css";
import { isDemoProjectId } from "@/lib/demo/constants";
import { SampleReviewCard } from "@/components/project/SampleReviewCard";

type ProjectGridProps = {
  projects: Project[];
  viewMode: "grid" | "list";
  onNewProject: () => void;
  showSampleCard?: boolean;
};

export function ProjectGrid({ projects, viewMode, onNewProject, showSampleCard = true }: ProjectGridProps) {
  const gridClass = viewMode === "list" ? `${styles.projectGrid} ${styles.listView}` : styles.projectGrid;
  const classes = (...tokens: Array<string | false>) => tokens.filter(Boolean).join(" ");

  return (
    <div className={gridClass} data-view-mode={viewMode}>
      <button
        type="button"
        className={`${styles.card} ${styles.newProjectCard} ${viewMode === "list" ? styles.listViewNewCard : ""}`}
        aria-label="Create New Project"
        onClick={onNewProject}
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
      </button>

      {projects.map((p) => {
        const isHarvesting = p.status === "harvesting";
        const isList = viewMode === "list";
        const isSample = isDemoProjectId(p.id);
        const cardClass = classes(styles.card, isList && styles.listViewCard, isSample && isList && styles.sampleProjectCard);
        const titleClass = classes(styles.projectTitle, isList && styles.listViewCardTitle, isSample && isList && styles.sampleProjectTitle);
        const statusClass = classes(
          styles.cardStatus,
          isSample ? styles.statusSample : isHarvesting ? styles.statusHarvesting : styles.statusReady,
          isList && styles.listViewStatus,
        );
        const buttonClass = classes(styles.viewProjectBtn, isList && styles.listViewButton, isSample && isList && styles.sampleProjectButton);
        const paperCountClass = classes(styles.paperCountBottom, isSample && isList && styles.sampleProjectPaperCount);
        const paperCount = p.papers ?? 0;
        const paperCountInline = !isList && isHarvesting;
        const statusText = isSample ? "Sample" : p.statusText;

        return (
          <Link
            key={p.id}
            href={`/project/${p.id}`}
            prefetch={false}
            className={cardClass}
            data-name={p.name}
            data-modified={p.modified}
            data-created={p.created}
            data-id={p.id}
            aria-label={`Open project ${p.name}`}
          >
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
            {!paperCountInline ? <div className={paperCountClass}>{paperCount} Papers</div> : null}
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
