import "server-only";

import { XMLParser } from "fast-xml-parser";

const DOI_REGEX = /10\.\d{4,9}\/[\w./;()<>:-]+/i;

export type GrobidHeaderExtraction = {
    title?: string;
    authors?: string;
    abstract?: string;
    doi?: string;
    journal?: string;
    year?: number;
};

function asArray<T>(value: T | T[] | null | undefined): T[] {
    if (Array.isArray(value)) return value;
    if (value == null) return [];
    return [value];
}

function normalizeWhitespace(value: string): string {
    return value.replace(/\s+/g, " ").trim();
}

function extractText(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    if (!value || typeof value !== "object") return "";

    const node = value as Record<string, unknown>;
    const parts: string[] = [];

    if (typeof node["#text"] === "string" || typeof node["#text"] === "number") {
        parts.push(String(node["#text"]));
    }

    for (const [key, child] of Object.entries(node)) {
        if (key.startsWith("@") || key === "#text") continue;
        if (Array.isArray(child)) {
            for (const entry of child) {
                const text = extractText(entry);
                if (text) parts.push(text);
            }
        } else {
            const text = extractText(child);
            if (text) parts.push(text);
        }
    }

    return parts.join(" ");
}

function firstNonEmpty(...values: Array<string | null | undefined>): string | undefined {
    for (const value of values) {
        if (!value) continue;
        const normalized = normalizeWhitespace(value);
        if (normalized) return normalized;
    }
    return undefined;
}

function parseYear(value: unknown): number | undefined {
    const text = extractText(value);
    const match = text.match(/(?:19|20)\d{2}/);
    if (!match) return undefined;
    const year = Number(match[0]);
    const maxAllowed = new Date().getFullYear() + 1;
    if (year < 1900 || year > maxAllowed) return undefined;
    return year;
}

function parseDoiCandidate(value: unknown): string | undefined {
    const text = normalizeWhitespace(extractText(value));
    if (!text) return undefined;
    const match = text.match(DOI_REGEX);
    if (!match) return undefined;
    return match[0].replace(/[.,;:]+$/, "");
}

function parseAuthorName(authorNode: unknown): string | undefined {
    if (!authorNode || typeof authorNode !== "object") return undefined;
    const node = authorNode as Record<string, unknown>;
    const persName = (node.persName as Record<string, unknown> | undefined) ?? node;

    const surnames = asArray(persName.surname)
        .map((entry) => normalizeWhitespace(extractText(entry)))
        .filter(Boolean);
    const forenames = asArray(persName.forename)
        .map((entry) => normalizeWhitespace(extractText(entry)))
        .filter(Boolean);

    const surname = surnames[0];
    const given = forenames.join(" ").trim();
    return firstNonEmpty(
        given && surname ? `${given} ${surname}` : undefined,
        surname,
        given,
        normalizeWhitespace(extractText(authorNode))
    );
}

export function parseGrobidHeaderXml(xml: string): GrobidHeaderExtraction | null {
    if (!xml || !xml.trim()) return null;

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@",
        removeNSPrefix: true,
        trimValues: true,
        parseTagValue: true,
    });

    let parsed: unknown;
    try {
        parsed = parser.parse(xml);
    } catch {
        return null;
    }

    const root = parsed as { TEI?: Record<string, unknown> };
    const tei = root.TEI;
    if (!tei || typeof tei !== "object") return null;

    const teiHeader = tei.teiHeader as Record<string, unknown> | undefined;
    const fileDesc = teiHeader?.fileDesc as Record<string, unknown> | undefined;
    const sourceDesc = fileDesc?.sourceDesc as Record<string, unknown> | undefined;
    const biblStruct = sourceDesc?.biblStruct as Record<string, unknown> | undefined;
    const analytic = biblStruct?.analytic as Record<string, unknown> | undefined;
    const monogr = biblStruct?.monogr as Record<string, unknown> | undefined;
    const imprint = monogr?.imprint as Record<string, unknown> | undefined;
    const profileDesc = teiHeader?.profileDesc as Record<string, unknown> | undefined;

    const title = firstNonEmpty(
        extractText(fileDesc?.titleStmt as unknown),
        extractText(analytic?.title),
        extractText(monogr?.title)
    );

    const authorNames = asArray(analytic?.author)
        .map(parseAuthorName)
        .filter((name): name is string => Boolean(name));

    const idNodes = [
        ...asArray(analytic?.idno),
        ...asArray(monogr?.idno),
        ...asArray(biblStruct?.idno),
    ];
    const doi = idNodes
        .map((idNode) => {
            if (!idNode || typeof idNode !== "object") return parseDoiCandidate(idNode);
            const node = idNode as Record<string, unknown>;
            const type = String(node["@type"] ?? "").toLowerCase();
            if (type && type !== "doi") return undefined;
            return parseDoiCandidate(idNode);
        })
        .find((value): value is string => Boolean(value));

    const journal = firstNonEmpty(extractText(monogr?.title));
    const year = parseYear((imprint?.date as unknown) ?? (biblStruct?.date as unknown));

    const abstractText = normalizeWhitespace(extractText(profileDesc?.abstract));
    const abstract = abstractText.length > 0 ? abstractText : undefined;

    const extraction: GrobidHeaderExtraction = {
        title,
        authors: authorNames.length > 0 ? authorNames.join(", ") : undefined,
        abstract,
        doi,
        journal,
        year,
    };

    const hasData = Object.values(extraction).some((value) => {
        if (typeof value === "number") return Number.isFinite(value);
        return typeof value === "string" && value.length > 0;
    });

    return hasData ? extraction : null;
}

function getGrobidConfig(): { url: string; timeoutMs: number } | null {
    const url = process.env.GROBID_URL?.trim();
    if (!url) return null;

    const timeoutRaw = process.env.GROBID_TIMEOUT_MS;
    const parsedTimeout = timeoutRaw ? Number(timeoutRaw) : NaN;
    const timeoutMs = Number.isFinite(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 15000;

    return {
        url: url.replace(/\/+$/, ""),
        timeoutMs,
    };
}

export async function extractHeaderWithGrobid(pdfBuffer: Buffer): Promise<GrobidHeaderExtraction | null> {
    const config = getGrobidConfig();
    if (!config) return null;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
        const formData = new FormData();
        const fileBytes = Uint8Array.from(pdfBuffer);
        const fileBlob = new Blob([fileBytes], { type: "application/pdf" });
        formData.append("input", fileBlob, "paper.pdf");

        const response = await fetch(`${config.url}/api/processHeaderDocument`, {
            method: "POST",
            body: formData,
            signal: controller.signal,
        });

        if (!response.ok) {
            console.warn(`[grobid] Header extraction failed: ${response.status} ${response.statusText}`);
            return null;
        }

        const teiXml = await response.text();
        return parseGrobidHeaderXml(teiXml);
    } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
            console.warn("[grobid] Header extraction timed out");
        } else {
            console.warn("[grobid] Header extraction request failed", error);
        }
        return null;
    } finally {
        clearTimeout(timeoutId);
    }
}
