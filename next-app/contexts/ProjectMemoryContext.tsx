"use client";

/**
 * Project Memory Context
 * Manages project memory state with CRUD operations
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  ProjectMemory,
  ProjectMemoryType,
  ProjectMemoryCategory,
  ProjectMemoryImportance,
} from "@/types/memory";
import {
  getProjectMemoriesAction,
  createProjectMemoryAction,
  updateProjectMemoryAction,
  archiveProjectMemoryAction,
  deleteProjectMemoryAction,
  type CreateProjectMemoryInput,
  type UpdateProjectMemoryInput,
} from "@/app/actions/memory";
import { addProjectDataChangedListener } from "@/lib/project-data-events";

type ProjectMemoryContextValue = {
  memories: ProjectMemory[];
  isLoading: boolean;
  error: string | null;
  // Filters
  filterType: ProjectMemoryType | null;
  filterCategory: ProjectMemoryCategory | null;
  filterImportance: ProjectMemoryImportance | null;
  searchQuery: string;
  setFilterType: (type: ProjectMemoryType | null) => void;
  setFilterCategory: (category: ProjectMemoryCategory | null) => void;
  setFilterImportance: (importance: ProjectMemoryImportance | null) => void;
  setSearchQuery: (query: string) => void;
  // Filtered memories
  filteredMemories: ProjectMemory[];
  // CRUD
  createMemory: (input: Omit<CreateProjectMemoryInput, "projectId">) => Promise<ProjectMemory>;
  updateMemory: (id: string, input: UpdateProjectMemoryInput) => Promise<ProjectMemory>;
  archiveMemory: (id: string) => Promise<void>;
  deleteMemory: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const ProjectMemoryContext = createContext<ProjectMemoryContextValue | undefined>(undefined);

type ProjectMemoryProviderProps = {
  projectId: string;
  children: ReactNode;
  /** Pre-fetched memories from ProjectDataProvider — skips initial server fetch when provided. */
  initialData?: ProjectMemory[];
};

export function ProjectMemoryProvider({ projectId, children, initialData }: ProjectMemoryProviderProps) {
  const [memories, setMemories] = useState<ProjectMemory[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [filterType, setFilterType] = useState<ProjectMemoryType | null>(null);
  const [filterCategory, setFilterCategory] = useState<ProjectMemoryCategory | null>(null);
  const [filterImportance, setFilterImportance] = useState<ProjectMemoryImportance | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Load memories
  const loadMemories = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await getProjectMemoriesAction(projectId, { status: "active" });
      if (!result.success) throw new Error(result.error);
      setMemories(result.data as ProjectMemory[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memories");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (initialData && initialData.length > 0) {
      setMemories(initialData);
      setIsLoading(false);
      return;
    }
    loadMemories();
  }, [loadMemories, initialData]);

  useEffect(() => {
    return addProjectDataChangedListener((detail) => {
      if (detail.projectId !== projectId) return;
      if (!detail.domains.includes("memory")) return;
      void loadMemories();
    });
  }, [projectId, loadMemories]);

  // Filtered memories
  const filteredMemories = useMemo(() => {
    let result = memories;

    if (filterType) {
      result = result.filter((m) => m.type === filterType);
    }
    if (filterCategory) {
      result = result.filter((m) => m.category === filterCategory);
    }
    if (filterImportance) {
      result = result.filter((m) => m.importance === filterImportance);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (m) =>
          m.statement.toLowerCase().includes(q) ||
          m.rationale?.toLowerCase().includes(q) ||
          m.context?.toLowerCase().includes(q) ||
          m.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    return result;
  }, [memories, filterType, filterCategory, filterImportance, searchQuery]);

  // CRUD operations
  const createMemory = useCallback(
    async (input: Omit<CreateProjectMemoryInput, "projectId">) => {
      const result = await createProjectMemoryAction({ ...input, projectId });
      if (!result.success) throw new Error(result.error);
      setMemories((prev) => [result.data as ProjectMemory, ...prev]);
      return result.data as ProjectMemory;
    },
    [projectId]
  );

  const updateMemory = useCallback(async (id: string, input: UpdateProjectMemoryInput) => {
    const result = await updateProjectMemoryAction(id, input);
    if (!result.success) throw new Error(result.error);
    const updated = result.data as ProjectMemory;
    setMemories((prev) => {
      // If version changed, it's a new memory (old one marked as revised)
      const existingIdx = prev.findIndex((m) => m.id === id);
      if (existingIdx >= 0 && updated.id !== id) {
        // New version created, remove old, add new
        const next = prev.filter((m) => m.id !== id);
        return [updated, ...next];
      }
      // In-place update
      return prev.map((m) => (m.id === id ? updated : m));
    });
    return updated;
  }, []);

  const archiveMemory = useCallback(async (id: string) => {
    const result = await archiveProjectMemoryAction(id);
    if (!result.success) throw new Error(result.error);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const deleteMemory = useCallback(async (id: string) => {
    const result = await deleteProjectMemoryAction(id);
    if (!result.success) throw new Error(result.error);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const value = useMemo(
    () => ({
      memories,
      isLoading,
      error,
      filterType,
      filterCategory,
      filterImportance,
      searchQuery,
      setFilterType,
      setFilterCategory,
      setFilterImportance,
      setSearchQuery,
      filteredMemories,
      createMemory,
      updateMemory,
      archiveMemory,
      deleteMemory,
      refresh: loadMemories,
    }),
    [
      memories,
      isLoading,
      error,
      filterType,
      filterCategory,
      filterImportance,
      searchQuery,
      filteredMemories,
      createMemory,
      updateMemory,
      archiveMemory,
      deleteMemory,
      loadMemories,
    ]
  );

  return <ProjectMemoryContext.Provider value={value}>{children}</ProjectMemoryContext.Provider>;
}

export function useProjectMemory() {
  const ctx = useContext(ProjectMemoryContext);
  if (!ctx) {
    throw new Error("useProjectMemory must be used within ProjectMemoryProvider");
  }
  return ctx;
}
