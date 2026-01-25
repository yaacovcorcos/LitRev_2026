import { Project } from "@/types/project";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/components/ProjectGrid.module.css";
import { useLedger } from "@/contexts/LedgerContext";

type ProjectGridProps = {
  projects: Project[];
  viewMode: "grid" | "list";
  onNewProject: () => void;
};

export function ProjectGrid({ projects, viewMode, onNewProject }: ProjectGridProps) {
  const router = useRouter();
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
        const cardClass = `${styles.card} ${viewMode === "list" ? styles.listViewCard : ""}`;
        const titleClass = `${styles.projectTitle} ${viewMode === "list" ? styles.listViewCardTitle : ""}`;
        const statusClass = `${styles.cardStatus} ${isHarvesting ? styles.statusHarvesting : styles.statusReady} ${viewMode === "list" ? styles.listViewStatus : ""
          }`;
        const buttonClass = `${styles.viewProjectBtn} ${viewMode === "list" ? styles.listViewButton : ""}`;
        const paperCount = getPaperCount(p.id);
        const paperCountInline = !isList && isHarvesting;

        return (
          <div
            key={p.id}
            className={cardClass}
            data-name={p.name}
            data-modified={p.modified}
            data-created={p.created}
            data-id={p.id}
            role="link"
            tabIndex={0}
            aria-label={`Open project ${p.name}`}
            onClick={(event) => {
              const target = event.target as HTMLElement;
              if (target.closest("a")) return;
              router.push(`/project/${p.id}`);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                router.push(`/project/${p.id}`);
              }
            }}
          >
            <div className={statusClass}>
              {p.statusText}
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
                <p className={styles.metaInfo}>Last modified recently.</p>
              </div>
            ) : null}
            {!paperCountInline ? <div className={styles.paperCountBottom}>{paperCount} Papers</div> : null}
            <Link href={`/project/${p.id}`} className={buttonClass} data-id={p.id}>
              View Project
            </Link>
          </div>
        );
      })}
    </div>
  );
}
