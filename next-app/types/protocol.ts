/**
 * Protocol types for systematic review protocol data.
 * This defines the structure for PICO framework, eligibility criteria,
 * search strategy, and methodology sections.
 */

/** PICO Framework - Population, Intervention, Comparison, Outcome */
export interface PICOData {
    population: string;
    intervention: string;
    comparison: string;
    outcome: string;
}

/** Eligibility criteria for study inclusion/exclusion */
export interface EligibilityData {
    inclusion: string[];
    exclusion: string[];
}

/** Search strategy configuration */
export interface SearchStrategyData {
    query: string;
    databases: string[];
}

/** Common study design types for systematic reviews */
export const STUDY_DESIGN_OPTIONS = [
    "Randomized Controlled Trials (RCTs)",
    "Non-randomized Controlled Trials",
    "Prospective Cohort Studies",
    "Retrospective Cohort Studies",
    "Case-Control Studies",
    "Cross-sectional Studies",
    "Case Series",
    "Case Reports",
    "Diagnostic Accuracy Studies",
    "Systematic Reviews",
    "Meta-analyses",
] as const;

export type StudyDesignType = typeof STUDY_DESIGN_OPTIONS[number];

/** Methodology section - study designs, time frame, quality assessment */
export interface MethodologyData {
    /** Included study design types */
    studyDesigns: string[];
    /** Publication date range - start */
    timeFrameStart: string;
    /** Publication date range - end */
    timeFrameEnd: string;
    /** Quality/risk of bias assessment tool */
    qualityAssessmentTool: string;
    /** Additional notes about methodology */
    qualityAssessmentNotes: string;
}

/** Complete protocol data for a project */
export interface ProtocolData {
    pico: PICOData;
    eligibility: EligibilityData;
    searchStrategy: SearchStrategyData;
    methodology: MethodologyData;
}

/** Protocol section identifiers for context tracking */
export type ProtocolSection =
    | "pico-population"
    | "pico-intervention"
    | "pico-comparison"
    | "pico-outcome"
    | "eligibility-inclusion"
    | "eligibility-exclusion"
    | "search-query"
    | "search-databases"
    | "methodology-designs"
    | "methodology-timeframe"
    | "methodology-quality"
    | null;

/** Human-readable labels for protocol sections */
export const PROTOCOL_SECTION_LABELS: Record<NonNullable<ProtocolSection>, string> = {
    "pico-population": "Population",
    "pico-intervention": "Intervention",
    "pico-comparison": "Comparison",
    "pico-outcome": "Outcome",
    "eligibility-inclusion": "Inclusion Criteria",
    "eligibility-exclusion": "Exclusion Criteria",
    "search-query": "Search Query",
    "search-databases": "Databases",
    "methodology-designs": "Study Designs",
    "methodology-timeframe": "Time Frame",
    "methodology-quality": "Quality Assessment",
};

/** Get human-readable label for a section */
export function getProtocolSectionLabel(section: ProtocolSection): string {
    if (!section) return "Protocol";
    return PROTOCOL_SECTION_LABELS[section] ?? "Protocol";
}

/** Default/empty protocol data */
export function createDefaultProtocolData(): ProtocolData {
    return {
        pico: {
            population: "",
            intervention: "",
            comparison: "",
            outcome: "",
        },
        eligibility: {
            inclusion: [],
            exclusion: [],
        },
        searchStrategy: {
            query: "",
            databases: [],
        },
        methodology: {
            studyDesigns: [],
            timeFrameStart: "",
            timeFrameEnd: "",
            qualityAssessmentTool: "",
            qualityAssessmentNotes: "",
        },
    };
}
