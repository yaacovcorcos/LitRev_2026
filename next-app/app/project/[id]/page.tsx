"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import { useProjects } from "@/contexts/ProjectsContext";
import Link from "next/link";
import styles from "./project-workspace.module.css";
import { Project } from "@/types/project";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));

const formatRelativeTime = (value: string) => {
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  const diffMs = Date.now() - new Date(value).getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (Math.abs(diffDays) >= 1) {
    return formatter.format(-diffDays, "day");
  }
  const diffHours = Math.round(diffMs / (1000 * 60 * 60));
  return formatter.format(-diffHours, "hour");
};

const totalPapersFor = (project: Project) => project.papers ?? project.progress?.papers ?? 0;

type StatCardProps = {
  label: string;
  value: string;
  icon: string;
};

function StatCard({ label, value, icon }: StatCardProps) {
  return (
    <div className={styles.statCard}>
      <span className={`material-icons-round ${styles.statIcon}`}>{icon}</span>
      <div className={styles.statContent}>
        <span className={styles.statLabel}>{label}</span>
        <span className={styles.statValue}>{value}</span>
      </div>
    </div>
  );
}

type WorkstationCardProps = {
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  href: string;
  preview?: React.ReactNode;
};

function WorkstationCard({ title, subtitle, description, icon, href }: WorkstationCardProps) {
  const router = useRouter();

  return (
    <div
      className={styles.workstationCard}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("a")) return;
        router.push(href);
      }}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(href);
        }
      }}
    >
      <div className={styles.workstationIconCircle}>
        <span className="material-icons-round">{icon}</span>
      </div>
      <div className={styles.workstationText}>
        <span className={styles.workstationSubtitle}>{subtitle}</span>
        <h3 className={styles.workstationTitle}>{title}</h3>
        <p className={styles.workstationDesc}>{description}</p>
      </div>
      <Link href={href} className={styles.workstationAction}>
        Enter
      </Link>
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getProjectById, deleteProject } = useProjects();
  const project = id ? getProjectById(id) : undefined;

  const vitalSigns = useMemo(() => {
    if (!project) return [];
    return [
      { label: "Phase", value: project.status === "harvesting" ? "Harvesting" : "Review", icon: "flag" },
      { label: "Papers", value: `${totalPapersFor(project)}`, icon: "description" },
      { label: "Status", value: project.status === "harvesting" ? "In Progress" : "Ready", icon: "check_circle" },
      { label: "Modified", value: formatRelativeTime(project.modified), icon: "schedule" },
    ];
  }, [project]);

  if (!project) {
    return (
      <AppShell activeNav="projects">
        <div className={styles.notFound}>
          <h1>Project not found</h1>
          <Link href="/" className="btn btn-primary" style={{ width: "auto", padding: "12px 24px" }}>
            Back to Dashboard
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell activeNav="projects">
      <div className={styles.overviewLayout}>
        <TopBar
          title={project.name}
          subtitle={project.description || "No description provided."}
          actions={
            <>
              <button className="header-btn" type="button">
                <span className="material-icons-round">share</span>
                Share
              </button>
              <button
                className="header-btn header-btn-danger"
                type="button"
                onClick={() => {
                  if (confirm("Delete this project?")) {
                    deleteProject(project.id);
                    router.push("/");
                  }
                }}
              >
                <span className="material-icons-round">delete</span>
                Delete
              </button>
            </>
          }
        />

        {/* Vital Signs Row */}
        <section className={styles.vitalSignsRow}>
          {vitalSigns.map((stat) => (
            <StatCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} />
          ))}
        </section>

        {/* Workstations Grid */}
        <section className={styles.workstationsGrid}>
          <WorkstationCard
            title="Draft Workspace"
            subtitle="The Manuscript"
            description="Write your article with AI and linked evidence."
            icon="edit_note"
            href={`/project/${project.id}/draft`}
            preview={
              <div className={styles.previewStepper}>
                <span className={styles.stepDone}>Abstract ✓</span>
                <span className={styles.stepActive}>Intro ◐</span>
                <span className={styles.stepPending}>Methods ○</span>
              </div>
            }
          />
          <WorkstationCard
            title="Study Protocol"
            subtitle="The Blueprint"
            description="Define PICO, eligibility criteria, and search strategy."
            icon="assignment"
            href={`/project/${project.id}/protocol`}
            preview={
              <div className={styles.previewItem}>
                <span className="material-icons-round">edit</span>
                <span>Last: Added 3 eligibility criteria</span>
              </div>
            }
          />
          <WorkstationCard
            title="Evidence Ledger"
            subtitle="The Dataset"
            description="Manage studies, data extraction, and quality scores."
            icon="table_chart"
            href={`/project/${project.id}/ledger`}
            preview={
              <div className={styles.previewProgress}>
                <div className={styles.previewProgressBar}>
                  <div className={styles.previewProgressFill} style={{ width: "32%" }} />
                </div>
                <span>45 / 142 extracted</span>
              </div>
            }
          />
        </section>

        {/* Quick Info Panels */}
        <section className={styles.infoPanelsRow}>
          <div className={styles.infoPanel}>
            <h4 className={styles.infoPanelTitle}>Recent Activity</h4>
            <ul className={styles.activityList}>
              <li>
                <span className={styles.activityTime}>2h ago</span> You added a note to &quot;Smith et al.&quot;
              </li>
              <li><span className={styles.activityTime}>Yesterday</span> AI summarized 5 key papers</li>
              <li><span className={styles.activityTime}>2 days ago</span> Sarah uploaded 12 PDFs</li>
            </ul>
          </div>
          <div className={styles.infoPanel}>
            <h4 className={styles.infoPanelTitle}>Project Details</h4>
            <div className={styles.detailRow}>
              <span>Created</span>
              <span>{formatDate(project.created)}</span>
            </div>
            <div className={styles.detailRow}>
              <span>Type</span>
              <span>Systematic Review</span>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
