import "server-only";

/**
 * Stage 1: Quick Extract — bibliographic metadata + verbatim abstract
 */
export const QUICK_EXTRACT_SYSTEM_PROMPT = `You are extracting bibliographic metadata from an academic research paper.

Return ONLY valid JSON (no markdown, no explanation, no code fences):
{
  "title": "Full title of the paper",
  "authors": "LastName1 Initials, LastName2 Initials, ...",
  "year": 2024,
  "journal": "Journal Name",
  "volume": "12",
  "issue": "3",
  "pages": "123-145",
  "doi": "10.xxxx/xxxxx",
  "pmid": "12345678",
  "abstract": "Complete abstract text copied verbatim from the paper"
}

Rules:
1. Copy the abstract EXACTLY as it appears in the paper — do not summarize, rephrase, or shorten it
2. For authors, use standard academic format: "Smith J, Doe AB, Garcia-Lopez M"
3. Omit any field you cannot confidently find — do not guess or fabricate
4. Return ONLY the JSON object, nothing else`;

/**
 * Stage 2: Deep Analysis — summary, classification, quality assessment
 */
export const DEEP_ANALYSIS_SYSTEM_PROMPT = `You are performing an in-depth analysis of an academic research paper for a systematic literature review.

Return ONLY valid JSON (no markdown, no explanation, no code fences):
{
  "aiSummary": "2-3 sentence summary of key findings, methodology, and clinical/scientific relevance",
  "studyType": "RCT|Cohort|Case-Control|Systematic-Review|Meta-Analysis|Cross-Sectional|Case-Report|Other",
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "quality": "High|Medium|Low",
  "qualityRationale": "Brief explanation of why this quality rating was assigned",
  "sampleSize": 150,
  "primaryOutcome": "30-day mortality"
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

Quality assessment criteria:
- High: Clear methodology, appropriate sample size, proper controls, valid statistical analysis, peer-reviewed in reputable journal
- Medium: Adequate methodology with some limitations, moderate sample size, reasonable analysis
- Low: Weak methodology, small sample, significant biases, missing controls or unclear methods

Rules:
1. The aiSummary should focus on the main findings, methodology used, and significance — not just restate the abstract
2. Keywords should come from the paper's keyword list if present; otherwise infer the 3-5 most relevant terms
3. The qualityRationale must justify the quality rating with specific observations from the paper
4. Omit fields you cannot confidently determine — do not guess
5. Include sampleSize and primaryOutcome if clearly stated in the paper; omit if not explicit
6. Return ONLY the JSON object, nothing else`;

/**
 * Build user prompt for Stage 1 quick extraction
 */
export function buildQuickExtractPrompt(
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

  lines.push("Extract bibliographic metadata from this academic paper.");
  lines.push("");

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

/**
 * Build user prompt for Stage 2 deep analysis
 */
export function buildDeepAnalysisPrompt(
  text: string,
  existingDetails: {
    title?: string;
    authors?: string;
    abstract?: string;
    journal?: string;
  }
): string {
  const lines: string[] = [];

  lines.push("Perform an in-depth analysis of this academic paper.");
  lines.push("");

  lines.push("Known metadata:");
  if (existingDetails.title) lines.push(`- Title: ${existingDetails.title}`);
  if (existingDetails.authors) lines.push(`- Authors: ${existingDetails.authors}`);
  if (existingDetails.journal) lines.push(`- Journal: ${existingDetails.journal}`);
  lines.push("");

  lines.push("--- PAPER TEXT ---");
  lines.push(text);
  lines.push("--- END OF TEXT ---");

  return lines.join("\n");
}

// Backwards-compatible exports for existing extractStudyFromPdfAction
export const EXTRACTION_SYSTEM_PROMPT = QUICK_EXTRACT_SYSTEM_PROMPT;
export const buildExtractionUserPrompt = buildQuickExtractPrompt;
