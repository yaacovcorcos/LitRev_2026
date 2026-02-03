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
  searchProjectMemoriesAction,
  type CreateProjectMemoryInput,
  type UpdateProjectMemoryInput,
} from "@/app/actions/memory";

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
};

export function ProjectMemoryProvider({ projectId, children }: ProjectMemoryProviderProps) {
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
      const data = await getProjectMemoriesAction(projectId, { status: "active" });
      setMemories(data as ProjectMemory[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load memories");
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    loadMemories();
  }, [loadMemories]);

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
      const created = await createProjectMemoryAction({ ...input, projectId });
      setMemories((prev) => [created as ProjectMemory, ...prev]);
      return created as ProjectMemory;
    },
    [projectId]
  );

  const updateMemory = useCallback(async (id: string, input: UpdateProjectMemoryInput) => {
    const updated = await updateProjectMemoryAction(id, input);
    setMemories((prev) => {
      // If version changed, it's a new memory (old one marked as revised)
      const existingIdx = prev.findIndex((m) => m.id === id);
      if (existingIdx >= 0 && (updated as ProjectMemory).id !== id) {
        // New version created, remove old, add new
        const next = prev.filter((m) => m.id !== id);
        return [updated as ProjectMemory, ...next];
      }
      // In-place update
      return prev.map((m) => (m.id === id ? (updated as ProjectMemory) : m));
    });
    return updated as ProjectMemory;
  }, []);

  const archiveMemory = useCallback(async (id: string) => {
    await archiveProjectMemoryAction(id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  }, []);

  const deleteMemory = useCallback(async (id: string) => {
    await deleteProjectMemoryAction(id);
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
