import { z } from "zod";

export type MentionedStudy = {
    key: string;
    title?: string;
    year?: number;
    authors?: string;
    doi?: string;
    pmid?: string;
    s2PaperId?: string;
    sourceUrl?: string;
    confidence: "high" | "medium";
};

const LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gi;
const DOI_RE = /\b10\.\d{4,9}\/[\w.()\-;:\/]+\b/gi;
const PMID_RE = /\bPMID\s*[:#-]?\s*(\d{6,9})\b/gi;
const PUBMED_URL_RE = /https?:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{6,9})\/?/gi;
const QUOTED_TITLE_YEAR_RE = /["“]([^"”\n]{8,500})["”]\s*\((19\d{2}|20\d{2})\)/g;

const COMMENT_RE = /<!--\s*MENTIONED_STUDIES:\s*([\s\S]*?)\s*-->/i;
const COMMENT_OPEN_RE = /<!--\s*MENTIONED_STUDIES:\s*([\s\S]*)$/i;
const XML_RE = /<mentioned_studies>\s*([\s\S]*?)\s*<\/mentioned_studies>/i;
const FENCED_RE = /```(?:mentioned_studies|json)\s*([\s\S]*?)```/gi;
const PLACEHOLDER_MARKDOWN_LABELS = new Set([
    "doi",
    "pubmed",
    "pmid",
    "link",
    "source",
    "full text",
]);

const MentionedStudySchema = z.object({
    title: z.string().optional(),
    year: z.number().int().min(1900).max(2100).optional(),
    authors: z.string().optional(),
    doi: z.string().optional(),
    pmid: z.string().optional(),
    s2PaperId: z.string().optional(),
    sourceUrl: z.string().optional(),
    confidence: z.enum(["high", "medium"]).optional(),
});

function safeParseJson(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function normalizeTitleForKey(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function cleanTitle(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const cleaned = value
        .replace(/\s+/g, " ")
        .replace(/[\u201c\u201d]/g, '"')
        .trim();
    if (!cleaned) return undefined;
    return cleaned.length > 500 ? cleaned.slice(0, 500).trim() : cleaned;
}

function isPlaceholderMarkdownLabel(value: string | undefined): boolean {
    if (!value) return false;
    const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
    return PLACEHOLDER_MARKDOWN_LABELS.has(normalized);
}

function extractYear(value: string | undefined): number | undefined {
    if (!value) return undefined;
    const match = value.match(/\b(19\d{2}|20\d{2})\b/);
    if (!match) return undefined;
    const year = Number.parseInt(match[1], 10);
    if (!Number.isFinite(year)) return undefined;
    return year;
}

export function normalizeDoi(value: string | undefined): string | undefined {
    if (!value) return undefined;
    let trimmed = value.trim();
    if (!trimmed) return undefined;

    trimmed = trimmed
        .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
        .replace(/^doi\s*:\s*/i, "")
        .replace(/[),.;:\]]+$/g, "")
        .trim();

    if (!/^10\.\d{4,9}\/.+/i.test(trimmed)) return undefined;
    return trimmed.toLowerCase();
}

export function normalizePmid(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const digits = value.replace(/\D/g, "");
    if (digits.length < 6 || digits.length > 9) return undefined;
    return digits;
}

function normalizeS2PaperId(value: string | undefined): string | undefined {
    if (!value) return undefined;
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    return trimmed;
}

function getDedupeKey(candidate: {
    title?: string;
    year?: number;
    doi?: string;
    pmid?: string;
    s2PaperId?: string;
}): string | null {
    if (candidate.doi) return `doi:${candidate.doi}`;
    if (candidate.pmid) return `pmid:${candidate.pmid}`;
    if (candidate.s2PaperId) return `s2:${candidate.s2PaperId}`;

    const normalizedTitle = normalizeTitleForKey(candidate.title ?? "");
    if (!normalizedTitle) return null;
    if (candidate.year) return `title-year:${normalizedTitle}:${candidate.year}`;
    return `title:${normalizedTitle}`;
}

function mergeStudy(existing: MentionedStudy, incoming: MentionedStudy): MentionedStudy {
    return {
        key: existing.key,
        title: existing.title ?? incoming.title,
        year: existing.year ?? incoming.year,
        authors: existing.authors ?? incoming.authors,
        doi: existing.doi ?? incoming.doi,
        pmid: existing.pmid ?? incoming.pmid,
        s2PaperId: existing.s2PaperId ?? incoming.s2PaperId,
        sourceUrl: existing.sourceUrl ?? incoming.sourceUrl,
        confidence: existing.confidence === "high" || incoming.confidence === "high" ? "high" : "medium",
    };
}

function parseStructuredStudies(text: string): MentionedStudy[] {
    const candidates: MentionedStudy[] = [];

    const maybeParse = (raw: string) => {
        const parsed = safeParseJson(raw);
        const list = Array.isArray(parsed)
            ? parsed
            : parsed && typeof parsed === "object" && Array.isArray((parsed as { studies?: unknown[] }).studies)
                ? (parsed as { studies: unknown[] }).studies
                : [];

        for (const entry of list) {
            const valid = MentionedStudySchema.safeParse(entry);
            if (!valid.success) continue;
            const normalized = toMentionedStudy(valid.data, "high");
            if (normalized) candidates.push(normalized);
        }
    };

    const commentMatch = text.match(COMMENT_RE);
    if (commentMatch?.[1]) maybeParse(commentMatch[1]);

    const openCommentMatch = text.match(COMMENT_OPEN_RE);
    if (openCommentMatch?.[1]) maybeParse(openCommentMatch[1]);

    const xmlMatch = text.match(XML_RE);
    if (xmlMatch?.[1]) maybeParse(xmlMatch[1]);

    const fenced = [...text.matchAll(FENCED_RE)].map((m) => m[1]).filter(Boolean);
    for (const block of fenced) {
        if (!/"?(studies|doi|pmid|title)"?/i.test(block)) continue;
        maybeParse(block);
    }

    return dedupeStudies(candidates);
}

function parseFallbackStudies(text: string): MentionedStudy[] {
    const candidates: MentionedStudy[] = [];

    for (const match of text.matchAll(LINK_RE)) {
        const rawLabel = cleanTitle(match[1]);
        const label = isPlaceholderMarkdownLabel(rawLabel) ? undefined : rawLabel;
        const url = match[2];
        const doi = normalizeDoi(url);
        const pubmedUrl = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{6,9})/i);
        const pmid = normalizePmid(pubmedUrl?.[1]);
        const s2Match = url.match(/semanticscholar\.org\/paper\/[^/]+\/([A-Za-z0-9_-]{20,})/i);
        const s2PaperId = normalizeS2PaperId(s2Match?.[1]);

        const parsed = toMentionedStudy(
            {
                title: label,
                year: extractYear(label),
                doi,
                pmid,
                s2PaperId,
                sourceUrl: url,
            },
            doi || pmid || s2PaperId ? "high" : "medium"
        );

        if (parsed) candidates.push(parsed);
    }

    for (const match of text.matchAll(DOI_RE)) {
        const doi = normalizeDoi(match[0]);
        if (!doi) continue;
        const parsed = toMentionedStudy({ doi }, "medium");
        if (parsed) candidates.push(parsed);
    }

    for (const match of text.matchAll(PMID_RE)) {
        const pmid = normalizePmid(match[1]);
        if (!pmid) continue;
        const parsed = toMentionedStudy({ pmid }, "medium");
        if (parsed) candidates.push(parsed);
    }

    for (const match of text.matchAll(PUBMED_URL_RE)) {
        const pmid = normalizePmid(match[1]);
        if (!pmid) continue;
        const parsed = toMentionedStudy({ pmid, sourceUrl: match[0] }, "medium");
        if (parsed) candidates.push(parsed);
    }

    for (const match of text.matchAll(QUOTED_TITLE_YEAR_RE)) {
        const title = cleanTitle(match[1]);
        const year = Number.parseInt(match[2], 10);
        const parsed = toMentionedStudy({ title, year }, "medium");
        if (parsed) candidates.push(parsed);
    }

    return dedupeStudies(candidates);
}

function toMentionedStudy(
    input: {
        title?: string;
        year?: number;
        authors?: string;
        doi?: string;
        pmid?: string;
        s2PaperId?: string;
        sourceUrl?: string;
    },
    confidence: "high" | "medium"
): MentionedStudy | null {
    const title = cleanTitle(input.title);
    const doi = normalizeDoi(input.doi);
    const pmid = normalizePmid(input.pmid);
    const s2PaperId = normalizeS2PaperId(input.s2PaperId);
    const sourceUrl = input.sourceUrl?.trim()
        || (doi ? `https://doi.org/${doi}` : undefined)
        || (pmid ? `https://pubmed.ncbi.nlm.nih.gov/${pmid}/` : undefined);
    const key = getDedupeKey({ title, year: input.year, doi, pmid, s2PaperId });
    if (!key) return null;

    return {
        key,
        title,
        year: input.year,
        authors: cleanTitle(input.authors),
        doi,
        pmid,
        s2PaperId,
        sourceUrl,
        confidence,
    };
}

function dedupeStudies(studies: MentionedStudy[]): MentionedStudy[] {
    const byKey = new Map<string, MentionedStudy>();
    for (const study of studies) {
        const existing = byKey.get(study.key);
        if (!existing) {
            byKey.set(study.key, study);
            continue;
        }
        byKey.set(study.key, mergeStudy(existing, study));
    }
    return [...byKey.values()];
}

const MENTIONED_STUDIES_COMMENT_RE = /<!--\s*MENTIONED_STUDIES:\s*[\s\S]*?-->/gi;
const MENTIONED_STUDIES_COMMENT_OPEN_RE = /<!--\s*MENTIONED_STUDIES:\s*(?:(?!-->)[\s\S])*$/i;
const MENTIONED_STUDIES_XML_RE = /<mentioned_studies>\s*[\s\S]*?<\/mentioned_studies>/gi;
const MENTIONED_STUDIES_XML_OPEN_RE = /<mentioned_studies>[\s\S]*$/i;
const MENTIONED_STUDIES_FENCED_RE = /```mentioned_studies[\s\S]*?```/gi;
const MENTIONED_STUDIES_FENCED_OPEN_RE = /```mentioned_studies[\s\S]*$/i;

export function stripMentionedStudiesMarkup(text: string): string {
    return text
        .replace(MENTIONED_STUDIES_COMMENT_RE, "")
        .replace(MENTIONED_STUDIES_COMMENT_OPEN_RE, "")
        .replace(MENTIONED_STUDIES_XML_RE, "")
        .replace(MENTIONED_STUDIES_XML_OPEN_RE, "")
        .replace(MENTIONED_STUDIES_FENCED_RE, "")
        .replace(MENTIONED_STUDIES_FENCED_OPEN_RE, "")
        .trimEnd();
}

export function extractMentionedStudies(text: string): MentionedStudy[] {
    if (!text) return [];
    const structured = parseStructuredStudies(text);
    if (structured.length > 0) return structured;
    return parseFallbackStudies(text);
}
