import {
  extractMentionedStudies,
  stripMentionedStudiesMarkup,
  type MentionedStudy,
} from "@/lib/ai/mentioned-studies";
import { ScopingReportSchema, type ScopingReportPayload } from "@/types/artifacts";

export type ScopingReport = ScopingReportPayload;

export type NormalizedAssistantHiddenBlock = {
  type: "mentioned_studies" | "scoping_report";
  raw: string;
};

export type NormalizedAssistantContent = {
  displayContent: string;
  mentionedStudies: MentionedStudy[];
  scopingReport: ScopingReport | null;
  hiddenBlocks: NormalizedAssistantHiddenBlock[];
};

const SCOPING_REPORT_COMMENT_RE = /<!--\s*SCOPING_REPORT:\s*([\s\S]*?)\s*-->/i;
const SCOPING_REPORT_COMMENT_ALL_RE = /<!--\s*SCOPING_REPORT:\s*[\s\S]*?-->/gi;
const SCOPING_REPORT_COMMENT_OPEN_RE = /<!--\s*SCOPING_REPORT:\s*(?:(?!-->)[\s\S])*$/i;
const SCOPING_REPORT_XML_RE = /<scoping_report>\s*([\s\S]*?)\s*<\/scoping_report>/i;
const SCOPING_REPORT_XML_ALL_RE = /<scoping_report>\s*[\s\S]*?<\/scoping_report>/gi;
const SCOPING_REPORT_XML_OPEN_RE = /<scoping_report>(?:(?!<\/scoping_report>)[\s\S])*$/i;
const SCOPING_REPORT_FENCED_RE = /```scoping_report\s*([\s\S]*?)```/i;
const SCOPING_REPORT_FENCED_ALL_RE = /```scoping_report[\s\S]*?```/gi;
const SCOPING_REPORT_FENCED_OPEN_RE = /```scoping_report(?:(?!```)[\s\S])*$/i;

function safeParseJson(raw: string): unknown | null {
  try {
    return JSON.parse(raw);
  } catch {
    // continue to conservative repair
  }

  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed.replace(/,\s*([}\]])/g, "$1"));
  } catch {
    return null;
  }
}

function parseScopingReport(raw: string): ScopingReport | null {
  const parsed = safeParseJson(raw);
  const validated = ScopingReportSchema.safeParse(parsed);
  return validated.success ? validated.data : null;
}

function extractScopingReport(text: string): ScopingReport | null {
  if (!text) return null;

  const commentMatch = text.match(SCOPING_REPORT_COMMENT_RE);
  if (commentMatch?.[1]) {
    const report = parseScopingReport(commentMatch[1]);
    if (report) return report;
  }

  const xmlMatch = text.match(SCOPING_REPORT_XML_RE);
  if (xmlMatch?.[1]) {
    const report = parseScopingReport(xmlMatch[1]);
    if (report) return report;
  }

  const fencedMatch = text.match(SCOPING_REPORT_FENCED_RE);
  if (fencedMatch?.[1]) {
    const report = parseScopingReport(fencedMatch[1]);
    if (report) return report;
  }

  return null;
}

function stripScopingReportMarkup(text: string): string {
  return text
    .replace(SCOPING_REPORT_COMMENT_ALL_RE, "")
    .replace(SCOPING_REPORT_XML_ALL_RE, "")
    .replace(SCOPING_REPORT_FENCED_ALL_RE, "")
    .replace(SCOPING_REPORT_COMMENT_OPEN_RE, "")
    .replace(SCOPING_REPORT_XML_OPEN_RE, "")
    .replace(SCOPING_REPORT_FENCED_OPEN_RE, "")
    .trimEnd();
}

function collectMatches(
  source: string,
  type: NormalizedAssistantHiddenBlock["type"],
  patterns: RegExp[],
  seen: Set<string>,
): NormalizedAssistantHiddenBlock[] {
  const blocks: NormalizedAssistantHiddenBlock[] = [];

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    if (regex.global) {
      for (const match of source.matchAll(regex)) {
        const raw = match[0];
        if (!raw || seen.has(raw)) continue;
        seen.add(raw);
        blocks.push({ type, raw });
      }
      continue;
    }

    const match = source.match(regex);
    const raw = match?.[0];
    if (!raw || seen.has(raw)) continue;
    seen.add(raw);
    blocks.push({ type, raw });
  }

  return blocks;
}

export function normalizeAssistantContent(content: string): NormalizedAssistantContent {
  const hiddenBlocks = (() => {
    const seen = new Set<string>();
    return [
      ...collectMatches(content, "mentioned_studies", [
        /<!--\s*MENTIONED_STUDIES:\s*[\s\S]*?-->/gi,
        /<!--\s*MENTIONED_STUDIES:\s*(?:(?!-->)[\s\S])*$/i,
        /<mentioned_studies>\s*[\s\S]*?<\/mentioned_studies>/gi,
        /<mentioned_studies>(?:(?!<\/mentioned_studies>)[\s\S])*$/i,
        /```mentioned_studies[\s\S]*?```/gi,
        /```mentioned_studies(?:(?!```)[\s\S])*$/i,
      ], seen),
      ...collectMatches(content, "scoping_report", [
        SCOPING_REPORT_COMMENT_ALL_RE,
        SCOPING_REPORT_COMMENT_OPEN_RE,
        SCOPING_REPORT_XML_ALL_RE,
        SCOPING_REPORT_XML_OPEN_RE,
        SCOPING_REPORT_FENCED_ALL_RE,
        SCOPING_REPORT_FENCED_OPEN_RE,
      ], seen),
    ];
  })();

  return {
    displayContent: stripMentionedStudiesMarkup(stripScopingReportMarkup(content)).trimEnd(),
    mentionedStudies: extractMentionedStudies(content),
    scopingReport: extractScopingReport(content),
    hiddenBlocks,
  };
}
