import "server-only";

import { prisma } from "@/lib/server/prisma";

export type LedgerCounts = {
  total: number;
  included: number;
  excluded: number;
  maybe: number;
  unscreened: number;
};

export type LedgerStudyEntry = {
  id: string;
  title: string;
  authors: string;
  year: number;
  status: string;
  doi?: string;
  pmid?: string;
};

export type StudyLedgerSnapshot = {
  counts: LedgerCounts;
  list: LedgerStudyEntry[];
  truncated: boolean;
  hasRecommendationSeeds: boolean;
};

export const DEFAULT_LEDGER_MAX_LIST = 50;
export const DEFAULT_LEDGER_LIST_THRESHOLD = 200;

function readStatus(details: Record<string, unknown> | null): "keep" | "exclude" | "maybe" | "unscreened" {
  const triage = typeof details?.triageDecision === "string" ? details.triageDecision : "";
  if (triage === "keep" || triage === "exclude" || triage === "maybe") return triage;
  return "unscreened";
}

function hasSeedIdentifier(details: Record<string, unknown> | null): boolean {
  const doi = typeof details?.doi === "string" ? details.doi.trim() : "";
  const pmid = typeof details?.pmid === "string" ? details.pmid.trim() : "";
  const s2PaperId = typeof details?.s2PaperId === "string" ? details.s2PaperId.trim() : "";
  return doi.length > 0 || pmid.length > 0 || s2PaperId.length > 0;
}

export async function computeStudyLedger(
  projectId: string,
  opts?: { maxList?: number; listThreshold?: number }
): Promise<StudyLedgerSnapshot> {
  const maxList = opts?.maxList ?? DEFAULT_LEDGER_MAX_LIST;
  const listThreshold = opts?.listThreshold ?? DEFAULT_LEDGER_LIST_THRESHOLD;

  const studies = await prisma.study.findMany({
    where: { projectId },
    select: { id: true, title: true, authors: true, year: true, details: true },
    orderBy: { createdAt: "asc" },
  });

  let included = 0;
  let excluded = 0;
  let maybe = 0;
  let unscreened = 0;
  let hasRecommendationSeeds = false;

  const includeList = studies.length <= listThreshold;
  const list: LedgerStudyEntry[] = [];

  for (const study of studies) {
    const details = (study.details as Record<string, unknown> | null) ?? null;
    const status = readStatus(details);

    if (status === "keep") included += 1;
    else if (status === "exclude") excluded += 1;
    else if (status === "maybe") maybe += 1;
    else unscreened += 1;

    if (!hasRecommendationSeeds && hasSeedIdentifier(details)) {
      hasRecommendationSeeds = true;
    }

    if (includeList && list.length < maxList) {
      const doi = typeof details?.doi === "string" ? details.doi : undefined;
      const pmid = typeof details?.pmid === "string" ? details.pmid : undefined;
      list.push({
        id: study.id,
        title: study.title,
        authors: study.authors,
        year: study.year,
        status,
        doi,
        pmid,
      });
    }
  }

  return {
    counts: {
      total: studies.length,
      included,
      excluded,
      maybe,
      unscreened,
    },
    list,
    truncated: includeList ? studies.length > list.length : studies.length > 0,
    hasRecommendationSeeds,
  };
}

export async function computeLedgerCounts(projectId: string): Promise<LedgerCounts> {
  const [total, included, excluded, maybe] = await Promise.all([
    prisma.study.count({ where: { projectId } }),
    prisma.study.count({ where: { projectId, details: { path: ["triageDecision"], equals: "keep" } } }),
    prisma.study.count({ where: { projectId, details: { path: ["triageDecision"], equals: "exclude" } } }),
    prisma.study.count({ where: { projectId, details: { path: ["triageDecision"], equals: "maybe" } } }),
  ]);

  const unscreened = Math.max(0, total - included - excluded - maybe);
  return { total, included, excluded, maybe, unscreened };
}
