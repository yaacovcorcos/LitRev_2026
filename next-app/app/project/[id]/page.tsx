"use client";

import { useCallback, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { TopBar } from "@/components/TopBar";
import { useProjects } from "@/contexts/ProjectsContext";
import { useProjectShell } from "@/contexts/ProjectShellContext";
import Link from "next/link";
import { RecentActivityPanel } from "@/components/project/RecentActivityPanel";
import { DemoGuideCard } from "@/components/project/DemoGuideCard";
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
  href?: string;
};

function StatCard({ label, value, icon, href }: StatCardProps) {
  const content = (
    <>
      <span className={`material-icons-round ${styles.statIcon}`}>{icon}</span>
      <div className={styles.statContent}>
        <span className={styles.statLabel}>{label}</span>
        <span className={styles.statValue}>{value}</span>
      </div>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`${styles.statCard} ${styles.statCardLink}`}>
        {content}
      </Link>
    );
  }

  return <div className={styles.statCard}>{content}</div>;
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
  return (
    <Link
      href={href}
      className={styles.workstationCard}
    >
      <div className={styles.workstationIconCircle}>
        <span className="material-icons-round">{icon}</span>
      </div>
      <div className={styles.workstationText}>
        <span className={styles.workstationSubtitle}>{subtitle}</span>
        <h3 className={styles.workstationTitle}>{title}</h3>
        <p className={styles.workstationDesc}>{description}</p>
      </div>
      <span className={styles.workstationAction}>
        Enter
      </span>
    </Link>
  );
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getProjectById, deleteProject } = useProjects();
  const { isEmbeddedInProjectShell } = useProjectShell();
  const project = id ? getProjectById(id) : undefined;
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const closeDeleteModal = useCallback(() => setIsDeleteOpen(false), []);

  const vitalSigns = useMemo(() => {
    if (!project) return [];
    return [
      { label: "Memory", value: "Knowledge", icon: "psychology", href: `/project/${project.id}/memory` },
      { label: "Papers", value: `${totalPapersFor(project)}`, icon: "description" },
      { label: "Status", value: project.status === "harvesting" ? "In Progress" : "Ready", icon: "check_circle" },
      { label: "Modified", value: formatRelativeTime(project.modified), icon: "schedule" },
    ];
  }, [project]);

  if (!project) {
    if (isEmbeddedInProjectShell) {
      return (
        <div className={styles.notFound}>
          <h1>Project not found</h1>
          <Link href="/" className="btn-minimal">
            Back to Dashboard
          </Link>
        </div>
      );
    }
    return (
      <AppShell activeNav="projects">
        <div className={styles.notFound}>
          <h1>Project not found</h1>
          <Link href="/" className="btn-minimal">
            Back to Dashboard
          </Link>
        </div>
      </AppShell>
    );
  }

  const contentJSX = (
    <div className={styles.overviewLayout} style={isEmbeddedInProjectShell ? { padding: "24px" } : undefined}>
      <TopBar
        title={project.name}
        subtitle={project.description || "No description provided."}
        actions={
          <>
            <button
              className={styles.deleteBtn}
              type="button"
              title="Delete project"
              aria-label="Delete project"
              onClick={() => {
                setIsDeleteOpen(true);
              }}
            >
              <span className="material-icons-round">delete_outline</span>
            </button>
          </>
        }
      />

      <DemoGuideCard
        projectId={project.id}
        guideId="overview-hub"
        text="This overview is your command center. Follow the workstation order: Protocol → Ledger → Draft to keep evidence traceable."
      />

      {/* Vital Signs Row */}
      <section className={styles.vitalSignsRow}>
        {vitalSigns.map((stat) => (
          <StatCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} href={stat.href} />
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
          <RecentActivityPanel projectId={project.id} />
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
  );

  const deleteModal = (
    <Modal isOpen={isDeleteOpen} onClose={closeDeleteModal} ariaLabelledBy="deleteProjectTitle">
      <div className="modal-header">
        <h2 id="deleteProjectTitle">Delete project</h2>
        <button className="close-modal-btn" aria-label="Close dialog" onClick={closeDeleteModal}>
          <span className="material-icons-round">close</span>
        </button>
      </div>
      <div className="modal-body">
        <p>
          This will permanently delete <strong>{project.name}</strong> and all related data. This action cannot be
          undone.
        </p>
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-outline cancel-btn" onClick={closeDeleteModal}>
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-danger"
          onClick={() => {
            closeDeleteModal();
            deleteProject(project.id);
            router.push("/");
          }}
        >
          Delete project
        </button>
      </div>
    </Modal>
  );

  if (isEmbeddedInProjectShell) {
    return (
      <>
        {contentJSX}
        {deleteModal}
      </>
    );
  }

  return (
    <AppShell activeNav="projects">
      {contentJSX}
      {deleteModal}
    </AppShell>
  );
}
