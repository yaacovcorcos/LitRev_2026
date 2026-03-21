import Cite from "citation-js";
import type { Study } from "@/types/ledger";

export type CitationReadyEntry = {
  id: string;
  type: "article-journal";
  title: string;
  author?: Array<{ literal: string }>;
  issued?: {
    "date-parts": number[][];
  };
  "container-title"?: string;
  volume?: string;
  issue?: string;
  page?: string;
  DOI?: string;
};

export type FormattedBibliographyEntry = {
  studyId: string;
  number: number;
  text: string;
  missingStudy: boolean;
};

function trimText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function toCitationReadyEntry(study: Study): CitationReadyEntry {
  const details = study.details ?? {};
  const authors = trimText(study.authors);
  const title = trimText(study.title) ?? `Study ${study.id}`;
  const journal = trimText(details.journal);
  const volume = trimText(details.volume);
  const issue = trimText(details.issue);
  const page = trimText(details.pages);
  const doi = trimText(details.doi);

  return {
    id: study.id,
    type: "article-journal",
    title,
    author: authors ? [{ literal: authors }] : undefined,
    issued: Number.isFinite(study.year) ? { "date-parts": [[study.year]] } : undefined,
    "container-title": journal,
    volume,
    issue,
    page,
    DOI: doi,
  };
}

function normalizeBibliographyText(number: number, text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return `${number}.`;
  }
  return trimmed.replace(/^\d+\.\s*/, `${number}. `).trim();
}

function formatBibliographyEntry(entry: CitationReadyEntry, number: number): string {
  const cite = new Cite([entry]);
  const rendered = cite.format("bibliography", {
    format: "text",
    template: "vancouver",
    lang: "en-US",
  });
  return normalizeBibliographyText(number, rendered);
}

export function formatBibliographyEntries(params: {
  orderedStudyIds: string[];
  studies: Study[];
}): FormattedBibliographyEntry[] {
  const studyById = new Map(params.studies.map((study) => [study.id, study]));

  return params.orderedStudyIds.map((studyId, index) => {
    const study = studyById.get(studyId);
    const number = index + 1;

    if (!study) {
      return {
        studyId,
        number,
        text: `${number}. Missing study metadata for ${studyId}.`,
        missingStudy: true,
      };
    }

    return {
      studyId,
      number,
      text: formatBibliographyEntry(toCitationReadyEntry(study), number),
      missingStudy: false,
    };
  });
}
