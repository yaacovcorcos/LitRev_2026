import { createHash } from "node:crypto";
import type { Study } from "@/types/ledger";
import type { DraftAuxiliaryReference } from "@/lib/draft-import/types";

function trimOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeDoi(value: unknown): string | undefined {
  const raw = trimOptionalString(value);
  if (!raw) return undefined;
  const normalized = raw
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
    .replace(/^doi\s*:\s*/i, "")
    .replace(/[),.;:\]]+$/g, "")
    .trim()
    .toLowerCase();
  return /^10\.\d{4,9}\/.+/.test(normalized) ? normalized : undefined;
}

export function normalizePmid(value: unknown): string | undefined {
  const raw = trimOptionalString(value);
  if (!raw) return undefined;
  const digits = raw.replace(/\D/g, "");
  return digits.length >= 6 && digits.length <= 9 ? digits : undefined;
}

export function normalizeYear(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const match = value.match(/\b(18|19|20)\d{2}\b/);
    if (match) {
      return Number.parseInt(match[0], 10);
    }
  }
  return undefined;
}

export function normalizeAuthors(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (Array.isArray(value)) {
    const names = value
      .map((entry) => {
        if (typeof entry === "string") return entry.trim();
        if (!entry || typeof entry !== "object") return "";
        const given = trimOptionalString((entry as { given?: unknown }).given);
        const family = trimOptionalString((entry as { family?: unknown }).family);
        const literal = trimOptionalString((entry as { literal?: unknown }).literal);
        return literal ?? [given, family].filter(Boolean).join(" ").trim();
      })
      .filter((name) => name.length > 0);

    return names.length > 0 ? names.join(", ") : undefined;
  }

  return undefined;
}

export function bibliographyIdentityKey(reference: Pick<DraftAuxiliaryReference, "doi" | "pmid" | "title" | "year">): string {
  if (reference.doi) return `doi:${reference.doi}`;
  if (reference.pmid) return `pmid:${reference.pmid}`;
  const title = reference.title.trim().toLowerCase();
  return `title-year:${title}|${reference.year ?? "unknown"}`;
}

export function stableAuxiliaryReferenceId(reference: Pick<
  DraftAuxiliaryReference,
  "sourceFormat" | "sourceItemId" | "citationKey" | "title" | "year" | "doi" | "pmid"
>): string {
  const key = reference.sourceItemId
    ?? reference.citationKey
    ?? reference.doi
    ?? reference.pmid
    ?? `${reference.title.trim().toLowerCase()}|${reference.year ?? "unknown"}`;
  const digest = createHash("sha1").update(`${reference.sourceFormat}|${key}`).digest("hex");
  return `aux_${digest.slice(0, 16)}`;
}

export function linkReferenceToStudy(
  reference: Pick<DraftAuxiliaryReference, "doi" | "pmid" | "title" | "year">,
  studies: Study[],
): string | undefined {
  const doi = normalizeDoi(reference.doi);
  if (doi) {
    const byDoi = studies.find((study) => normalizeDoi(study.details?.doi) === doi);
    if (byDoi) return byDoi.id;
  }

  const pmid = normalizePmid(reference.pmid);
  if (pmid) {
    const byPmid = studies.find((study) => normalizePmid(study.details?.pmid) === pmid);
    if (byPmid) return byPmid.id;
  }

  const normalizedTitle = reference.title.trim().toLowerCase();
  const year = reference.year;
  if (!normalizedTitle) return undefined;

  const byTitleYear = studies.find(
    (study) => study.title.trim().toLowerCase() === normalizedTitle && (!year || study.year === year),
  );
  return byTitleYear?.id;
}

export function mergeAuxiliaryBibliography(
  current: DraftAuxiliaryReference[],
  next: DraftAuxiliaryReference[],
): DraftAuxiliaryReference[] {
  const byKey = new Map<string, DraftAuxiliaryReference>();

  for (const reference of [...current, ...next]) {
    const key = bibliographyIdentityKey(reference);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, reference);
      continue;
    }

    byKey.set(key, {
      ...existing,
      ...reference,
      id: existing.id,
      linkedStudyId: existing.linkedStudyId ?? reference.linkedStudyId,
      authors: existing.authors ?? reference.authors,
      containerTitle: existing.containerTitle ?? reference.containerTitle,
      volume: existing.volume ?? reference.volume,
      issue: existing.issue ?? reference.issue,
      pages: existing.pages ?? reference.pages,
      citationKey: existing.citationKey ?? reference.citationKey,
      sourceItemId: existing.sourceItemId ?? reference.sourceItemId,
    });
  }

  return Array.from(byKey.values()).sort((left, right) => left.title.localeCompare(right.title));
}
