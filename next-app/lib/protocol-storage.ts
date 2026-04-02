/**
 * Storage utility for protocol data.
 * Keeps one protocol snapshot per project in localStorage, using the same defensive read/write style as the other local persistence helpers.
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
const PROTOCOL_STORAGE_VERSION = 1;

export type ProtocolStorageSource =
    | "legacy"
    | "remote"
    | "editor"
    | "artifact"
    | "migration"
    | "unknown";

export type ProtocolStorageEntry = {
    version: typeof PROTOCOL_STORAGE_VERSION;
    savedAtMs: number;
    lastSyncedAtMs: number;
    source: ProtocolStorageSource;
    protocol: ProtocolData;
};

function isBrowser(): boolean {
    return typeof window !== "undefined";
}

function storageKey(projectId: string): string {
    return `${PROTOCOL_KEY_PREFIX}:${projectId}`;
}

function sanitizeProtocolData(raw: Partial<ProtocolData> | null | undefined): ProtocolData {
    if (!raw || typeof raw !== "object") {
        return createDefaultProtocolData();
    }

    return {
        researchQuestion: typeof raw.researchQuestion === "string" ? raw.researchQuestion : "",
        pico: validatePICO(raw.pico),
        eligibility: validateEligibility(raw.eligibility),
        searchStrategy: validateSearchStrategy(raw.searchStrategy),
        methodology: validateMethodology(raw.methodology),
    };
}

function sanitizeTimestamp(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function isEnvelope(
    value: unknown
): value is { version?: unknown; protocol?: Partial<ProtocolData>; savedAtMs?: unknown; lastSyncedAtMs?: unknown; source?: unknown } {
    return !!value && typeof value === "object" && "protocol" in value;
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
    return loadProtocolStorageEntry(projectId)?.protocol ?? createDefaultProtocolData();
}

export function loadProtocolStorageEntry(projectId: string): ProtocolStorageEntry | null {
    if (!isBrowser()) return null;

    try {
        const stored = window.localStorage.getItem(storageKey(projectId));
        if (!stored) {
            return null;
        }

        const parsed = JSON.parse(stored) as unknown;
        if (isEnvelope(parsed)) {
            return {
                version: PROTOCOL_STORAGE_VERSION,
                savedAtMs: sanitizeTimestamp(parsed.savedAtMs),
                lastSyncedAtMs: sanitizeTimestamp(parsed.lastSyncedAtMs),
                source: typeof parsed.source === "string"
                    ? (parsed.source as ProtocolStorageSource)
                    : "unknown",
                protocol: sanitizeProtocolData(parsed.protocol),
            };
        }

        return {
            version: PROTOCOL_STORAGE_VERSION,
            savedAtMs: 0,
            lastSyncedAtMs: 0,
            source: "legacy",
            protocol: sanitizeProtocolData(parsed as Partial<ProtocolData> | null),
        };
    } catch (err) {
        console.warn("loadProtocolStorageEntry failed, using fallback", err);
        return null;
    }
}

/** Save protocol data for a project to localStorage */
export function saveProtocolData(projectId: string, data: ProtocolData): void {
    saveProtocolStorageEntry(projectId, {
        protocol: data,
        savedAtMs: Date.now(),
        lastSyncedAtMs: Date.now(),
        source: "legacy",
    });
}

export function saveProtocolStorageEntry(
    projectId: string,
    entry: Omit<ProtocolStorageEntry, "version"> | ProtocolStorageEntry
): void {
    if (!isBrowser()) return;

    try {
        const normalized: ProtocolStorageEntry = {
            version: PROTOCOL_STORAGE_VERSION,
            savedAtMs: sanitizeTimestamp(entry.savedAtMs),
            lastSyncedAtMs: sanitizeTimestamp(entry.lastSyncedAtMs),
            source: entry.source ?? "unknown",
            protocol: sanitizeProtocolData(entry.protocol),
        };

        window.localStorage.setItem(storageKey(projectId), JSON.stringify(normalized));
    } catch (err) {
        console.warn("saveProtocolStorageEntry failed", err);
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
