"use client";

import { useMemo } from "react";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import { useProjects } from "@/contexts/ProjectsContext";
import { useProjectShell } from "@/contexts/ProjectShellContext";
import { EmptyState, EmptyStateSkeleton } from "@/components/ui/EmptyState";
import Link from "next/link";
import { RecentActivityPanel } from "@/components/project/RecentActivityPanel";
import { DemoGuideCard } from "@/components/project/DemoGuideCard";
import { useFoundationRouteReady } from "@/lib/mobile/foundation-reliability";
import { useResolvedProject } from "@/hooks/useResolvedProject";
import {
  type DraftStats,
  type ProtocolStats,
  type LedgerStats,
  type ProjectOverviewStats,
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

type ProjectDetailClientProps = {
  projectId: string;
  initialOverviewStats: ProjectOverviewStats | null;
};

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

export default function ProjectDetailClient({
  projectId,
  initialOverviewStats,
}: ProjectDetailClientProps) {
  const { isLoadingProjects, projectsError } = useProjects();
  const { isEmbeddedInProjectShell } = useProjectShell();
  const { project, isResolvingProject } = useResolvedProject(projectId);

  useFoundationRouteReady({
    enabled: Boolean(project) && !isLoadingProjects && !projectsError,
    routeTemplate: "/project/[id]",
    surface: "project",
    state: "content",
    layoutMode: isEmbeddedInProjectShell ? "embedded" : "standalone",
    projectId: project?.id ?? null,
  });

  const draftStats: DraftStats | null = initialOverviewStats?.draft.data ?? null;
  const protocolStats: ProtocolStats | null = initialOverviewStats?.protocol.data ?? null;
  const ledgerStats: LedgerStats | null = initialOverviewStats?.ledger.data ?? null;
  const statsLoading = false;

  const vitalSigns = useMemo(() => {
    if (!project) return [];
    return [
      { label: "Memory", value: "Knowledge", icon: "psychology", href: `/project/${project.id}/memory` },
      { label: "Papers", value: `${totalPapersFor(project)}`, icon: "description" },
      { label: "Status", value: project.status === "harvesting" ? "In Progress" : "Ready", icon: "check_circle" },
      { label: "Modified", value: formatRelativeTime(project.modified), icon: "schedule" },
    ];
  }, [project]);

  // Loading state: show skeleton while projects are being fetched
  const shouldHoldProjectLookup =
    !project &&
    !projectsError &&
    (isLoadingProjects || isResolvingProject);

  if (shouldHoldProjectLookup) {
    const skeleton = <EmptyStateSkeleton className={styles.notFound} />;
    return isEmbeddedInProjectShell ? skeleton : <AppShell activeNav="projects">{skeleton}</AppShell>;
  }

  // Error state: fetch failed
  if (projectsError) {
    const errorView = (
      <EmptyState
        variant="error"
        icon="cloud_off"
        title="Unable to load project"
        description={projectsError}
        primaryAction={{ label: "Retry", onClick: () => window.location.reload() }}
        secondaryAction={{ label: "Back to Dashboard", href: "/" }}
        className={styles.notFound}
      />
    );
    return isEmbeddedInProjectShell ? errorView : <AppShell activeNav="projects">{errorView}</AppShell>;
  }

  // Not found: projects loaded but this one doesn't exist
  if (!project) {
    const notFoundView = (
      <EmptyState
        variant="error"
        icon="folder_off"
        title="Project not found"
        description="This project may have been deleted or you don't have access."
        primaryAction={{ label: "Back to Dashboard", href: "/" }}
        className={styles.notFound}
      />
    );
    return isEmbeddedInProjectShell ? notFoundView : <AppShell activeNav="projects">{notFoundView}</AppShell>;
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
          <RecentActivityPanel projectId={project.id} deferUntilIdle />
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

  if (isEmbeddedInProjectShell) {
    return contentJSX;
  }

  return (
    <AppShell activeNav="projects">
      {contentJSX}
    </AppShell>
  );
}
