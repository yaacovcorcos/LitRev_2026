"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Study } from "@/types/ledger";
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
  isProjectLoaded: (projectId: string) => boolean;
  addStudy: (projectId: string, study: Study) => void;
  replaceStudyInCache: (projectId: string, study: Study) => void;
  removeStudies: (projectId: string, studyIds: string[]) => Promise<void>;
  upsertNewStudy: (projectId: string, study: Study) => Promise<Study>;
  getPaperCount: (projectId: string) => number;
  getStudyById: (projectId: string, studyId: string) => Promise<Study | null>;
  updateSingleStudy: (projectId: string, studyId: string, updates: Partial<StudyInput>) => Promise<Study>;
  /** Push studies into the cache from an external source (e.g. ProjectDataProvider). */
  seedProject: (projectId: string, studies: Study[]) => void;
  /** Ensure a project's studies are loaded — fetches once, no-op on subsequent calls. */
  ensureProjectLoaded: (projectId: string) => void;
};

const LedgerContext = createContext<LedgerContextValue | undefined>(undefined);

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const [ledgerMap, setLedgerMap] = useState<Record<string, Study[]>>({});
  const loadedProjectsRef = useRef<Set<string>>(new Set());
  const loadingProjectsRef = useRef<Set<string>>(new Set());

  // Refresh a single project's studies when AI tools mutate the ledger
  useEffect(() => {
    const handler = (e: Event) => {
      const projectId = (e as CustomEvent).detail?.projectId as string | undefined;
      if (!projectId) return;
      const wasLoaded = loadedProjectsRef.current.has(projectId);
      if (!wasLoaded) {
        loadingProjectsRef.current.add(projectId);
      }
      const refreshPromise = listStudiesAction(projectId)
        .then((result) => {
          if (result.success) {
            loadedProjectsRef.current.add(projectId);
            setLedgerMap((prev) => ({ ...prev, [projectId]: result.data }));
          }
        })
        .catch(console.error);
      if (!wasLoaded) {
        void refreshPromise.finally(() => {
          loadingProjectsRef.current.delete(projectId);
        });
      }
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

  const isProjectLoaded = useCallback((projectId: string) => {
    return loadedProjectsRef.current.has(projectId);
  }, []);

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

  /** Push studies into the cache from an external source (e.g. ProjectDataProvider). */
  const seedProject = useCallback((projectId: string, studies: Study[]) => {
    loadingProjectsRef.current.delete(projectId);
    loadedProjectsRef.current.add(projectId);
    setLedgerMap((prev) => ({ ...prev, [projectId]: studies }));
  }, []);

  /** Fetch a project's studies if not already loaded. No-op for already-loaded projects. */
  const ensureProjectLoaded = useCallback((projectId: string) => {
    if (loadedProjectsRef.current.has(projectId) || loadingProjectsRef.current.has(projectId)) return;
    loadingProjectsRef.current.add(projectId);
    listStudiesAction(projectId)
      .then((result) => {
        if (result.success) {
          loadedProjectsRef.current.add(projectId);
          setLedgerMap((prev) => ({ ...prev, [projectId]: result.data }));
        }
      })
      .catch(console.error)
      .finally(() => {
        loadingProjectsRef.current.delete(projectId);
      });
  }, []);

  const value = useMemo(
    () => ({
      getStudiesByProject,
      isProjectLoaded,
      addStudy,
      replaceStudyInCache,
      removeStudies,
      upsertNewStudy,
      getPaperCount,
      getStudyById,
      updateSingleStudy,
      seedProject,
      ensureProjectLoaded,
    }),
    [getStudiesByProject, isProjectLoaded, addStudy, replaceStudyInCache, removeStudies, upsertNewStudy, getPaperCount, getStudyById, updateSingleStudy, seedProject, ensureProjectLoaded]
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
