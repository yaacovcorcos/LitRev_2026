/**
 * Query Planner (CAG-008)
 * Decomposes a natural language search intent into structured search queries
 * for PubMed (Boolean + MeSH) and Semantic Scholar (keywords + year range).
 *
 * Pure module — no server-only, no DB imports. Used by delegate_search
 * to produce a structured search plan before the sub-agent executes.
 *
 * The planner does NOT call any API — it produces a plan that the search
 * sub-agent interprets and executes via its available tools.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SearchIntent {
    /** Raw natural language search request from the user */
    rawTask: string;
    /** PICO elements extracted from protocol context, if available */
    pico?: {
        population?: string;
        intervention?: string;
        comparison?: string;
        outcome?: string;
    };
    /** Existing inclusion/exclusion criteria from protocol */
    criteria?: {
        inclusion?: string[];
        exclusion?: string[];
    };
    /** Year constraints from protocol methodology */
    yearRange?: { start?: number; end?: number };
}

export interface PubMedQuery {
    /** Fully formed PubMed query with Boolean operators and field tags */
    query: string;
    /** Human-readable label for this query (e.g., "Core PICO search") */
    label: string;
    /** Suggested max results for this query */
    maxResults: number;
}

export interface SemanticScholarQuery {
    /** Simple keyword query (no Boolean operators) */
    query: string;
    /** Human-readable label */
    label: string;
    /** Year range filter (format: "2020-2024") */
    yearRange?: string;
    /** Suggested max results */
    maxResults: number;
}

export interface SearchPlan {
    /** Original intent summary */
    objective: string;
    /** Recommended PubMed queries (ordered by priority) */
    pubmedQueries: PubMedQuery[];
    /** Recommended Semantic Scholar queries (ordered by priority) */
    semanticScholarQueries: SemanticScholarQuery[];
    /** Strategy notes for the sub-agent */
    strategyNotes: string[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Common MeSH-mappable study design terms */
const STUDY_DESIGN_MESH: Record<string, string> = {
    rct: "Randomized Controlled Trial[pt]",
    "randomized controlled trial": "Randomized Controlled Trial[pt]",
    "systematic review": "Systematic Review[pt]",
    "meta-analysis": "Meta-Analysis[pt]",
    "cohort study": "Cohort Studies[MeSH]",
    "case-control": "Case-Control Studies[MeSH]",
    "cross-sectional": "Cross-Sectional Studies[MeSH]",
    "case report": "Case Reports[pt]",
    "clinical trial": "Clinical Trial[pt]",
    "observational study": "Observational Study[pt]",
};

/** Wraps a concept in PubMed field tags for title/abstract search */
function tiabTerm(concept: string): string {
    const trimmed = concept.trim();
    if (!trimmed) return "";
    // Multi-word concepts get quotes
    if (trimmed.includes(" ")) return `"${trimmed}"[tiab]`;
    return `${trimmed}[tiab]`;
}

/** Wraps a concept as a MeSH term */
function meshTerm(concept: string): string {
    const trimmed = concept.trim();
    if (!trimmed) return "";
    if (trimmed.includes(" ")) return `"${trimmed}"[MeSH]`;
    return `${trimmed}[MeSH]`;
}

/** Combines terms with OR for synonym expansion */
function orGroup(terms: string[]): string {
    const filtered = terms.filter(Boolean);
    if (filtered.length === 0) return "";
    if (filtered.length === 1) return filtered[0];
    return `(${filtered.join(" OR ")})`;
}

/** Combines concept groups with AND */
function andJoin(groups: string[]): string {
    const filtered = groups.filter(Boolean);
    return filtered.join(" AND ");
}

/**
 * Extract key concepts from a natural language string.
 * Returns an array of noun phrases / meaningful terms.
 */
function extractConcepts(text: string): string[] {
    // Remove common filler words and extract meaningful phrases
    const stopWords = new Set([
        "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
        "of", "with", "by", "from", "is", "are", "was", "were", "be", "been",
        "being", "have", "has", "had", "do", "does", "did", "will", "would",
        "could", "should", "may", "might", "shall", "can", "this", "that",
        "these", "those", "i", "me", "my", "we", "our", "you", "your",
        "search", "find", "look", "studies", "study", "papers", "articles",
        "research", "literature", "about", "regarding", "concerning",
        "please", "help", "want", "need", "get", "show", "give",
    ]);

    const cleaned = text
        .toLowerCase()
        .replace(/[^\w\s-]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    // Split into potential phrases (split on common prepositions/conjunctions)
    const phrases = cleaned
        .split(/\b(?:and|or|for|with|in|on|of|using|versus|vs|compared to|between)\b/)
        .map(p => p.trim())
        .filter(Boolean);

    const concepts: string[] = [];
    for (const phrase of phrases) {
        const words = phrase.split(/\s+/).filter(w => !stopWords.has(w) && w.length > 2);
        if (words.length > 0) {
            // Keep multi-word phrases intact if they look like concepts
            const joined = words.join(" ");
            if (joined.length > 2) concepts.push(joined);
        }
    }

    return [...new Set(concepts)]; // deduplicate
}

/** Detect study design mentions in text */
function detectStudyDesigns(text: string): string[] {
    const lower = text.toLowerCase();
    const detected: string[] = [];
    for (const [pattern, meshQuery] of Object.entries(STUDY_DESIGN_MESH)) {
        if (lower.includes(pattern)) {
            detected.push(meshQuery);
        }
    }
    return detected;
}

/** Build year range string for Semantic Scholar */
function buildYearRange(range?: { start?: number; end?: number }): string | undefined {
    if (!range) return undefined;
    const { start, end } = range;
    if (start && end) return `${start}-${end}`;
    if (start) return `${start}-`;
    if (end) return `-${end}`;
    return undefined;
}

// ── Main Planner ─────────────────────────────────────────────────────────────

/**
 * Build a structured search plan from a search intent.
 * Returns PubMed queries (with Boolean/MeSH) and Semantic Scholar queries
 * (with keywords and year filtering).
 */
export function buildSearchPlan(intent: SearchIntent): SearchPlan {
    const { rawTask, pico, criteria, yearRange } = intent;

    const concepts = extractConcepts(rawTask);
    const studyDesigns = detectStudyDesigns(rawTask);
    const strategyNotes: string[] = [];
    const pubmedQueries: PubMedQuery[] = [];
    const semanticScholarQueries: SemanticScholarQuery[] = [];

    // Determine if we have PICO context
    const hasPico = pico && (pico.population || pico.intervention || pico.outcome);

    // ── Build PICO-based PubMed query ────────────────────────────────────

    if (hasPico) {
        const picoGroups: string[] = [];

        if (pico!.population) {
            picoGroups.push(orGroup([
                meshTerm(pico!.population),
                tiabTerm(pico!.population),
            ]));
        }
        if (pico!.intervention) {
            picoGroups.push(orGroup([
                meshTerm(pico!.intervention),
                tiabTerm(pico!.intervention),
            ]));
        }
        if (pico!.comparison) {
            picoGroups.push(orGroup([
                meshTerm(pico!.comparison),
                tiabTerm(pico!.comparison),
            ]));
        }
        if (pico!.outcome) {
            picoGroups.push(orGroup([
                meshTerm(pico!.outcome),
                tiabTerm(pico!.outcome),
            ]));
        }

        let picoQuery = andJoin(picoGroups);

        // Add study design filters if detected
        if (studyDesigns.length > 0) {
            picoQuery = andJoin([picoQuery, orGroup(studyDesigns)]);
        }

        // Add year range if available
        if (yearRange?.start || yearRange?.end) {
            const start = yearRange.start ?? 1900;
            const end = yearRange.end ?? 2099;
            picoQuery = andJoin([picoQuery, `${start}:${end}[dp]`]);
        }

        if (picoQuery) {
            pubmedQueries.push({
                query: picoQuery,
                label: "PICO-structured search",
                maxResults: 20,
            });
            strategyNotes.push("Primary search uses PICO elements from protocol with MeSH + title/abstract expansion.");
        }
    }

    // ── Build concept-based PubMed query (from raw task) ─────────────────

    if (concepts.length > 0) {
        const conceptGroups = concepts.map(c => orGroup([meshTerm(c), tiabTerm(c)]));
        let conceptQuery = andJoin(conceptGroups);

        if (studyDesigns.length > 0) {
            conceptQuery = andJoin([conceptQuery, orGroup(studyDesigns)]);
        }

        if (yearRange?.start || yearRange?.end) {
            const start = yearRange.start ?? 1900;
            const end = yearRange.end ?? 2099;
            conceptQuery = andJoin([conceptQuery, `${start}:${end}[dp]`]);
        }

        if (conceptQuery) {
            pubmedQueries.push({
                query: conceptQuery,
                label: hasPico ? "Concept-expansion search" : "Core concept search",
                maxResults: hasPico ? 10 : 20,
            });
            if (!hasPico) {
                strategyNotes.push("No protocol PICO available — using concepts extracted from the search request.");
            }
        }
    }

    // ── Build Semantic Scholar queries ────────────────────────────────────

    const ssYearRange = buildYearRange(yearRange);

    // Primary: use task directly as keyword query (SS does best with natural language)
    const primaryKeywords = concepts.slice(0, 5).join(" ");
    if (primaryKeywords) {
        semanticScholarQueries.push({
            query: primaryKeywords,
            label: "Primary keyword search",
            yearRange: ssYearRange,
            maxResults: 20,
        });
    }

    // If PICO available, add a PICO-derived keyword query
    if (hasPico) {
        const picoKeywords = [pico!.population, pico!.intervention, pico!.outcome]
            .filter(Boolean)
            .join(" ");
        if (picoKeywords && picoKeywords !== primaryKeywords) {
            semanticScholarQueries.push({
                query: picoKeywords,
                label: "PICO keyword search",
                yearRange: ssYearRange,
                maxResults: 15,
            });
        }
    }

    // ── Apply exclusion criteria as strategy notes ────────────────────────

    if (criteria?.exclusion && criteria.exclusion.length > 0) {
        strategyNotes.push(
            `Exclusion criteria to apply when selecting results: ${criteria.exclusion.join("; ")}`
        );
    }

    if (criteria?.inclusion && criteria.inclusion.length > 0) {
        strategyNotes.push(
            `Inclusion criteria for candidate selection: ${criteria.inclusion.join("; ")}`
        );
    }

    // ── Strategy recommendations ─────────────────────────────────────────

    if (pubmedQueries.length > 0 && semanticScholarQueries.length > 0) {
        strategyNotes.push("Run PubMed queries first (biomedical focus), then Semantic Scholar for broader coverage.");
    }

    strategyNotes.push("Flag duplicates before adding to ledger. Only add candidates with clear relevance.");

    // ── Build objective summary ──────────────────────────────────────────

    const objective = hasPico
        ? `Search for studies matching protocol PICO: ${[pico!.population, pico!.intervention, pico!.comparison, pico!.outcome].filter(Boolean).join(" / ")}`
        : `Search for: ${rawTask}`;

    return {
        objective,
        pubmedQueries,
        semanticScholarQueries,
        strategyNotes,
    };
}

/**
 * Format a SearchPlan into a structured task description for the search sub-agent.
 * This replaces the raw task string with an explicit search plan.
 */
export function formatSearchPlanAsTask(plan: SearchPlan): string {
    const lines: string[] = [];

    lines.push(`## Search Objective\n${plan.objective}`);

    if (plan.pubmedQueries.length > 0) {
        lines.push("\n## PubMed Queries (execute in order)");
        for (const q of plan.pubmedQueries) {
            lines.push(`\n### ${q.label}`);
            lines.push(`Query: \`${q.query}\``);
            lines.push(`Max results: ${q.maxResults}`);
        }
    }

    if (plan.semanticScholarQueries.length > 0) {
        lines.push("\n## Semantic Scholar Queries");
        for (const q of plan.semanticScholarQueries) {
            lines.push(`\n### ${q.label}`);
            lines.push(`Query: "${q.query}"`);
            if (q.yearRange) lines.push(`Year range: ${q.yearRange}`);
            lines.push(`Max results: ${q.maxResults}`);
        }
    }

    if (plan.strategyNotes.length > 0) {
        lines.push("\n## Strategy Notes");
        for (const note of plan.strategyNotes) {
            lines.push(`- ${note}`);
        }
    }

    lines.push("\n## Instructions");
    lines.push("Execute the queries above using the appropriate search tools.");
    lines.push("After each search, evaluate results for relevance and add strong candidates to the ledger.");
    lines.push("Report: queries executed, total results found, candidates added, and any coverage gaps.");

    return lines.join("\n");
}
