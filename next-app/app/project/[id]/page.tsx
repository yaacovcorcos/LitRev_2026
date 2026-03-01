"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { Modal } from "@/components/Modal";
import { TopBar } from "@/components/TopBar";
import { useProjects } from "@/contexts/ProjectsContext";
import { useProjectShell } from "@/contexts/ProjectShellContext";
import Link from "next/link";
import { RecentActivityPanel } from "@/components/project/RecentActivityPanel";
import { DemoGuideCard } from "@/components/project/DemoGuideCard";
import {
  getDraftStatsAction, type DraftStats,
  getProtocolStatsAction, type ProtocolStats,
  getLedgerStatsAction, type LedgerStats,
} from "@/app/actions/stats";
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

function WorkstationCard({ title, subtitle, description, icon, href, preview }: WorkstationCardProps) {
  return (
    <Link
      href={href}
      className={styles.workstationCard}
    >
      <div className={styles.workstationHeader}>
        <div className={styles.workstationIconCircle}>
          <span className="material-icons-round">{icon}</span>
        </div>
        {preview && <div className={styles.workstationBadge}>{preview}</div>}
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

function PreviewSkeleton() {
  return <div className={styles.previewSkeleton} />;
}

function DraftPreview({ stats }: { stats: DraftStats }) {
  const shown = stats.sections.slice(0, 4);
  return (
    <div className={styles.previewStepper}>
      {shown.map((s) => (
        <span
          key={s.key}
          className={s.hasContent ? styles.stepDone : styles.stepPending}
        >
          {s.label} {s.hasContent ? "\u2713" : "\u25CB"}
        </span>
      ))}
      {stats.totalCount > 4 && (
        <span className={styles.stepPending}>+{stats.totalCount - 4}</span>
      )}
    </div>
  );
}

function ProtocolPreview({ stats }: { stats: ProtocolStats }) {
  if (stats.criteriaCount === 0 && !stats.hasResearchQuestion) {
    return (
      <div className={styles.previewItem}>
        <span className="material-icons-round">info_outline</span>
        <span>Not started yet</span>
      </div>
    );
  }
  return (
    <div className={styles.previewItem}>
      <span className="material-icons-round">checklist</span>
      <span>{stats.criteriaCount} eligibility criteria defined</span>
    </div>
  );
}

function LedgerPreview({ stats }: { stats: LedgerStats }) {
  const pct = stats.totalStudies > 0
    ? Math.round((stats.extractedCount / stats.totalStudies) * 100)
    : 0;
  return (
    <div className={styles.previewProgress}>
      <div className={styles.previewProgressBar}>
        <div className={styles.previewProgressFill} style={{ width: `${pct}%` }} />
      </div>
      <span>{stats.extractedCount} / {stats.totalStudies} extracted</span>
    </div>
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

  const [draftStats, setDraftStats] = useState<DraftStats | null>(null);
  const [protocolStats, setProtocolStats] = useState<ProtocolStats | null>(null);
  const [ledgerStats, setLedgerStats] = useState<LedgerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    if (!project) return;
    const projectId = project.id;
    let cancelled = false;

    // Reset to loading state so stale data from a previous project is never shown
    setDraftStats(null);
    setProtocolStats(null);
    setLedgerStats(null);
    setStatsLoading(true);

    async function load() {
      const [draftRes, protocolRes, ledgerRes] = await Promise.all([
        getDraftStatsAction(projectId),
        getProtocolStatsAction(projectId),
        getLedgerStatsAction(projectId),
      ]);

      if (cancelled) return;
      setDraftStats(draftRes.success ? draftRes.data : null);
      setProtocolStats(protocolRes.success ? protocolRes.data : null);
      setLedgerStats(ledgerRes.success ? ledgerRes.data : null);
      setStatsLoading(false);
    }

    load().catch(() => {
      if (!cancelled) setStatsLoading(false);
    });

    return () => { cancelled = true; };
  }, [project?.id]);

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

  const draftPreview = statsLoading
    ? <PreviewSkeleton />
    : draftStats
      ? <DraftPreview stats={draftStats} />
      : null;

  const protocolPreview = statsLoading
    ? <PreviewSkeleton />
    : protocolStats
      ? <ProtocolPreview stats={protocolStats} />
      : null;

  const ledgerPreview = statsLoading
    ? <PreviewSkeleton />
    : ledgerStats
      ? <LedgerPreview stats={ledgerStats} />
      : null;

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
          preview={draftPreview}
        />
        <WorkstationCard
          title="Study Protocol"
          subtitle="The Blueprint"
          description="Define PICO, eligibility criteria, and search strategy."
          icon="assignment"
          href={`/project/${project.id}/protocol`}
          preview={protocolPreview}
        />
        <WorkstationCard
          title="Evidence Ledger"
          subtitle="The Dataset"
          description="Manage studies, data extraction, and quality scores."
          icon="table_chart"
          href={`/project/${project.id}/ledger`}
          preview={ledgerPreview}
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
