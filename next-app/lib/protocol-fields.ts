/**
 * Protocol Field Metadata Registry
 * Single source of truth for protocol field paths, labels, and types.
 * Importable from both server and client code.
 */

export type ProtocolFieldType = "string" | "string[]";

export interface ProtocolFieldMeta {
    /** Dot-notation path into ProtocolData (e.g. "pico.population") */
    path: string;
    /** Human-readable label for UI display */
    label: string;
    /** Expected runtime type */
    type: ProtocolFieldType;
}

/**
 * All 13 protocol fields with their metadata.
 * Order follows the ProtocolData structure.
 */
export const PROTOCOL_FIELD_META: readonly ProtocolFieldMeta[] = [
    // PICO
    { path: "pico.population", label: "P \u2014 Population", type: "string" },
    { path: "pico.intervention", label: "I \u2014 Intervention", type: "string" },
    { path: "pico.comparison", label: "C \u2014 Comparison", type: "string" },
    { path: "pico.outcome", label: "O \u2014 Outcome", type: "string" },
    // Eligibility
    { path: "eligibility.inclusion", label: "Inclusion Criteria", type: "string[]" },
    { path: "eligibility.exclusion", label: "Exclusion Criteria", type: "string[]" },
    // Search strategy
    { path: "searchStrategy.query", label: "Search Query", type: "string" },
    { path: "searchStrategy.databases", label: "Databases", type: "string[]" },
    // Methodology
    { path: "methodology.studyDesigns", label: "Study Designs", type: "string[]" },
    { path: "methodology.timeFrameStart", label: "Time Frame Start", type: "string" },
    { path: "methodology.timeFrameEnd", label: "Time Frame End", type: "string" },
    { path: "methodology.qualityAssessmentTool", label: "Quality Assessment Tool", type: "string" },
    { path: "methodology.qualityAssessmentNotes", label: "Quality Assessment Notes", type: "string" },
] as const;

/** O(1) lookup by path */
const META_BY_PATH = new Map<string, ProtocolFieldMeta>(
    PROTOCOL_FIELD_META.map((m) => [m.path, m])
);

/** Set of all valid field paths */
const VALID_PATHS = new Set(PROTOCOL_FIELD_META.map((m) => m.path));

/** Get metadata for a field path, or undefined if invalid */
export function getFieldMeta(path: string): ProtocolFieldMeta | undefined {
    return META_BY_PATH.get(path);
}

/** Check if a path is a valid protocol field */
export function isValidFieldPath(path: string): boolean {
    return VALID_PATHS.has(path);
}

/** Get human-readable label for a field path */
export function getFieldLabel(path: string): string {
    return META_BY_PATH.get(path)?.label ?? path;
}

/** Check if a field expects an array value */
export function isArrayField(path: string): boolean {
    return META_BY_PATH.get(path)?.type === "string[]";
}

/**
 * Validate and normalize a value for a specific protocol field.
 * Returns the cleaned value on success, or an error string on failure.
 */
export function validateFieldValue(
    path: string,
    value: unknown,
): { valid: true; value: string | string[] } | { valid: false; error: string } {
    const meta = META_BY_PATH.get(path);
    if (!meta) {
        return { valid: false, error: `Unknown protocol field: "${path}"` };
    }

    if (meta.type === "string[]") {
        // Array field — accept string[] (including empty) or single string (auto-wrap)
        if (Array.isArray(value)) {
            const items = value.map((v) => String(v).trim()).filter(Boolean);
            return { valid: true, value: items };
        }
        if (typeof value === "string") {
            const trimmed = value.trim();
            return { valid: true, value: trimmed ? [trimmed] : [] };
        }
        return {
            valid: false,
            error: `${meta.label} expects an array of strings, got ${typeof value}`,
        };
    }

    // String field — accept strings and safe primitives (number, boolean), reject arrays/objects
    if (typeof value === "string") {
        return { valid: true, value: value.trim() };
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return { valid: true, value: String(value) };
    }
    if (Array.isArray(value)) {
        return { valid: false, error: `${meta.label} expects a string, got an array` };
    }
    if (value != null && typeof value === "object") {
        return { valid: false, error: `${meta.label} expects a string, got an object` };
    }
    return { valid: false, error: `${meta.label} expects a string value` };
}
