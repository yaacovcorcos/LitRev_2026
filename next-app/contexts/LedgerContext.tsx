"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loadLedger, saveLedger } from "@/lib/ledgerStorage";
import { Study } from "@/types/ledger";
import { useProjects } from "@/contexts/ProjectsContext";
import { Project } from "@/types/project";

type LedgerContextValue = {
  getStudiesByProject: (projectId: string) => Study[];
  updateStudies: (projectId: string, studies: Study[]) => void;
  getPaperCount: (projectId: string) => number;
};

const LedgerContext = createContext<LedgerContextValue | undefined>(undefined);

const SEED_STUDIES: Omit<Study, "id">[] = [
  {
    title: "Deep Learning in Medical Imaging",
    authors: "Litjens et al.",
    year: 2017,
    status: "extracted",
    quality: "High",
  },
  {
    title: "Radiologist-level Pneumonia Detection",
    authors: "Rajpurkar et al.",
    year: 2018,
    status: "extracted",
    quality: "High",
  },
  {
    title: "AI for Chest X-ray Screening",
    authors: "Wang et al.",
    year: 2020,
    status: "pending",
    quality: "-",
  },
  {
    title: "Transfer Learning in Radiology",
    authors: "Shin et al.",
    year: 2016,
    status: "extracted",
    quality: "Medium",
  },
  {
    title: "Attention Mechanisms for CT Scans",
    authors: "Chen et al.",
    year: 2021,
    status: "pending",
    quality: "-",
  },
  {
    title: "Multi-modal Imaging Analysis",
    authors: "Kim et al.",
    year: 2022,
    status: "pending",
    quality: "-",
  },
];

const buildSeedStudies = (project: Project): Study[] => {
  const targetCount =
    project.status === "harvesting" ? project.progress?.papers ?? project.papers ?? 0 : project.papers ?? 0;
  if (!targetCount || targetCount <= 0) return [];

  const seeded = SEED_STUDIES.map((study, index) => ({
    ...study,
    id: `${project.id}-s${index + 1}`,
  }));

  if (targetCount <= seeded.length) {
    return seeded.slice(0, targetCount);
  }

  const remaining = targetCount - seeded.length;
  const generated = Array.from({ length: remaining }, (_, index) => {
    const number = seeded.length + index + 1;
    return {
      id: `${project.id}-s${number}`,
      title: `${project.name} Study ${number}`,
      authors: "Various Authors",
      year: 2020 + (number % 5),
      status: number % 3 === 0 ? "pending" : "extracted",
      quality: number % 5 === 0 ? "Medium" : "High",
    } satisfies Study;
  });

  return [...seeded, ...generated];
};

export function LedgerProvider({ children }: { children: React.ReactNode }) {
  const { projects } = useProjects();
  const [ledgerMap, setLedgerMap] = useState<Record<string, Study[]>>({});

  useEffect(() => {
    const nextMap: Record<string, Study[]> = {};
    for (const project of projects) {
      const fallback = buildSeedStudies(project);
      nextMap[project.id] = loadLedger(project.id, fallback);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLedgerMap(nextMap);
  }, [projects]);

  const getStudiesByProject = useCallback(
    (projectId: string) => {
      return ledgerMap[projectId] ?? [];
    },
    [ledgerMap]
  );

  const updateStudies = useCallback((projectId: string, studies: Study[]) => {
    setLedgerMap((prev) => ({ ...prev, [projectId]: studies }));
    saveLedger(projectId, studies);
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
