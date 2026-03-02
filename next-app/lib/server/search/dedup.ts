import type { SearchResult } from "@/types/search";
import type { Study } from "@/types/ledger";

export type DuplicateMatch = {
  result: SearchResult;
  matchedBy: "pmid" | "doi" | "s2PaperId" | "titleYear";
  matchedValue: string;
  existingStudyId: string;
  existingTitle: string;
};

export type DedupResult = {
  unique: SearchResult[];
  duplicates: DuplicateMatch[];
};

export type StudyDuplicateSignal =
  | "doi"
  | "pmid"
  | "s2PaperId"
  | "titleYearAuthor"
  | "titleYear";

export type StudyDuplicatePairConfidence = "high" | "medium";

export type StudyDuplicatePair = {
  leftStudyId: string;
  rightStudyId: string;
  confidence: StudyDuplicatePairConfidence;
  signals: StudyDuplicateSignal[];
};

export type StudyDuplicateCluster = {
  studyIds: string[];
  confidence: StudyDuplicatePairConfidence;
  signals: StudyDuplicateSignal[];
  pairs: StudyDuplicatePair[];
};

type ExistingStudyRef = {
  id: string;
  title: string;
  authorToken?: string;
};

function normalizeDoi(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value
    .trim()
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi\s*:\s*/i, "")
    .replace(/[),.;:\]]+$/g, "")
    .toLowerCase();
  if (!/^10\.\d{4,9}\/.+/.test(normalized)) return undefined;
  return normalized;
}

function normalizePmid(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 9) return undefined;
  return digits;
}

function normalizeTitle(value: string | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function toTitleYearKey(title: string | undefined, year: number | undefined): string | undefined {
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle || !Number.isFinite(year)) return undefined;
  return `${normalizedTitle}|${year}`;
}

function firstAuthorToken(authors: string | undefined): string | undefined {
  if (!authors) return undefined;
  const primary = authors.split(/,|;| and /i)[0]?.trim();
  if (!primary) return undefined;
  const normalized = primary
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z\s]/g, " ")
    .trim();
  if (!normalized) return undefined;
  const parts = normalized.split(/\s+/).filter(Boolean);
  return parts[parts.length - 1];
}

function isTitleYearAuthorMatch(existing: ExistingStudyRef, candidateAuthorToken: string | undefined): boolean {
  // Optional author token check:
  // - if both sides have a token, require match
  // - if either side is missing, allow title+year duplicate
  if (existing.authorToken && candidateAuthorToken) {
    return existing.authorToken === candidateAuthorToken;
  }
  return true;
}

function makePairKey(left: string, right: string): string {
  return left < right ? `${left}::${right}` : `${right}::${left}`;
}

function parsePairKey(key: string): { left: string; right: string } {
  const [left, right] = key.split("::");
  return { left, right };
}

function confidenceFromSignals(signals: Set<StudyDuplicateSignal>): StudyDuplicatePairConfidence {
  if (signals.has("doi") || signals.has("pmid") || signals.has("s2PaperId")) {
    return "high";
  }
  return "medium";
}

function pushSignal(
  signalMap: Map<string, Set<StudyDuplicateSignal>>,
  leftStudyId: string,
  rightStudyId: string,
  signal: StudyDuplicateSignal
): void {
  if (leftStudyId === rightStudyId) return;
  const key = makePairKey(leftStudyId, rightStudyId);
  const signals = signalMap.get(key) ?? new Set<StudyDuplicateSignal>();
  signals.add(signal);
  signalMap.set(key, signals);
}

function buildPairsFromBuckets(
  buckets: Iterable<ExistingStudyRef[]>,
  signalMap: Map<string, Set<StudyDuplicateSignal>>,
  signal: StudyDuplicateSignal
): void {
  for (const refs of buckets) {
    if (refs.length < 2) continue;
    for (let i = 0; i < refs.length; i += 1) {
      for (let j = i + 1; j < refs.length; j += 1) {
        pushSignal(signalMap, refs[i].id, refs[j].id, signal);
      }
    }
  }
}

function collectStudyRef(study: Study): ExistingStudyRef {
  return {
    id: study.id,
    title: study.title,
    authorToken: firstAuthorToken(study.authors),
  };
}

/**
 * Build duplicate clusters across already-ingested studies.
 * This is for v2 dedupe/merge workflows, not incoming search results.
 */
export function buildStudyDuplicateClusters(studies: Study[]): StudyDuplicateCluster[] {
  if (studies.length < 2) return [];

  const doiBuckets = new Map<string, ExistingStudyRef[]>();
  const pmidBuckets = new Map<string, ExistingStudyRef[]>();
  const s2Buckets = new Map<string, ExistingStudyRef[]>();
  const titleYearAuthorBuckets = new Map<string, ExistingStudyRef[]>();
  const titleYearBuckets = new Map<string, ExistingStudyRef[]>();
  const signalMap = new Map<string, Set<StudyDuplicateSignal>>();

  for (const study of studies) {
    const ref = collectStudyRef(study);
    const details = study.details;
    const doi = normalizeDoi(typeof details?.doi === "string" ? details.doi : undefined);
    const pmid = normalizePmid(typeof details?.pmid === "string" ? details.pmid : undefined);
    const s2PaperId = typeof details?.s2PaperId === "string" ? details.s2PaperId.trim() : undefined;
    const titleYearKey = toTitleYearKey(study.title, study.year);

    if (doi) {
      const bucket = doiBuckets.get(doi) ?? [];
      bucket.push(ref);
      doiBuckets.set(doi, bucket);
    }
    if (pmid) {
      const bucket = pmidBuckets.get(pmid) ?? [];
      bucket.push(ref);
      pmidBuckets.set(pmid, bucket);
    }
    if (s2PaperId) {
      const bucket = s2Buckets.get(s2PaperId) ?? [];
      bucket.push(ref);
      s2Buckets.set(s2PaperId, bucket);
    }
    if (titleYearKey) {
      const bucket = titleYearBuckets.get(titleYearKey) ?? [];
      bucket.push(ref);
      titleYearBuckets.set(titleYearKey, bucket);

      if (ref.authorToken) {
        const authorKey = `${titleYearKey}|${ref.authorToken}`;
        const authorBucket = titleYearAuthorBuckets.get(authorKey) ?? [];
        authorBucket.push(ref);
        titleYearAuthorBuckets.set(authorKey, authorBucket);
      }
    }
  }

  buildPairsFromBuckets(doiBuckets.values(), signalMap, "doi");
  buildPairsFromBuckets(pmidBuckets.values(), signalMap, "pmid");
  buildPairsFromBuckets(s2Buckets.values(), signalMap, "s2PaperId");
  buildPairsFromBuckets(titleYearAuthorBuckets.values(), signalMap, "titleYearAuthor");

  // title+year-only signal: only when at least one side has no author token.
  for (const refs of titleYearBuckets.values()) {
    if (refs.length < 2) continue;
    for (let i = 0; i < refs.length; i += 1) {
      for (let j = i + 1; j < refs.length; j += 1) {
        const left = refs[i];
        const right = refs[j];
        if (left.authorToken && right.authorToken && left.authorToken !== right.authorToken) {
          continue;
        }
        if (left.authorToken && right.authorToken) {
          continue;
        }
        pushSignal(signalMap, left.id, right.id, "titleYear");
      }
    }
  }

  const pairs: StudyDuplicatePair[] = Array.from(signalMap.entries()).map(([key, signals]) => {
    const { left, right } = parsePairKey(key);
    return {
      leftStudyId: left,
      rightStudyId: right,
      signals: Array.from(signals),
      confidence: confidenceFromSignals(signals),
    };
  });

  if (pairs.length === 0) return [];

  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const cur = parent.get(id) ?? id;
    if (cur !== id) {
      const root = find(cur);
      parent.set(id, root);
      return root;
    }
    return cur;
  };
  const union = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    if (leftRoot < rightRoot) {
      parent.set(rightRoot, leftRoot);
    } else {
      parent.set(leftRoot, rightRoot);
    }
  };

  for (const pair of pairs) {
    union(pair.leftStudyId, pair.rightStudyId);
  }

  const clusterMap = new Map<string, Set<string>>();
  for (const study of studies) {
    const root = find(study.id);
    const bucket = clusterMap.get(root) ?? new Set<string>();
    bucket.add(study.id);
    clusterMap.set(root, bucket);
  }

  const clusters: StudyDuplicateCluster[] = [];
  for (const studyIdSet of clusterMap.values()) {
    if (studyIdSet.size < 2) continue;
    const studyIds = Array.from(studyIdSet).sort();
    const idSet = new Set(studyIds);
    const clusterPairs = pairs.filter(
      (pair) => idSet.has(pair.leftStudyId) && idSet.has(pair.rightStudyId)
    );
    const signalSet = new Set<StudyDuplicateSignal>();
    let confidence: StudyDuplicatePairConfidence = "medium";
    for (const pair of clusterPairs) {
      if (pair.confidence === "high") confidence = "high";
      for (const signal of pair.signals) signalSet.add(signal);
    }

    clusters.push({
      studyIds,
      confidence,
      signals: Array.from(signalSet),
      pairs: clusterPairs.sort((a, b) =>
        `${a.leftStudyId}:${a.rightStudyId}`.localeCompare(`${b.leftStudyId}:${b.rightStudyId}`)
      ),
    });
  }

  return clusters.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === "high" ? -1 : 1;
    if (a.studyIds.length !== b.studyIds.length) return b.studyIds.length - a.studyIds.length;
    return a.studyIds[0].localeCompare(b.studyIds[0]);
  });
}

/**
 * Check search results against existing studies and partition into unique/duplicate.
 * Matches on PMID, DOI, Semantic Scholar paper ID, and normalized title+year.
 */
export function findDuplicates(
  existingStudies: Study[],
  results: SearchResult[]
): DedupResult {
  // Build lookup maps: identifier/title-year → existing study reference (for diagnostics)
  const pmidMap = new Map<string, ExistingStudyRef>();
  const doiMap = new Map<string, ExistingStudyRef>();
  const s2IdMap = new Map<string, ExistingStudyRef>();
  const titleYearMap = new Map<string, ExistingStudyRef[]>();

  for (const study of existingStudies) {
    const details = study.details;
    const ref: ExistingStudyRef = {
      id: study.id,
      title: study.title,
      authorToken: firstAuthorToken(study.authors),
    };

    const pmid = normalizePmid(typeof details?.pmid === "string" ? details.pmid : undefined);
    const doi = normalizeDoi(typeof details?.doi === "string" ? details.doi : undefined);
    const s2PaperId = typeof details?.s2PaperId === "string" ? details.s2PaperId.trim() : undefined;
    const titleYearKey = toTitleYearKey(study.title, study.year);

    if (pmid) pmidMap.set(pmid, ref);
    if (doi) doiMap.set(doi, ref);
    if (s2PaperId) s2IdMap.set(s2PaperId, ref);
    if (titleYearKey) {
      const bucket = titleYearMap.get(titleYearKey) ?? [];
      bucket.push(ref);
      titleYearMap.set(titleYearKey, bucket);
    }
  }

  const unique: SearchResult[] = [];
  const duplicates: DuplicateMatch[] = [];

  for (const result of results) {
    const normalizedPmid = normalizePmid(result.pmid);
    const normalizedDoi = normalizeDoi(result.doi);
    const pmidRef = normalizedPmid ? pmidMap.get(normalizedPmid) : undefined;
    const doiRef = normalizedDoi ? doiMap.get(normalizedDoi) : undefined;
    const s2Id = result.metadata?.s2PaperId;
    const s2Ref = (typeof s2Id === "string") ? s2IdMap.get(s2Id) : undefined;
    const titleYearKey = toTitleYearKey(result.title, result.year);
    const existingForTitleYear = titleYearKey ? titleYearMap.get(titleYearKey) ?? [] : [];
    const resultAuthorToken = firstAuthorToken(result.authors);
    const titleYearRef = existingForTitleYear.find((ref) => isTitleYearAuthorMatch(ref, resultAuthorToken));

    if (pmidRef) {
      duplicates.push({
        result,
        matchedBy: "pmid",
        matchedValue: normalizedPmid!,
        existingStudyId: pmidRef.id,
        existingTitle: pmidRef.title,
      });
    } else if (doiRef) {
      duplicates.push({
        result,
        matchedBy: "doi",
        matchedValue: normalizedDoi!,
        existingStudyId: doiRef.id,
        existingTitle: doiRef.title,
      });
    } else if (s2Ref) {
      duplicates.push({
        result,
        matchedBy: "s2PaperId",
        matchedValue: s2Id as string,
        existingStudyId: s2Ref.id,
        existingTitle: s2Ref.title,
      });
    } else if (titleYearRef && titleYearKey) {
      duplicates.push({
        result,
        matchedBy: "titleYear",
        matchedValue: titleYearKey,
        existingStudyId: titleYearRef.id,
        existingTitle: titleYearRef.title,
      });
    } else {
      unique.push(result);

      // Update maps so we also dedupe repeated items within the same incoming batch.
      const ref: ExistingStudyRef = {
        id: `incoming:${unique.length}`,
        title: result.title,
        authorToken: resultAuthorToken,
      };
      if (normalizedPmid) pmidMap.set(normalizedPmid, ref);
      if (normalizedDoi) doiMap.set(normalizedDoi, ref);
      if (typeof s2Id === "string" && s2Id.trim().length > 0) s2IdMap.set(s2Id, ref);
      if (titleYearKey) {
        const bucket = titleYearMap.get(titleYearKey) ?? [];
        bucket.push(ref);
        titleYearMap.set(titleYearKey, bucket);
      }
    }
  }

  return { unique, duplicates };
}
