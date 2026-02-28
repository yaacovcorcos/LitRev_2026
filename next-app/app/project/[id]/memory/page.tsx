"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { BaseBackButton } from "@/components/BaseBackButton";
import { useProjects } from "@/contexts/ProjectsContext";
import { useProjectShell } from "@/contexts/ProjectShellContext";
import { ProjectPageLayout } from "@/components/project/ProjectPageLayout";
import { ProjectMemoryProvider, useProjectMemory } from "@/contexts/ProjectMemoryContext";
import type {
  ProjectMemory,
  ProjectMemoryType,
  ProjectMemoryCategory,
  ProjectMemoryImportance,
} from "@/types/memory";
import {
  MEMORY_TYPE_LABELS,
  MEMORY_TYPE_ICONS,
  MEMORY_CATEGORY_LABELS,
  MEMORY_IMPORTANCE_LABELS,
} from "@/types/memory";
import {
  getUserMemoriesAction,
  getProjectStudyMemoriesAction,
  getPRISMAStatsAction,
  getMemoryRetrievalStatsAction,
  getMemoryQualityMetricsAction,
  getSemanticRolloutStatusAction,
  runMemoryMaintenanceAction,
} from "@/app/actions/memory";
import type { PRISMAStats } from "@/lib/server/memory/prisma-stats";
import { DemoGuideCard } from "@/components/project/DemoGuideCard";
import styles from "./memory.module.css";

// ── Types for tab data ───────────────────────────────────────────────────────

type TabId = "project" | "study" | "preferences" | "prisma" | "health";

interface UserPref {
  id: string;
  type: string;
  key: string;
  value: string;
  rationale?: string | null;
  tags: string[];
  status: string;
}

interface StudyMemoryItem {
  id: string;
  type: string;
  category?: string | null;
  content: string;
  source?: string | null;
  confidence?: number | null;
  tags: string[];
  study: { id: string; title: string; authors?: string | null; year?: number | null };
}

interface RetrievalStats {
  totalRetrievals: number;
  totalMemoriesRetrieved: number;
  avgMemoriesPerRetrieval: number;
  memoryTypeCounts: Record<string, number>;
}

interface MemoryQualityMetrics {
  retrievalHitRate: number;
  staleMemoryUsageRate: number;
  contradictionRate: number;
  proposalAcceptanceBySource: Array<{
    source: string;
    accepted: number;
    rejected: number;
    acceptanceRate: number;
  }>;
  totals: {
    retrievalEvents: number;
    retrievedMemoryMentions: number;
    staleRetrievedMentions: number;
    retrievalCount: number;
    usedInAnswerCount: number;
    acceptedCount: number;
    rejectedCount: number;
    contradictionCount: number;
  };
}

interface SemanticRolloutStatus {
  extensionInstalled: boolean;
  embeddingTablePresent: boolean;
  hnswIndexPresent: boolean;
  totalEmbeddings: number;
  model: string;
  healthy: boolean;
}

// ── Provenance helper ────────────────────────────────────────────────────────

function getProvenance(tags: string[]): { label: string; icon: string } {
  if (tags.some((t) => t.startsWith("protocol-sync:")))
    return { label: "Protocol sync", icon: "sync" };
  if (tags.includes("conversation-extracted"))
    return { label: "AI-extracted", icon: "smart_toy" };
  if (tags.includes("ai-proposed"))
    return { label: "AI-proposed", icon: "auto_awesome" };
  if (tags.includes("artifact-decision"))
    return { label: "From artifact", icon: "task_alt" };
  return { label: "User-defined", icon: "person" };
}

// ── SINGLE USER ID (matches existing pattern) ───────────────────────────────


// ── Tabs definition ──────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "project", label: "Project Memory", icon: "psychology" },
  { id: "study", label: "Study Memory", icon: "science" },
  { id: "preferences", label: "Preferences", icon: "tune" },
  { id: "prisma", label: "PRISMA Stats", icon: "analytics" },
  { id: "health", label: "Memory Health", icon: "monitor_heart" },
];

// ── Main content ─────────────────────────────────────────────────────────────

function MemoryPageContent() {
  const { id } = useParams<{ id: string }>();
  const { getProjectById } = useProjects();
  const { isEmbeddedInProjectShell } = useProjectShell();
  const project = id ? getProjectById(id) : undefined;
  const {
    filteredMemories,
    isLoading,
    error,
    filterType,
    filterCategory,
    searchQuery,
    setFilterType,
    setFilterCategory,
    setSearchQuery,
    createMemory,
    updateMemory,
    archiveMemory,
    deleteMemory,
  } = useProjectMemory();

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>("project");

  // Lazy-loaded tab data
  const [studyMemories, setStudyMemories] = useState<StudyMemoryItem[] | null>(null);
  const [userPreferences, setUserPreferences] = useState<UserPref[] | null>(null);
  const [prismaStats, setPrismaStats] = useState<PRISMAStats | null>(null);
  const [retrievalStats, setRetrievalStats] = useState<RetrievalStats | null>(null);
  const [qualityMetrics, setQualityMetrics] = useState<MemoryQualityMetrics | null>(null);
  const [rolloutStatus, setRolloutStatus] = useState<SemanticRolloutStatus | null>(null);
  const [maintenanceResult, setMaintenanceResult] = useState<string | null>(null);
  const [maintenanceRunning, setMaintenanceRunning] = useState(false);
  const [tabLoading, setTabLoading] = useState(false);

  // Study accordion state
  const [expandedStudies, setExpandedStudies] = useState<Set<string>>(new Set());

  // Form state
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formType, setFormType] = useState<ProjectMemoryType>("decision");
  const [formCategory, setFormCategory] = useState<ProjectMemoryCategory | "">("");
  const [formStatement, setFormStatement] = useState("");
  const [formRationale, setFormRationale] = useState("");
  const [formImportance, setFormImportance] = useState<ProjectMemoryImportance>("normal");
  const [showStatementError, setShowStatementError] = useState(false);

  const resetForm = () => {
    setFormType("decision");
    setFormCategory("");
    setFormStatement("");
    setFormRationale("");
    setFormImportance("normal");
    setShowStatementError(false);
  };

  // Fetch tab data on tab switch
  useEffect(() => {
    if (!id) return;

    if (activeTab === "study" && studyMemories === null) {
      setTabLoading(true);
      getProjectStudyMemoriesAction(id)
        .then((result) => setStudyMemories(result.success ? result.data as unknown as StudyMemoryItem[] : []))
        .catch(() => setStudyMemories([]))
        .finally(() => setTabLoading(false));
    }

    if (activeTab === "preferences" && userPreferences === null) {
      setTabLoading(true);
      getUserMemoriesAction({ status: "active" })
        .then((result) => setUserPreferences(result.success ? result.data as unknown as UserPref[] : []))
        .catch(() => setUserPreferences([]))
        .finally(() => setTabLoading(false));
    }

    if (activeTab === "prisma" && prismaStats === null) {
      setTabLoading(true);
      getPRISMAStatsAction(id)
        .then((result) => setPrismaStats(result.success ? result.data : null))
        .catch(() => setPrismaStats(null))
        .finally(() => setTabLoading(false));
    }

    if (activeTab === "health" && (retrievalStats === null || qualityMetrics === null || rolloutStatus === null)) {
      setTabLoading(true);
      Promise.all([
        getMemoryRetrievalStatsAction(id),
        getMemoryQualityMetricsAction(id),
        getSemanticRolloutStatusAction(),
      ])
        .then(([retrieval, quality, rollout]) => {
          setRetrievalStats(retrieval.success ? retrieval.data as RetrievalStats : null);
          setQualityMetrics(quality.success ? quality.data as MemoryQualityMetrics : null);
          setRolloutStatus(rollout.success ? rollout.data as SemanticRolloutStatus : null);
        })
        .catch(() => {
          setRetrievalStats(null);
          setQualityMetrics(null);
          setRolloutStatus(null);
        })
        .finally(() => setTabLoading(false));
    }
  }, [activeTab, id, studyMemories, userPreferences, prismaStats, retrievalStats, qualityMetrics, rolloutStatus]);

  const handleCreate = async () => {
    if (!formStatement.trim()) {
      setShowStatementError(true);
      return;
    }
    await createMemory({
      type: formType,
      category: formCategory || undefined,
      statement: formStatement.trim(),
      rationale: formRationale.trim() || undefined,
      importance: formImportance,
    });
    resetForm();
    setIsAddOpen(false);
  };

  const startEdit = (memory: ProjectMemory) => {
    setEditingId(memory.id);
    setFormType(memory.type as ProjectMemoryType);
    setFormCategory((memory.category as ProjectMemoryCategory) || "");
    setFormStatement(memory.statement);
    setFormRationale(memory.rationale || "");
    setFormImportance(memory.importance as ProjectMemoryImportance);
  };

  const handleUpdate = async () => {
    if (!editingId) return;
    if (!formStatement.trim()) {
      setShowStatementError(true);
      return;
    }
    await updateMemory(editingId, {
      statement: formStatement.trim(),
      rationale: formRationale.trim() || undefined,
      importance: formImportance,
    });
    resetForm();
    setEditingId(null);
  };

  const handleArchive = async (memId: string) => {
    await archiveMemory(memId);
  };

  const handleDelete = async (memId: string) => {
    await deleteMemory(memId);
  };

  const runMaintenance = useCallback(async (dryRun: boolean) => {
    if (!id) return;
    setMaintenanceRunning(true);
    setMaintenanceResult(null);
    try {
      const result = await runMemoryMaintenanceAction(id, { dryRun });
      if (!result.success) throw new Error(result.error);
      const data = result.data;
      const archived = `${data.archived.user + data.archived.project + data.archived.study}`;
      const candidates = `${data.candidates.user + data.candidates.project + data.candidates.study}`;
      setMaintenanceResult(
        dryRun
          ? `Dry run complete: ${candidates} low-utility memories flagged.`
          : `Maintenance complete: archived ${archived} low-utility memories.`,
      );
      const [retrieval, quality] = await Promise.all([
        getMemoryRetrievalStatsAction(id),
        getMemoryQualityMetricsAction(id),
      ]);
      setRetrievalStats(retrieval.success ? retrieval.data as RetrievalStats : null);
      setQualityMetrics(quality.success ? quality.data as MemoryQualityMetrics : null);
    } catch {
      setMaintenanceResult("Maintenance failed. Please retry.");
    } finally {
      setMaintenanceRunning(false);
    }
  }, [id]);

  const toggleStudy = (studyId: string) => {
    setExpandedStudies((prev) => {
      const next = new Set(prev);
      if (next.has(studyId)) next.delete(studyId);
      else next.add(studyId);
      return next;
    });
  };

  if (!project) {
    return (
      <ProjectPageLayout>
        <div className={styles.notFound}>
          <h1>Project not found</h1>
          <Link href="/" className="btn-minimal">Back to Dashboard</Link>
        </div>
      </ProjectPageLayout>
    );
  }

  const typeOptions: ProjectMemoryType[] = ["decision", "definition", "criterion", "goal"];
  const categoryOptions: ProjectMemoryCategory[] = ["inclusion", "exclusion", "outcome", "population", "intervention", "comparison"];

  // Group study memories by study
  const studyGroups = studyMemories
    ? Object.values(
        studyMemories.reduce(
          (acc, sm) => {
            const key = sm.study.id;
            if (!acc[key]) {
              acc[key] = { study: sm.study, memories: [] };
            }
            acc[key].memories.push(sm);
            return acc;
          },
          {} as Record<string, { study: StudyMemoryItem["study"]; memories: StudyMemoryItem[] }>,
        ),
      )
    : [];

  const statementError = showStatementError && !formStatement.trim()
    ? "Statement is required."
    : null;
  const statementErrorId = "memory-statement-error";

  return (
    <ProjectPageLayout>
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerText}>
          <div style={{ display: "flex", alignItems: "center" }}>
            {!isEmbeddedInProjectShell && <BaseBackButton href={`/project/${id}`} label="Back to project" />}
            <span className={styles.eyebrow}>Project Memory</span>
          </div>
            <h1>{project.name}</h1>
            <p className={styles.subtitle}>
              Decisions, definitions, and criteria that guide your review
            </p>
          </div>
          {activeTab === "project" && (
            <button className="header-btn" onClick={() => setIsAddOpen(true)}>
              <span className="material-icons-round">add</span>
              Add Memory
            </button>
          )}
        </header>

        <DemoGuideCard
          projectId={project.id}
          guideId="memory-context"
          text="Memory stores durable decisions and definitions that shape copilot behavior across your workflow. Update entries when your protocol or standards change."
        />

        {/* Tab Bar */}
        <div className={styles.tabBar}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="material-icons-round">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Project Memory Tab ────────────────────────────────────────── */}
        {activeTab === "project" && (
          <>
            {/* Filters */}
            <div className={styles.filters}>
              <div className={styles.searchBox}>
                <span className="material-icons-round">search</span>
                <input
                  type="text"
                  placeholder="Search memories..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <div className={styles.filterChips}>
                <button
                  className={`${styles.filterChip} ${!filterType ? styles.active : ""}`}
                  onClick={() => setFilterType(null)}
                >
                  All Types
                </button>
                {typeOptions.map((t) => (
                  <button
                    key={t}
                    className={`${styles.filterChip} ${filterType === t ? styles.active : ""}`}
                    onClick={() => setFilterType(filterType === t ? null : t)}
                  >
                    {MEMORY_TYPE_LABELS[t]}
                  </button>
                ))}
              </div>
              <div className={styles.filterChips}>
                <button
                  className={`${styles.filterChip} ${!filterCategory ? styles.active : ""}`}
                  onClick={() => setFilterCategory(null)}
                >
                  All Categories
                </button>
                {categoryOptions.map((c) => (
                  <button
                    key={c}
                    className={`${styles.filterChip} ${filterCategory === c ? styles.active : ""}`}
                    onClick={() => setFilterCategory(filterCategory === c ? null : c)}
                  >
                    {MEMORY_CATEGORY_LABELS[c]}
                  </button>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className={styles.stats}>
              <span>{filteredMemories.length} memories</span>
              {filteredMemories.filter((m) => m.importance === "critical").length > 0 && (
                <span className={styles.criticalBadge}>
                  {filteredMemories.filter((m) => m.importance === "critical").length} critical
                </span>
              )}
            </div>

            {/* Memory List */}
            <div className={styles.memoryList}>
              {isLoading ? (
                <div className={styles.emptyState}>Loading...</div>
              ) : error ? (
                <div className={styles.emptyState}>{error}</div>
              ) : filteredMemories.length === 0 ? (
                <div className={styles.emptyState}>
                  <span className="material-icons-round">psychology</span>
                  <p>No memories yet</p>
                  <p className={styles.emptyHint}>
                    Add decisions, definitions, or criteria to guide your review
                  </p>
                </div>
              ) : (
                filteredMemories.map((memory) => {
                  const prov = getProvenance(memory.tags);
                  return (
                    <div
                      key={memory.id}
                      className={`${styles.memoryCard} ${memory.importance === "critical" ? styles.critical : ""}`}
                    >
                      <div className={styles.memoryHeader}>
                        <span className={styles.memoryType}>
                          <span className="material-icons-round">{MEMORY_TYPE_ICONS[memory.type as ProjectMemoryType]}</span>
                          {MEMORY_TYPE_LABELS[memory.type as ProjectMemoryType]}
                        </span>
                        {memory.category && (
                          <span className={styles.memoryCategory}>
                            {MEMORY_CATEGORY_LABELS[memory.category as ProjectMemoryCategory]}
                          </span>
                        )}
                        <span className={styles.provenanceBadge}>
                          <span className="material-icons-round">{prov.icon}</span>
                          {prov.label}
                        </span>
                        <span className={`${styles.importanceBadge} ${styles[memory.importance]}`}>
                          {MEMORY_IMPORTANCE_LABELS[memory.importance as ProjectMemoryImportance]}
                        </span>
                      </div>
                      <p className={styles.memoryStatement}>{memory.statement}</p>
                      {memory.rationale && (
                        <p className={styles.memoryRationale}>
                          <strong>Rationale:</strong> {memory.rationale}
                        </p>
                      )}
                      <div className={styles.memoryMeta}>
                        {memory.tags.length > 0 && (
                          <div className={styles.memoryTags}>
                            {memory.tags.map((tag) => (
                              <span key={tag} className={styles.tag}>{tag}</span>
                            ))}
                          </div>
                        )}
                        <span className={styles.dateInfo}>
                          {new Date(memory.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                      <div className={styles.memoryActions}>
                        <button
                          className={styles.actionBtn}
                          onClick={() => startEdit(memory)}
                          aria-label="Edit memory"
                          title="Edit"
                        >
                          <span className="material-icons-round">edit</span>
                        </button>
                        <button
                          className={styles.actionBtn}
                          onClick={() => handleArchive(memory.id)}
                          aria-label="Archive memory"
                          title="Archive"
                        >
                          <span className="material-icons-round">archive</span>
                        </button>
                        <button
                          className={`${styles.actionBtn} ${styles.deleteBtn}`}
                          onClick={() => handleDelete(memory.id)}
                          aria-label="Delete memory"
                          title="Delete"
                        >
                          <span className="material-icons-round">delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}

        {/* ── Study Memory Tab ──────────────────────────────────────────── */}
        {activeTab === "study" && (
          <div className={styles.memoryList}>
            {tabLoading ? (
              <div className={styles.emptyState}>Loading study memories...</div>
            ) : studyGroups.length === 0 ? (
              <div className={styles.emptyState}>
                <span className="material-icons-round">science</span>
                <p>No study memories yet</p>
                <p className={styles.emptyHint}>
                  Study memories are created when studies are accepted via artifact review
                </p>
              </div>
            ) : (
              studyGroups.map(({ study, memories }) => (
                <div key={study.id} className={styles.studyGroup}>
                  <button
                    className={styles.studyGroupHeader}
                    onClick={() => toggleStudy(study.id)}
                  >
                    <span className="material-icons-round">
                      {expandedStudies.has(study.id) ? "expand_more" : "chevron_right"}
                    </span>
                    <div className={styles.studyGroupTitle}>
                      <strong>{study.title}</strong>
                      <span className={styles.studyGroupMeta}>
                        {study.authors && `${study.authors}`}
                        {study.year && `, ${study.year}`}
                        {` \u2022 ${memories.length} memories`}
                      </span>
                    </div>
                  </button>
                  {expandedStudies.has(study.id) && (
                    <div className={styles.studyGroupBody}>
                      {memories.map((sm) => (
                        <div key={sm.id} className={styles.studyMemoryCard}>
                          <div className={styles.memoryHeader}>
                            <span className={styles.memoryType}>{sm.type}</span>
                            {sm.category && (
                              <span className={styles.memoryCategory}>{sm.category}</span>
                            )}
                            {sm.confidence != null && (
                              <span className={styles.confidenceBadge}>
                                {Math.round(sm.confidence * 100)}%
                              </span>
                            )}
                            {sm.source && (
                              <span className={styles.provenanceBadge}>
                                <span className="material-icons-round">
                                  {sm.source === "ai_generated" ? "smart_toy" : "person"}
                                </span>
                                {sm.source === "ai_generated" ? "AI" : sm.source}
                              </span>
                            )}
                          </div>
                          <p className={styles.memoryStatement}>{sm.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── Preferences Tab ───────────────────────────────────────────── */}
        {activeTab === "preferences" && (
          <div className={styles.memoryList}>
            {tabLoading ? (
              <div className={styles.emptyState}>Loading preferences...</div>
            ) : !userPreferences || userPreferences.length === 0 ? (
              <div className={styles.emptyState}>
                <span className="material-icons-round">tune</span>
                <p>No preferences saved</p>
                <p className={styles.emptyHint}>
                  Preferences are learned from your editing patterns and conversation
                </p>
              </div>
            ) : (
              userPreferences.map((pref) => (
                <div key={pref.id} className={styles.preferenceCard}>
                  <div className={styles.preferenceHeader}>
                    <span className={styles.preferenceKey}>{pref.key}</span>
                    <span className={styles.provenanceBadge}>
                      <span className="material-icons-round">
                        {getProvenance(pref.tags).icon}
                      </span>
                      {getProvenance(pref.tags).label}
                    </span>
                  </div>
                  <p className={styles.preferenceValue}>{pref.value}</p>
                  {pref.rationale && (
                    <p className={styles.memoryRationale}>
                      <strong>Rationale:</strong> {pref.rationale}
                    </p>
                  )}
                </div>
              ))
            )}
          </div>
        )}

        {/* ── PRISMA Stats Tab ──────────────────────────────────────────── */}
        {activeTab === "prisma" && (
          <div className={styles.prismaSection}>
            {tabLoading ? (
              <div className={styles.emptyState}>Loading PRISMA stats...</div>
            ) : !prismaStats ? (
              <div className={styles.emptyState}>
                <span className="material-icons-round">analytics</span>
                <p>Could not load PRISMA statistics</p>
              </div>
            ) : (
              <>
                <div className={styles.prismaGrid}>
                  <div className={styles.prismaCard}>
                    <span className={styles.prismaLabel}>Identified</span>
                    <span className={styles.prismaValue}>{prismaStats.identification.total}</span>
                  </div>
                  <div className={styles.prismaCard}>
                    <span className={styles.prismaLabel}>Screened</span>
                    <span className={styles.prismaValue}>{prismaStats.screening.screened}</span>
                  </div>
                  <div className={styles.prismaCard}>
                    <span className={styles.prismaLabel}>Excluded</span>
                    <span className={`${styles.prismaValue} ${styles.prismaExcluded}`}>
                      {prismaStats.screening.excluded}
                    </span>
                  </div>
                  <div className={styles.prismaCard}>
                    <span className={styles.prismaLabel}>Included</span>
                    <span className={`${styles.prismaValue} ${styles.prismaIncluded}`}>
                      {prismaStats.included.total}
                    </span>
                  </div>
                  <div className={styles.prismaCard}>
                    <span className={styles.prismaLabel}>Pending (maybe)</span>
                    <span className={styles.prismaValue}>{prismaStats.pending.maybe}</span>
                  </div>
                  <div className={styles.prismaCard}>
                    <span className={styles.prismaLabel}>Unscreened</span>
                    <span className={styles.prismaValue}>{prismaStats.pending.unscreened}</span>
                  </div>
                </div>

                {prismaStats.screening.exclusionReasons.length > 0 && (
                  <div className={styles.exclusionSection}>
                    <h3>Exclusion Reasons</h3>
                    <table className={styles.exclusionTable}>
                      <thead>
                        <tr>
                          <th>Reason</th>
                          <th>Count</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prismaStats.screening.exclusionReasons.map((r) => (
                          <tr key={r.reason}>
                            <td>{r.reason}</td>
                            <td>{r.count}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Memory Health Tab ─────────────────────────────────────────── */}
        {activeTab === "health" && (
          <div className={styles.prismaSection}>
            {tabLoading ? (
              <div className={styles.emptyState}>Loading memory health...</div>
            ) : !retrievalStats || !qualityMetrics || !rolloutStatus ? (
              <div className={styles.emptyState}>
                <span className="material-icons-round">warning</span>
                <p>Could not load memory health metrics</p>
              </div>
            ) : (
              <>
                <div className={styles.healthActionRow}>
                  <button className="btn btn-outline" disabled={maintenanceRunning} onClick={() => runMaintenance(true)}>
                    Dry-run maintenance
                  </button>
                  <button className="btn btn-primary" disabled={maintenanceRunning} onClick={() => runMaintenance(false)}>
                    Archive low-utility memories
                  </button>
                </div>
                {maintenanceResult && <div className={styles.healthNotice}>{maintenanceResult}</div>}

                <div className={styles.prismaGrid}>
                  <div className={styles.prismaCard}>
                    <span className={styles.prismaLabel}>Retrieval Hit Rate</span>
                    <span className={styles.prismaValue}>{Math.round(qualityMetrics.retrievalHitRate * 100)}%</span>
                  </div>
                  <div className={styles.prismaCard}>
                    <span className={styles.prismaLabel}>Stale Usage Rate</span>
                    <span className={styles.prismaValue}>{Math.round(qualityMetrics.staleMemoryUsageRate * 100)}%</span>
                  </div>
                  <div className={styles.prismaCard}>
                    <span className={styles.prismaLabel}>Contradiction Rate</span>
                    <span className={styles.prismaValue}>{Math.round(qualityMetrics.contradictionRate * 100)}%</span>
                  </div>
                  <div className={styles.prismaCard}>
                    <span className={styles.prismaLabel}>Retrieval Events</span>
                    <span className={styles.prismaValue}>{retrievalStats.totalRetrievals}</span>
                  </div>
                  <div className={styles.prismaCard}>
                    <span className={styles.prismaLabel}>Memories Retrieved</span>
                    <span className={styles.prismaValue}>{retrievalStats.totalMemoriesRetrieved}</span>
                  </div>
                  <div className={styles.prismaCard}>
                    <span className={styles.prismaLabel}>Embeddings Indexed</span>
                    <span className={styles.prismaValue}>{rolloutStatus.totalEmbeddings}</span>
                  </div>
                </div>

                <div className={styles.healthStatusRow}>
                  <span className={`${styles.rolloutBadge} ${rolloutStatus.healthy ? styles.rolloutOk : styles.rolloutWarn}`}>
                    {rolloutStatus.healthy ? "pgvector rollout healthy" : "pgvector rollout needs attention"}
                  </span>
                  <span className={styles.tag}>extension: {rolloutStatus.extensionInstalled ? "ok" : "missing"}</span>
                  <span className={styles.tag}>table: {rolloutStatus.embeddingTablePresent ? "ok" : "missing"}</span>
                  <span className={styles.tag}>hnsw: {rolloutStatus.hnswIndexPresent ? "ok" : "missing"}</span>
                  <span className={styles.tag}>model: {rolloutStatus.model}</span>
                </div>

                <div className={styles.exclusionSection}>
                  <h3>Proposal Acceptance by Source</h3>
                  {qualityMetrics.proposalAcceptanceBySource.length === 0 ? (
                    <div className={styles.emptyHint}>No acceptance/rejection signals yet.</div>
                  ) : (
                    <table className={styles.exclusionTable}>
                      <thead>
                        <tr>
                          <th>Source</th>
                          <th>Accepted</th>
                          <th>Rejected</th>
                          <th>Acceptance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {qualityMetrics.proposalAcceptanceBySource.map((row) => (
                          <tr key={row.source}>
                            <td>{row.source}</td>
                            <td>{row.accepted}</td>
                            <td>{row.rejected}</td>
                            <td>{Math.round(row.acceptanceRate * 100)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Add/Edit Modal */}
        {(isAddOpen || editingId) && (
          <>
            <div
              className={styles.modalBackdrop}
              onClick={() => {
                setIsAddOpen(false);
                setEditingId(null);
                resetForm();
              }}
            />
            <div className={styles.modal}>
              <div className={styles.modalHeader}>
                <h2>{editingId ? "Edit Memory" : "Add Memory"}</h2>
                <button
                  className={styles.closeBtn}
                  onClick={() => {
                    setIsAddOpen(false);
                    setEditingId(null);
                    resetForm();
                  }}
                >
                  <span className="material-icons-round">close</span>
                </button>
              </div>
              <div className={styles.modalBody}>
                <div className={styles.formRow}>
                  <label>Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value as ProjectMemoryType)}
                    disabled={!!editingId}
                  >
                    {typeOptions.map((t) => (
                      <option key={t} value={t}>{MEMORY_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.formRow}>
                  <label>Category (optional)</label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as ProjectMemoryCategory | "")}
                    disabled={!!editingId}
                  >
                    <option value="">None</option>
                    {categoryOptions.map((c) => (
                      <option key={c} value={c}>{MEMORY_CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div className={styles.formRow}>
                  <label>Statement *</label>
                  <textarea
                    value={formStatement}
                    onChange={(e) => {
                      setFormStatement(e.target.value);
                      if (showStatementError) setShowStatementError(false);
                    }}
                    placeholder="The core statement or decision..."
                    rows={3}
                    aria-required="true"
                    aria-invalid={Boolean(statementError)}
                    aria-describedby={statementError ? statementErrorId : undefined}
                  />
                  {statementError ? (
                    <p id={statementErrorId} className={styles.formError} role="alert">
                      {statementError}
                    </p>
                  ) : null}
                </div>
                <div className={styles.formRow}>
                  <label>Rationale (optional)</label>
                  <textarea
                    value={formRationale}
                    onChange={(e) => setFormRationale(e.target.value)}
                    placeholder="Why this decision was made..."
                    rows={2}
                  />
                </div>
                <div className={styles.formRow}>
                  <label>Importance</label>
                  <div className={styles.radioGroup}>
                    {(["normal", "important", "critical"] as ProjectMemoryImportance[]).map((imp) => (
                      <label key={imp} className={styles.radioLabel}>
                        <input
                          type="radio"
                          name="importance"
                          value={imp}
                          checked={formImportance === imp}
                          onChange={() => setFormImportance(imp)}
                        />
                        {MEMORY_IMPORTANCE_LABELS[imp]}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div className={styles.modalFooter}>
                <button
                  className="btn btn-outline"
                  onClick={() => {
                    setIsAddOpen(false);
                    setEditingId(null);
                    resetForm();
                  }}
                >
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={editingId ? handleUpdate : handleCreate}
                  disabled={!formStatement.trim()}
                >
                  {editingId ? "Save Changes" : "Add Memory"}
                </button>
              </div>
            </div>
          </>
        )}
    </div>
    </ProjectPageLayout>
  );
}

export default function MemoryPage() {
  const { id } = useParams<{ id: string }>();

  if (!id) return null;

  return (
    <ProjectMemoryProvider projectId={id}>
      <MemoryPageContent />
    </ProjectMemoryProvider>
  );
}
