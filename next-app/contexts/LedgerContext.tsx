"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Study } from "@/types/ledger";
import { useProjects } from "@/contexts/ProjectsContext";
import {
  listStudiesAction,
  upsertStudyAction,
  deleteStudiesAction,
  getStudyAction,
  updateStudyAction,
} from "@/app/actions/ledger";
import type { StudyInput } from "@/lib/server/ledger";

type LedgerContextValue = {
  getStudiesByProject: (projectId: string) => Study[];
  addStudy: (projectId: string, study: Study) => void;
  removeStudies: (projectId: string, studyIds: string[]) => Promise<void>;
  upsertNewStudy: (projectId: string, study: Study) => Promise<Study>;
  getPaperCount: (projectId: string) => number;
  getStudyById: (projectId: string, studyId: string) => Promise<Study | null>;
  updateSingleStudy: (projectId: string, studyId: string, updates: Partial<StudyInput>) => Promise<Study>;
};

const LedgerContext = createContext<LedgerContextValue | undefined>(undefined);

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const { projects } = useProjects();
  const [ledgerMap, setLedgerMap] = useState<Record<string, Study[]>>({});

  useEffect(() => {
    let isActive = true;
    const load = async () => {
      if (!projects.length) {
        if (isActive) setLedgerMap({});
        return;
      }
      const entries = await Promise.all(
        projects.map(async (project) => {
          try {
            const studies = await listStudiesAction(project.id);
            return [project.id, studies] as const;
          } catch (err) {
            console.error("Failed to load studies for project", project.id, err);
            return [project.id, []] as const;
          }
        })
      );

      if (!isActive) return;
      const nextMap: Record<string, Study[]> = {};
      for (const [projectId, studies] of entries) {
        nextMap[projectId] = [...studies];
      }
      setLedgerMap(nextMap);
    };

    load();
    return () => {
      isActive = false;
    };
  }, [projects]);

  const getStudiesByProject = useCallback(
    (projectId: string) => {
      return ledgerMap[projectId] ?? [];
    },
    [ledgerMap]
  );

  /** Insert a study into the local cache (study already persisted server-side). */
  const addStudy = useCallback((projectId: string, study: Study) => {
    setLedgerMap((prev) => ({
      ...prev,
      [projectId]: [...(prev[projectId] ?? []), study],
    }));
  }, []);

  /** Delete studies server-side (single query), then refresh from the server. */
  const removeStudies = useCallback(async (projectId: string, studyIds: string[]) => {
    await deleteStudiesAction(projectId, studyIds);
    try {
      const refreshed = await listStudiesAction(projectId);
      setLedgerMap((prev) => ({ ...prev, [projectId]: refreshed }));
    } catch {
      // At minimum remove from local cache
      setLedgerMap((prev) => ({
        ...prev,
        [projectId]: (prev[projectId] ?? []).filter((s) => !studyIds.includes(s.id)),
      }));
    }
  }, []);

  /** Create a single new study via upsert (does NOT use replaceStudies). */
  const upsertNewStudy = useCallback(async (projectId: string, study: Study) => {
    const saved = await upsertStudyAction(projectId, study);
    setLedgerMap((prev) => ({
      ...prev,
      [projectId]: [...(prev[projectId] ?? []), saved],
    }));
    return saved;
  }, []);

  const getPaperCount = useCallback(
    (projectId: string) => {
      return ledgerMap[projectId]?.length ?? 0;
    },
    [ledgerMap]
  );

  const getStudyById = useCallback(
    async (projectId: string, studyId: string): Promise<Study | null> => {
      // First check local cache
      const cached = ledgerMap[projectId]?.find((s) => s.id === studyId);
      if (cached) return cached;
      // Fallback to server
      return getStudyAction(projectId, studyId);
    },
    [ledgerMap]
  );

  const updateSingleStudy = useCallback(
    async (projectId: string, studyId: string, updates: Partial<StudyInput>): Promise<Study> => {
      const updated = await updateStudyAction(projectId, studyId, updates);
      // Update local cache
      setLedgerMap((prev) => {
        const existing = prev[projectId] ?? [];
        const idx = existing.findIndex((s) => s.id === studyId);
        if (idx === -1) return prev;
        const next = [...existing];
        next[idx] = updated;
        return { ...prev, [projectId]: next };
      });
      return updated;
    },
    []
  );

  const value = useMemo(
    () => ({
      getStudiesByProject,
      addStudy,
      removeStudies,
      upsertNewStudy,
      getPaperCount,
      getStudyById,
      updateSingleStudy,
    }),
    [getStudiesByProject, addStudy, removeStudies, upsertNewStudy, getPaperCount, getStudyById, updateSingleStudy]
  );

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>;
}

export function useLedger() {
  const ctx = useContext(LedgerContext);
  if (!ctx) {
    throw new Error("useLedger must be used within LedgerProvider");
  }
  return ctx;
}
