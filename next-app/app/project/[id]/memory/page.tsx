"use client";

import { useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { BaseBackButton } from "@/components/BaseBackButton";
import { useProjects } from "@/contexts/ProjectsContext";
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
import styles from "./memory.module.css";

function MemoryPageContent() {
  const { id } = useParams<{ id: string }>();
  const { getProjectById } = useProjects();
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

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form state
  const [formType, setFormType] = useState<ProjectMemoryType>("decision");
  const [formCategory, setFormCategory] = useState<ProjectMemoryCategory | "">("");
  const [formStatement, setFormStatement] = useState("");
  const [formRationale, setFormRationale] = useState("");
  const [formImportance, setFormImportance] = useState<ProjectMemoryImportance>("normal");

  const resetForm = () => {
    setFormType("decision");
    setFormCategory("");
    setFormStatement("");
    setFormRationale("");
    setFormImportance("normal");
  };

  const handleCreate = async () => {
    if (!formStatement.trim()) return;
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
    if (!editingId || !formStatement.trim()) return;
    await updateMemory(editingId, {
      statement: formStatement.trim(),
      rationale: formRationale.trim() || undefined,
      importance: formImportance,
    });
    resetForm();
    setEditingId(null);
  };

  const handleArchive = async (id: string) => {
    await archiveMemory(id);
  };

  const handleDelete = async (id: string) => {
    await deleteMemory(id);
  };

  if (!project) {
    return (
      <AppShell activeNav="projects">
        <div className={styles.notFound}>
          <h1>Project not found</h1>
          <Link href="/" className="btn-minimal">Back to Dashboard</Link>
        </div>
      </AppShell>
    );
  }

  const typeOptions: ProjectMemoryType[] = ["decision", "definition", "criterion", "goal"];
  const categoryOptions: ProjectMemoryCategory[] = ["inclusion", "exclusion", "outcome", "population", "intervention", "comparison"];

  return (
    <AppShell activeNav="projects">
      <div className={styles.page}>
        {/* Header */}
        <header className={styles.header}>
          <div className={styles.headerText}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <BaseBackButton href={`/project/${id}`} />
              <span className={styles.eyebrow}>Project Memory</span>
            </div>
            <h1>{project.name}</h1>
            <p className={styles.subtitle}>
              Decisions, definitions, and criteria that guide your review
            </p>
          </div>
          <button className="header-btn" onClick={() => setIsAddOpen(true)}>
            <span className="material-icons-round">add</span>
            Add Memory
          </button>
        </header>

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
            filteredMemories.map((memory) => (
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
                {memory.tags.length > 0 && (
                  <div className={styles.memoryTags}>
                    {memory.tags.map((tag) => (
                      <span key={tag} className={styles.tag}>{tag}</span>
                    ))}
                  </div>
                )}
                <div className={styles.memoryActions}>
                  <button
                    className={styles.actionBtn}
                    onClick={() => startEdit(memory)}
                    title="Edit"
                  >
                    <span className="material-icons-round">edit</span>
                  </button>
                  <button
                    className={styles.actionBtn}
                    onClick={() => handleArchive(memory.id)}
                    title="Archive"
                  >
                    <span className="material-icons-round">archive</span>
                  </button>
                  <button
                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                    onClick={() => handleDelete(memory.id)}
                    title="Delete"
                  >
                    <span className="material-icons-round">delete</span>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

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
                    onChange={(e) => setFormStatement(e.target.value)}
                    placeholder="The core statement or decision..."
                    rows={3}
                  />
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
    </AppShell>
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
