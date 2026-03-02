/**
 * Criteria Matching Utilities
 * Functions to check if studies match protocol eligibility criteria
 */

import type { Study, StudyType } from "@/types/ledger";
import type { ProtocolData } from "@/types/protocol";

/** Mapping from StudyType to protocol study design strings */
const STUDY_TYPE_TO_DESIGN: Record<StudyType, string[]> = {
    "RCT": ["Randomized Controlled Trials (RCTs)", "RCT", "Randomized"],
    "Cohort": ["Prospective Cohort Studies", "Retrospective Cohort Studies", "Cohort"],
    "Case-Control": ["Case-Control Studies", "Case-Control"],
    "Cross-Sectional": ["Cross-sectional Studies", "Cross-Sectional"],
    "Case-Report": ["Case Reports", "Case Series"],
    "Meta-Analysis": ["Meta-analyses", "Meta-Analysis"],
    "Systematic-Review": ["Systematic Reviews", "Systematic Review"],
    "Other": [],
};

/**
 * Check if a study's year falls within the protocol time frame
 */
export function matchesYearRange(study: Study, protocol: ProtocolData): boolean {
    const { timeFrameStart, timeFrameEnd } = protocol.methodology;

    // If no time frame specified, consider it a match
    if (!timeFrameStart && !timeFrameEnd) return true;

    const startYear = parseInt(timeFrameStart, 10);
    const endYear = parseInt(timeFrameEnd, 10);

    // Check start year
    if (!isNaN(startYear) && study.year < startYear) {
        return false;
    }

    // Check end year
    if (!isNaN(endYear) && study.year > endYear) {
        return false;
    }

    return true;
}

/**
 * Check if a study's design matches the protocol study designs
 */
export function matchesStudyDesign(study: Study, protocol: ProtocolData): boolean {
    const { studyDesigns } = protocol.methodology;

    // If no study designs specified, consider it a match
    if (!studyDesigns.length) return true;

    const studyType = study.details?.studyType;
    if (!studyType) return false; // Unknown study type can't match

    // Get the design strings that match this study type
    const matchingDesigns = STUDY_TYPE_TO_DESIGN[studyType] || [];

    // Check if any protocol design matches
    return studyDesigns.some(design => {
        const designLower = design.toLowerCase();
        return matchingDesigns.some(match =>
            designLower.includes(match.toLowerCase()) ||
            match.toLowerCase().includes(designLower)
        );
    });
}

/**
 * Get exclusion reasons based on protocol criteria
 */
export function getExclusionReasons(study: Study, protocol: ProtocolData): string[] {
    const reasons: string[] = [];

    // Check year range
    if (!matchesYearRange(study, protocol)) {
        const { timeFrameStart, timeFrameEnd } = protocol.methodology;
        if (timeFrameStart && timeFrameEnd) {
            reasons.push(`Published outside time frame (${timeFrameStart}-${timeFrameEnd})`);
        } else if (timeFrameStart) {
            reasons.push(`Published before ${timeFrameStart}`);
        } else if (timeFrameEnd) {
            reasons.push(`Published after ${timeFrameEnd}`);
        }
    }

    // Check study design
    if (protocol.methodology.studyDesigns.length > 0 && !matchesStudyDesign(study, protocol)) {
        const studyType = study.details?.studyType || "Unknown";
        reasons.push(`Study design (${studyType}) not in protocol criteria`);
    }

    return reasons;
}

/**
 * Calculate eligibility score (0-100) based on how well a study matches the protocol
 */
export function calculateEligibilityScore(study: Study, protocol: ProtocolData): number {
    let score = 100;
    let checks = 0;
    let passed = 0;

    // Year range check
    if (protocol.methodology.timeFrameStart || protocol.methodology.timeFrameEnd) {
        checks++;
        if (matchesYearRange(study, protocol)) passed++;
    }

    // Study design check
    if (protocol.methodology.studyDesigns.length > 0) {
        checks++;
        if (matchesStudyDesign(study, protocol)) passed++;
    }

    // If there were checks, calculate percentage
    if (checks > 0) {
        score = Math.round((passed / checks) * 100);
    }

    return score;
}

/**
 * Full criteria match result
 */
export type CriteriaMatchResult = {
    matchesYearRange: boolean;
    matchesStudyDesign: boolean;
    eligibilityScore: number;
    exclusionReasons: string[];
    meetsAllCriteria: boolean;
};

export type HighConfidenceExclusionResult = {
    exclude: boolean;
    reasons: string[];
};

/**
 * Evaluate all criteria for a study
 */
export function evaluateCriteria(study: Study, protocol: ProtocolData): CriteriaMatchResult {
    const yearMatch = matchesYearRange(study, protocol);
    const designMatch = matchesStudyDesign(study, protocol);
    const score = calculateEligibilityScore(study, protocol);
    const reasons = getExclusionReasons(study, protocol);

    return {
        matchesYearRange: yearMatch,
        matchesStudyDesign: designMatch,
        eligibilityScore: score,
        exclusionReasons: reasons,
        meetsAllCriteria: reasons.length === 0,
    };
}

/**
 * Conservative deterministic exclusion gate for screening cost optimization.
 * Only excludes when protocol constraints are explicit and study metadata is explicit.
 */
export function isHighConfidenceExclusion(
    study: Study,
    protocol: ProtocolData
): HighConfidenceExclusionResult {
    const reasons: string[] = [];

    const hasYearConstraint = Boolean(protocol.methodology.timeFrameStart || protocol.methodology.timeFrameEnd);
    const hasKnownYear = Number.isFinite(study.year) && study.year > 0;
    if (hasYearConstraint && hasKnownYear && !matchesYearRange(study, protocol)) {
        const { timeFrameStart, timeFrameEnd } = protocol.methodology;
        if (timeFrameStart && timeFrameEnd) {
            reasons.push(`Published outside protocol time frame (${timeFrameStart}-${timeFrameEnd})`);
        } else if (timeFrameStart) {
            reasons.push(`Published before protocol start year (${timeFrameStart})`);
        } else if (timeFrameEnd) {
            reasons.push(`Published after protocol end year (${timeFrameEnd})`);
        }
    }

    const protocolHasDesigns = protocol.methodology.studyDesigns.length > 0;
    const studyType = study.details?.studyType;
    const hasKnownDesign = typeof studyType === "string" && studyType.length > 0 && studyType !== "Other";
    if (protocolHasDesigns && hasKnownDesign && !matchesStudyDesign(study, protocol)) {
        reasons.push(`Study design (${studyType}) is outside protocol design criteria`);
    }

    return {
        exclude: reasons.length > 0,
        reasons,
    };
}

/**
 * PRISMA Flow Counts
 */
export type PRISMAFlowCounts = {
    /** Total records identified from databases */
    recordsIdentified: number;
    /** Records after duplicates removed (currently same as identified) */
    recordsAfterDuplicates: number;
    /** Records screened (all studies) */
    recordsScreened: number;
    /** Records excluded during screening */
    recordsExcludedScreening: number;
    /** Full-text articles assessed for eligibility */
    fullTextAssessed: number;
    /** Full-text articles excluded (with reasons) */
    fullTextExcluded: number;
    /** Studies included in qualitative synthesis */
    includedQualitative: number;
    /** Studies included in quantitative synthesis (meta-analysis) */
    includedQuantitative: number;
    /** Studies marked as "maybe" (needs review) */
    needsReview: number;
    /** Studies meeting protocol criteria */
    meetsCriteria: number;
    /** Studies not meeting protocol criteria */
    failsCriteria: number;
};

/**
 * Calculate PRISMA flow diagram counts from studies and protocol
 */
export function calculatePRISMACounts(studies: Study[], protocol: ProtocolData): PRISMAFlowCounts {
    let recordsExcludedScreening = 0;
    let includedQualitative = 0;
    let needsReview = 0;
    let meetsCriteria = 0;
    let failsCriteria = 0;

    for (const study of studies) {
        const decision = study.details?.triageDecision;

        if (decision === "exclude") {
            recordsExcludedScreening++;
        } else if (decision === "keep") {
            includedQualitative++;
        } else if (decision === "maybe") {
            needsReview++;
        }

        // Check protocol criteria
        const match = evaluateCriteria(study, protocol);
        if (match.meetsAllCriteria) {
            meetsCriteria++;
        } else {
            failsCriteria++;
        }
    }

    return {
        recordsIdentified: studies.length,
        recordsAfterDuplicates: studies.length, // Duplicate detection not implemented yet
        recordsScreened: studies.length,
        recordsExcludedScreening,
        fullTextAssessed: includedQualitative + needsReview,
        fullTextExcluded: recordsExcludedScreening,
        includedQualitative,
        includedQuantitative: 0, // Meta-analysis inclusion not tracked yet
        needsReview,
        meetsCriteria,
        failsCriteria,
    };
}
