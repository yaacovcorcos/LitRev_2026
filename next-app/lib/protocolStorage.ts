/**
 * Storage utility for protocol data.
 * Follows the same pattern as other storage modules (projectCopilotStorage, ledgerStorage).
 * Each project has its own protocol data stored in localStorage.
 */

import {
    ProtocolData,
    PICOData,
    EligibilityData,
    SearchStrategyData,
    MethodologyData,
    createDefaultProtocolData,
} from "@/types/protocol";

const PROTOCOL_KEY_PREFIX = "litrev_protocol_v2";

function isBrowser(): boolean {
    return typeof window !== "undefined";
}

function storageKey(projectId: string): string {
    return `${PROTOCOL_KEY_PREFIX}:${projectId}`;
}

/** Validate and sanitize PICO data */
function validatePICO(pico: Partial<PICOData> | undefined): PICOData {
    const defaults = createDefaultProtocolData().pico;
    if (!pico || typeof pico !== "object") return defaults;

    return {
        population: typeof pico.population === "string" ? pico.population : defaults.population,
        intervention: typeof pico.intervention === "string" ? pico.intervention : defaults.intervention,
        comparison: typeof pico.comparison === "string" ? pico.comparison : defaults.comparison,
        outcome: typeof pico.outcome === "string" ? pico.outcome : defaults.outcome,
    };
}

/** Validate and sanitize eligibility data */
function validateEligibility(eligibility: Partial<EligibilityData> | undefined): EligibilityData {
    const defaults = createDefaultProtocolData().eligibility;
    if (!eligibility || typeof eligibility !== "object") return defaults;

    const inclusion: string[] = [];
    const exclusion: string[] = [];

    if (Array.isArray(eligibility.inclusion)) {
        for (const item of eligibility.inclusion) {
            if (typeof item === "string" && item.trim()) {
                inclusion.push(item.trim());
            }
        }
    }

    if (Array.isArray(eligibility.exclusion)) {
        for (const item of eligibility.exclusion) {
            if (typeof item === "string" && item.trim()) {
                exclusion.push(item.trim());
            }
        }
    }

    return { inclusion, exclusion };
}

/** Validate and sanitize search strategy data */
function validateSearchStrategy(strategy: Partial<SearchStrategyData> | undefined): SearchStrategyData {
    const defaults = createDefaultProtocolData().searchStrategy;
    if (!strategy || typeof strategy !== "object") return defaults;

    const databases: string[] = [];
    if (Array.isArray(strategy.databases)) {
        for (const db of strategy.databases) {
            if (typeof db === "string" && db.trim()) {
                databases.push(db.trim());
            }
        }
    }

    return {
        query: typeof strategy.query === "string" ? strategy.query : defaults.query,
        databases,
    };
}

/** Validate and sanitize methodology data */
function validateMethodology(methodology: Partial<MethodologyData> | undefined): MethodologyData {
    const defaults = createDefaultProtocolData().methodology;
    if (!methodology || typeof methodology !== "object") return defaults;

    const studyDesigns: string[] = [];
    if (Array.isArray(methodology.studyDesigns)) {
        for (const design of methodology.studyDesigns) {
            if (typeof design === "string" && design.trim()) {
                studyDesigns.push(design.trim());
            }
        }
    }

    return {
        studyDesigns,
        timeFrameStart: typeof methodology.timeFrameStart === "string" ? methodology.timeFrameStart : defaults.timeFrameStart,
        timeFrameEnd: typeof methodology.timeFrameEnd === "string" ? methodology.timeFrameEnd : defaults.timeFrameEnd,
        qualityAssessmentTool: typeof methodology.qualityAssessmentTool === "string" ? methodology.qualityAssessmentTool : defaults.qualityAssessmentTool,
        qualityAssessmentNotes: typeof methodology.qualityAssessmentNotes === "string" ? methodology.qualityAssessmentNotes : defaults.qualityAssessmentNotes,
    };
}

/** Load protocol data for a project from localStorage */
export function loadProtocolData(projectId: string): ProtocolData {
    const fallback = createDefaultProtocolData();
    if (!isBrowser()) return fallback;

    try {
        const stored = window.localStorage.getItem(storageKey(projectId));
        if (!stored) {
            return fallback;
        }

        const parsed = JSON.parse(stored) as Partial<ProtocolData> | null;
        if (!parsed || typeof parsed !== "object") return fallback;

        return {
            researchQuestion: typeof parsed.researchQuestion === "string" ? parsed.researchQuestion : "",
            pico: validatePICO(parsed.pico),
            eligibility: validateEligibility(parsed.eligibility),
            searchStrategy: validateSearchStrategy(parsed.searchStrategy),
            methodology: validateMethodology(parsed.methodology),
        };
    } catch (err) {
        console.warn("loadProtocolData failed, using fallback", err);
        return fallback;
    }
}

/** Save protocol data for a project to localStorage */
export function saveProtocolData(projectId: string, data: ProtocolData): void {
    if (!isBrowser()) return;

    try {
        window.localStorage.setItem(storageKey(projectId), JSON.stringify(data));
    } catch (err) {
        console.warn("saveProtocolData failed", err);
    }
}

/** Check if protocol data exists for a project */
export function hasProtocolData(projectId: string): boolean {
    if (!isBrowser()) return false;

    try {
        return window.localStorage.getItem(storageKey(projectId)) !== null;
    } catch {
        return false;
    }
}

/** Delete protocol data for a project */
export function deleteProtocolData(projectId: string): void {
    if (!isBrowser()) return;

    try {
        window.localStorage.removeItem(storageKey(projectId));
    } catch (err) {
        console.warn("deleteProtocolData failed", err);
    }
}
