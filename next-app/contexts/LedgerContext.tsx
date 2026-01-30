"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Study } from "@/types/ledger";
import { useProjects } from "@/contexts/ProjectsContext";
import { listStudiesAction, replaceStudiesAction } from "@/app/actions/ledger";

type LedgerContextValue = {
  getStudiesByProject: (projectId: string) => Study[];
  updateStudies: (projectId: string, studies: Study[]) => Promise<Study[]>;
  getPaperCount: (projectId: string) => number;
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

  const updateStudies = useCallback(async (projectId: string, studies: Study[]) => {
    try {
      const saved = await replaceStudiesAction(projectId, studies);
      setLedgerMap((prev) => ({ ...prev, [projectId]: saved }));
      return saved;
    } catch (err) {
      console.error("Failed to save studies", err);
      throw err;
    }
  }, []);

  const getPaperCount = useCallback(
    (projectId: string) => {
      return ledgerMap[projectId]?.length ?? 0;
    },
    [ledgerMap]
  );

  const value = useMemo(
    () => ({
      getStudiesByProject,
      updateStudies,
      getPaperCount,
    }),
    [getStudiesByProject, updateStudies, getPaperCount]
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
