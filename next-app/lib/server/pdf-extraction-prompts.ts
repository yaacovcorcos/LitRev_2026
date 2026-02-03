import "server-only";

/**
 * System prompt for AI-based academic paper extraction
 */
export const EXTRACTION_SYSTEM_PROMPT = `You are extracting metadata from an academic research paper.

Return ONLY valid JSON (no markdown, no explanation, no code fences):
{
  "abstract": "Full abstract text if found",
  "studyType": "RCT|Cohort|Case-Control|Systematic-Review|Meta-Analysis|Cross-Sectional|Case-Report|Other",
  "keywords": ["keyword1", "keyword2"],
  "aiSummary": "2-3 sentence summary of key findings and methodology",
  "journal": "Journal name if found",
  "_confidence": {
    "abstract": "high|medium|low",
    "studyType": "high|medium|low",
    "keywords": "high|medium|low"
  }
}

StudyType detection rules:
- RCT: Look for "randomized", "randomised", "RCT", "random allocation", "blinded", "placebo-controlled"
- Cohort: Look for "cohort study", "prospective", "retrospective cohort", "follow-up study"
- Systematic-Review: Look for "systematic review", "PRISMA", "searched databases", "literature search"
- Meta-Analysis: Look for "meta-analysis", "pooled analysis", "forest plot", "heterogeneity"
- Case-Control: Look for "case-control", "cases and controls", "odds ratio"
- Cross-Sectional: Look for "cross-sectional", "survey", "prevalence study"
- Case-Report: Look for "case report", "case series", "we present a case"
- If unclear or mixed, use "Other"

Rules:
1. Omit fields you cannot confidently extract - do not guess
2. The abstract should be the complete abstract text, not a summary
3. Keywords should come from the paper's keyword list if present
4. aiSummary should highlight the main findings and clinical relevance
5. Return ONLY the JSON object, nothing else`;

/**
 * Build the user prompt with PDF text and any regex findings
 */
export function buildExtractionUserPrompt(
    text: string,
    regexFindings: {
        doi?: string;
        pmid?: string;
        year?: number;
        title?: string;
        authors?: string;
    }
): string {
    const lines: string[] = [];

    lines.push("Extract metadata from this academic paper.");
    lines.push("");

    // Include regex findings as hints (already extracted, AI can verify or supplement)
    if (regexFindings.doi || regexFindings.pmid || regexFindings.year) {
        lines.push("Already extracted (verify if possible):");
        if (regexFindings.doi) lines.push(`- DOI: ${regexFindings.doi}`);
        if (regexFindings.pmid) lines.push(`- PMID: ${regexFindings.pmid}`);
        if (regexFindings.year) lines.push(`- Year: ${regexFindings.year}`);
        lines.push("");
    }

    lines.push("--- PAPER TEXT ---");
    lines.push(text);
    lines.push("--- END OF TEXT ---");

    return lines.join("\n");
}
