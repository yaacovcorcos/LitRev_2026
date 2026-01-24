"use client";

import { ReactNode, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { TopBar } from "@/components/TopBar";
import { useProjects } from "@/contexts/ProjectsContext";
import Link from "next/link";
import styles from "./project-workspace.module.css";
import { Project } from "@/types/project";

const workspaceNav = [
  { key: "overview", label: "Overview", icon: "dashboard" },
  { key: "draft", label: "Draft", icon: "edit_note" },
  { key: "library", label: "Evidence Library", icon: "article" },
  { key: "screening", label: "Screening", icon: "fact_check" },
  { key: "synthesis", label: "Synthesis", icon: "insights" },
];

const adminNav = [
  { key: "collaborators", label: "Collaborators", icon: "group" },
  { key: "exports", label: "Exports", icon: "file_upload" },
];

const evidenceCollections = [
  { label: "Clinical Trials", count: 64 },
  { label: "Systematic Reviews", count: 28 },
  { label: "Grey Literature", count: 12 },
  { label: "Datasets", count: 5 },
];

const screeningStats = [
  { label: "Queue", value: "48 papers", meta: "Need first-pass" },
  { label: "In Review", value: "16 papers", meta: "Assigned to team" },
  { label: "Flagged", value: "4 papers", meta: "Require SME" },
];

const collaboratorList = [
  { name: "Dr. Priya Iyer", role: "Domain Expert", status: "Reviewing" },
  { name: "Samir Patel", role: "Methodologist", status: "Drafting" },
  { name: "Lucia Gomez", role: "Research Ops", status: "On deck" },
];

const exportOptions = [
  { label: "Executive Summary", detail: "2 page brief", action: "Generate" },
  { label: "Evidence Matrix (CSV)", detail: "Screening decisions", action: "Download" },
  { label: "Slide Starter", detail: "Key charts", action: "Export" },
];

type WorkspacePanelProps = {
  title: string;
  actionLabel?: string;
  children: ReactNode;
};

function WorkspacePanel({ title, actionLabel, children }: WorkspacePanelProps) {
  return (
    <section className={styles.panel} aria-label={title}>
      <header className={styles.panelHeader}>
        <span>{title}</span>
        {actionLabel ? <span className={styles.panelAction}>{actionLabel}</span> : null}
      </header>
      <div className={styles.panelBody}>{children}</div>
    </section>
  );
}

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

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { getProjectById, deleteProject } = useProjects();
  const project = id ? getProjectById(id) : undefined;
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeItem, setActiveItem] = useState("overview");
  const sidebarContentId = `project-sidebar-${id ?? "unknown"}`;

  const metaCards = useMemo(() => {
    if (!project) return [];
    return [
      { label: "Status", value: project.statusText },
      { label: "Papers", value: `${totalPapersFor(project)} total` },
      { label: "Last Updated", value: formatRelativeTime(project.modified) },
      { label: "Created", value: formatDate(project.created) },
    ];
  }, [project]);

  if (!project) {
    return (
      <AppShell activeNav="projects">
        <h1>Project not found</h1>
        <Link href="/" className="btn btn-primary">
          Back to Dashboard
        </Link>
      </AppShell>
    );
  }

  const renderOverview = () => (
    <>
      <div className={styles.metaGrid}>
        {metaCards.map((card) => (
          <div key={card.label} className={styles.metaCard}>
            <span className={styles.metaLabel}>{card.label}</span>
            <span className={styles.metaValue}>{card.value}</span>
          </div>
        ))}
      </div>
      <div className={styles.workspacePanels}>
        <WorkspacePanel title="Next milestones" actionLabel="View plan">
          <ul className={styles.milestoneList}>
            <li className={styles.milestoneItem}>
              <div>
                Finalize screening schema
                <div className={styles.listMeta}>Owner: You</div>
              </div>
              <span className={styles.pill}>Due in 2 days</span>
            </li>
            <li className={styles.milestoneItem}>
              <div>
                Draft thematic summary
                <div className={styles.listMeta}>Owner: Samir</div>
              </div>
              <span className={styles.pill}>Next week</span>
            </li>
          </ul>
        </WorkspacePanel>
        <WorkspacePanel title="Recent activity" actionLabel="See all updates">
          <ul className={styles.activityList}>
            <li className={styles.activityItem}>
              <span>Lucia deduped 12 papers</span>
              <span className={styles.listMeta}>2h ago</span>
            </li>
            <li className={styles.activityItem}>
              <span>Priya added 3 AI-generated highlights</span>
              <span className={styles.listMeta}>Yesterday</span>
            </li>
            <li className={styles.activityItem}>
              <span>Samir exported Screening log</span>
              <span className={styles.listMeta}>Mon, 3:14 PM</span>
            </li>
          </ul>
        </WorkspacePanel>
        <WorkspacePanel title="Risks & blockers" actionLabel="Track issues">
          <div className={styles.callout}>
            <strong>Need SME decision</strong>
            4 flagged trials waiting for neurological review.
          </div>
          <div className={styles.callout}>
            <strong>Data coverage gap</strong>
            No post-2023 datasets for Asia-Pacific group yet.
          </div>
        </WorkspacePanel>
      </div>
    </>
  );

  const renderLibrary = () => (
    <div className={styles.workspacePanels}>
      <WorkspacePanel title="Collections" actionLabel="Manage library">
        <ul className={styles.collectionList}>
          {evidenceCollections.map((collection) => (
            <li key={collection.label} className={styles.collectionItem}>
              <span>{collection.label}</span>
              <span className={styles.badge}>{collection.count}</span>
            </li>
          ))}
        </ul>
      </WorkspacePanel>
      <WorkspacePanel title="Most cited this week">
        <div className={styles.tablePreview}>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Type</th>
                <th>Impact</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Radiopathology Trends 2024</td>
                <td>PDF</td>
                <td>High</td>
              </tr>
              <tr>
                <td>Adaptive Screening Heuristics</td>
                <td>Notes</td>
                <td>Medium</td>
              </tr>
              <tr>
                <td>Multi-modal Imaging Dataset</td>
                <td>Dataset</td>
                <td>Medium</td>
              </tr>
            </tbody>
          </table>
        </div>
      </WorkspacePanel>
    </div>
  );

  const renderScreening = () => (
    <div className={styles.workspacePanels}>
      <WorkspacePanel title="Screening pipeline" actionLabel="Adjust rules">
        <ul className={styles.simpleList}>
          {screeningStats.map((stat) => (
            <li key={stat.label} className={styles.listItem}>
              <div>
                {stat.label}
                <div className={styles.listMeta}>{stat.meta}</div>
              </div>
              <span className={styles.statValue}>{stat.value}</span>
            </li>
          ))}
        </ul>
      </WorkspacePanel>
      <WorkspacePanel title="Timeline" actionLabel="Audit log">
        <ul className={styles.timeline}>
          <li className={styles.timelineItem}>Automatic dedupe complete</li>
          <li className={styles.timelineItem}>SME review window opens</li>
          <li className={styles.timelineItem}>Synthesis draft kickoff</li>
        </ul>
      </WorkspacePanel>
    </div>
  );

  const renderSynthesis = () => (
    <div className={styles.workspacePanels}>
      <WorkspacePanel title="Key insights" actionLabel="Open editor">
        <div className={styles.gridTwo}>
          <div className={styles.callout}>
            <strong>Automation readiness</strong>
            64% of trials report measurable uplift when AI triage is paired with human QA.
          </div>
          <div className={styles.callout}>
            <strong>Data equity gap</strong>
            Only 7% of datasets include demographic overlays for rural hospitals.
          </div>
        </div>
      </WorkspacePanel>
      <WorkspacePanel title="Next writing tasks">
        <ul className={styles.simpleList}>
          <li className={styles.listItem}>
            <span>Draft methods overview</span>
            <span className={styles.listMeta}>Assigned to Samir</span>
          </li>
          <li className={styles.listItem}>
            <span>Synthesize AI bias section</span>
            <span className={styles.listMeta}>Due Friday</span>
          </li>
        </ul>
      </WorkspacePanel>
    </div>
  );

  const renderCollaborators = () => (
    <WorkspacePanel title="Team" actionLabel="Manage access">
      <ul className={styles.collabList}>
        {collaboratorList.map((collab) => (
          <li key={collab.name} className={styles.collabItem}>
            <div className={styles.collabMeta}>
              <span>{collab.name}</span>
              <span>{collab.role}</span>
            </div>
            <span className={styles.pill}>{collab.status}</span>
          </li>
        ))}
      </ul>
    </WorkspacePanel>
  );

  const renderExports = () => (
    <WorkspacePanel title="Outputs" actionLabel="History">
      <ul className={styles.exportList}>
        {exportOptions.map((option) => (
          <li key={option.label} className={styles.exportItem}>
            <div>
              <strong>{option.label}</strong>
              <div className={styles.listMeta}>{option.detail}</div>
            </div>
            <button className="btn btn-outline" type="button">
              {option.action}
            </button>
          </li>
        ))}
      </ul>
    </WorkspacePanel>
  );

  const renderActiveSection = () => {
    switch (activeItem) {
      case "library":
        return renderLibrary();
      case "screening":
        return renderScreening();
      case "synthesis":
        return renderSynthesis();
      case "collaborators":
        return renderCollaborators();
      case "exports":
        return renderExports();
      default:
        return renderOverview();
    }
  };

  return (
    <AppShell activeNav="projects" noMainPadding initiallyCollapsed>
      <div className={styles.layout} data-project-collapsed={sidebarCollapsed}>
        <aside className={`${styles.sidebar} ${sidebarCollapsed ? styles.collapsed : ""}`} aria-label="Project sidebar">
          <div className={styles.sidebarHeader}>
            <button
              className={styles.sidebarToggle}
              aria-label={sidebarCollapsed ? "Expand Project Sidebar" : "Collapse Project Sidebar"}
              aria-expanded={!sidebarCollapsed}
              aria-controls={sidebarContentId}
              onClick={() => setSidebarCollapsed((prev) => !prev)}
            >
              <span className="material-icons-round">menu_open</span>
            </button>
          </div>

          <div id={sidebarContentId} aria-hidden={sidebarCollapsed}>
            <div className={styles.summary}>
              <div className={styles.avatar}>
                <span className="material-icons-round">folder_open</span>
              </div>
              <div className={styles.sidebarText}>
                <p className="eyebrow">Project</p>
                <h3>{project.name}</h3>
                <p className={styles.sidebarDesc}>{project.description || "No description provided."}</p>
              </div>
            </div>

            <nav className={styles.nav} aria-label="Project navigation">
              <div className={styles.navGroup}>
                <h4 className={styles.navHeading}>Workspace</h4>
                {workspaceNav.map((item) => (
                  <button
                    key={item.key}
                    className={`${styles.navItem} ${activeItem === item.key ? styles.activeNav : ""}`}
                    type="button"
                    onClick={() => {
                      if (item.key === "draft") {
                        router.push(`/project/${project.id}/draft`);
                        return;
                      }
                      setActiveItem(item.key);
                    }}
                    aria-pressed={item.key === "draft" ? false : activeItem === item.key}
                    aria-label={item.label}
                  >
                    <span className={`material-icons-round ${styles.navIcon}`}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>

              <div className={styles.navGroup}>
                <h4 className={styles.navHeading}>Admin</h4>
                {adminNav.map((item) => (
                  <button
                    key={item.key}
                    className={`${styles.navItem} ${activeItem === item.key ? styles.activeNav : ""}`}
                    type="button"
                    onClick={() => setActiveItem(item.key)}
                    aria-pressed={activeItem === item.key}
                    aria-label={item.label}
                  >
                    <span className={`material-icons-round ${styles.navIcon}`}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
              </div>
            </nav>

            <div className={styles.sidebarFooter}>
              <button className={`${styles.navItem} ${styles.ghostButton}`} type="button" onClick={() => router.push("/")}>
                <span className={`material-icons-round ${styles.navIcon}`}>arrow_back</span>
                Back to Dashboard
              </button>
            </div>
          </div>
        </aside>

        <section className={styles.main} role="region" aria-label="Project workspace">
          <TopBar
            title={project.name}
            subtitle={project.description || "No description provided."}
            actions={
              <>
                <button
                  className="header-btn header-btn-primary"
                  type="button"
                  onClick={() => router.push(`/project/${project.id}/draft`)}
                >
                  <span className="material-icons-round">edit_note</span>
                  Draft
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
                  Delete Project
                </button>
              </>
            }
          />
          <div className={styles.mainBody}>{renderActiveSection()}</div>
        </section>
      </div>
    </AppShell>
  );
}
