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
  replaceStudyInCache: (projectId: string, study: Study) => void;
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
          const result = await listStudiesAction(project.id);
          return [project.id, result.success ? result.data : []] as const;
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

  // Refresh a single project's studies when AI tools mutate the ledger
  useEffect(() => {
    const handler = (e: Event) => {
      const projectId = (e as CustomEvent).detail?.projectId as string | undefined;
      if (!projectId) return;
      listStudiesAction(projectId)
        .then((result) => {
          if (result.success) setLedgerMap((prev) => ({ ...prev, [projectId]: result.data }));
        })
        .catch(console.error);
    };
    window.addEventListener("litrev:ledger-changed", handler);
    return () => window.removeEventListener("litrev:ledger-changed", handler);
  }, []);

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

  /** Replace a study in the local cache (already persisted server-side). */
  const replaceStudyInCache = useCallback((projectId: string, study: Study) => {
    setLedgerMap((prev) => {
      const existing = prev[projectId] ?? [];
      const idx = existing.findIndex((s) => s.id === study.id);
      if (idx === -1) return prev;
      const next = [...existing];
      next[idx] = study;
      return { ...prev, [projectId]: next };
    });
  }, []);

  /** Delete studies: optimistic UI removal, then server delete + refresh. */
  const removeStudies = useCallback(async (projectId: string, studyIds: string[]) => {
    const idSet = new Set(studyIds);

    // Snapshot for rollback
    const snapshot = ledgerMap[projectId] ?? [];

    // Optimistic: remove from UI immediately
    setLedgerMap((prev) => ({
      ...prev,
      [projectId]: (prev[projectId] ?? []).filter((s) => !idSet.has(s.id)),
    }));

    try {
      const delResult = await deleteStudiesAction(projectId, studyIds);
      if (!delResult.success) throw new Error(delResult.error);
      // Refresh from server to ensure consistency
      const refreshResult = await listStudiesAction(projectId);
      setLedgerMap((prev) => ({ ...prev, [projectId]: refreshResult.success ? refreshResult.data : snapshot }));
    } catch {
      // Rollback on failure
      setLedgerMap((prev) => ({ ...prev, [projectId]: snapshot }));
      throw new Error("Failed to delete studies");
    }
  }, [ledgerMap]);

  /** Create a single new study via upsert (does NOT use replaceStudies). */
  const upsertNewStudy = useCallback(async (projectId: string, study: Study) => {
    const result = await upsertStudyAction(projectId, study);
    if (!result.success) throw new Error(result.error);
    setLedgerMap((prev) => ({
      ...prev,
      [projectId]: [...(prev[projectId] ?? []), result.data],
    }));
    return result.data;
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
      const result = await getStudyAction(projectId, studyId);
      return result.success ? result.data : null;
    },
    [ledgerMap]
  );

  const updateSingleStudy = useCallback(
    async (projectId: string, studyId: string, updates: Partial<StudyInput>): Promise<Study> => {
      const result = await updateStudyAction(projectId, studyId, updates);
      if (!result.success) throw new Error(result.error);
      // Update local cache
      setLedgerMap((prev) => {
        const existing = prev[projectId] ?? [];
        const idx = existing.findIndex((s) => s.id === studyId);
        if (idx === -1) return prev;
        const next = [...existing];
        next[idx] = result.data;
        return { ...prev, [projectId]: next };
      });
      return result.data;
    },
    []
  );

  const value = useMemo(
    () => ({
      getStudiesByProject,
      addStudy,
      replaceStudyInCache,
      removeStudies,
      upsertNewStudy,
      getPaperCount,
      getStudyById,
      updateSingleStudy,
    }),
    [getStudiesByProject, addStudy, replaceStudyInCache, removeStudies, upsertNewStudy, getPaperCount, getStudyById, updateSingleStudy]
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
