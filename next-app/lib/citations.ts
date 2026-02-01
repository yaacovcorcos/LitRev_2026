import type { Study, StudyDetails } from "@/types/ledger";

export type CitationStyle = "vancouver" | "apa" | "harvard" | "chicago";

/**
 * Format a study as a citation in the specified style.
 */
export function formatCitation(study: Study, style: CitationStyle): string {
    const d: StudyDetails = study.details ?? {};
    const authors = study.authors || "Unknown";
    const title = study.title || "Untitled";
    const year = study.year || new Date().getFullYear();
    const journal = d.journal || "";
    const volume = d.volume || "";
    const issue = d.issue || "";
    const pages = d.pages || "";

    switch (style) {
        case "vancouver":
            return formatVancouver(authors, title, year, journal, volume, issue, pages);
        case "apa":
            return formatAPA(authors, title, year, journal, volume, issue, pages);
        case "harvard":
            return formatHarvard(authors, title, year, journal, volume, issue, pages);
        case "chicago":
            return formatChicago(authors, title, year, journal, volume, issue, pages);
        default:
            return formatVancouver(authors, title, year, journal, volume, issue, pages);
    }
}

/**
 * Vancouver style (numbered, common in medicine)
 * Format: Authors. Title. Journal. Year;Volume(Issue):Pages.
 */
function formatVancouver(
    authors: string,
    title: string,
    year: number,
    journal: string,
    volume: string,
    issue: string,
    pages: string
): string {
    let citation = `${authors}. ${title}.`;
    if (journal) {
        citation += ` ${journal}.`;
        citation += ` ${year}`;
        if (volume) citation += `;${volume}`;
        if (issue) citation += `(${issue})`;
        if (pages) citation += `:${pages}`;
        citation += ".";
    } else {
        citation += ` ${year}.`;
    }
    return citation;
}

/**
 * APA style (7th edition)
 * Format: Authors (Year). Title. Journal, Volume(Issue), Pages.
 */
function formatAPA(
    authors: string,
    title: string,
    year: number,
    journal: string,
    volume: string,
    issue: string,
    pages: string
): string {
    let citation = `${authors} (${year}). ${title}.`;
    if (journal) {
        citation += ` ${journal}`;
        if (volume) citation += `, ${volume}`;
        if (issue) citation += `(${issue})`;
        if (pages) citation += `, ${pages}`;
        citation += ".";
    }
    return citation;
}

/**
 * Harvard style
 * Format: Authors (Year) 'Title', Journal, Volume(Issue), pp. Pages.
 */
function formatHarvard(
    authors: string,
    title: string,
    year: number,
    journal: string,
    volume: string,
    issue: string,
    pages: string
): string {
    let citation = `${authors} (${year}) '${title}'`;
    if (journal) {
        citation += `, ${journal}`;
        if (volume) citation += `, ${volume}`;
        if (issue) citation += `(${issue})`;
        if (pages) citation += `, pp. ${pages}`;
    }
    citation += ".";
    return citation;
}

/**
 * Chicago style (Author-Date)
 * Format: Authors. Year. "Title." Journal Volume, no. Issue: Pages.
 */
function formatChicago(
    authors: string,
    title: string,
    year: number,
    journal: string,
    volume: string,
    issue: string,
    pages: string
): string {
    let citation = `${authors}. ${year}. "${title}."`;
    if (journal) {
        citation += ` ${journal}`;
        if (volume) citation += ` ${volume}`;
        if (issue) citation += `, no. ${issue}`;
        if (pages) citation += `: ${pages}`;
        citation += ".";
    }
    return citation;
}

/**
 * Get all available citation styles.
 */
export function getCitationStyles(): { value: CitationStyle; label: string }[] {
    return [
        { value: "vancouver", label: "Vancouver" },
        { value: "apa", label: "APA (7th)" },
        { value: "harvard", label: "Harvard" },
        { value: "chicago", label: "Chicago" },
    ];
}
