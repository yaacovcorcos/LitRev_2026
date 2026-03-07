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
 * All 14 protocol fields with their metadata.
 * Order follows the ProtocolData structure.
 */
export const PROTOCOL_FIELD_META: readonly ProtocolFieldMeta[] = [
    // Research Question
    { path: "researchQuestion", label: "Research Question", type: "string" },
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

export type ProtocolMutationFailureCode =
    | "FIELD_REQUIRED"
    | "UNKNOWN_FIELD"
    | "STRING_EXPECTS_SINGLE_VALUE"
    | "STRING_ARRAY_EXPECTS_SCALAR_ITEMS"
    | "AMBIGUOUS_VALUE_WRAPPER"
    | "UNSUPPORTED_VALUE_TYPE";

export type ProtocolMutationNormalizationKind =
    | "none"
    | "primitive_to_string"
    | "single_item_array_to_scalar"
    | "scalar_to_single_item_array"
    | "object_value_unwrap"
    | "object_text_unwrap"
    | "object_items_unwrap";

export type ProtocolMutationClassification =
    | {
        valid: true;
        meta: ProtocolFieldMeta;
        value: string | string[];
        normalized: boolean;
        normalization: ProtocolMutationNormalizationKind;
        repeatKey: string;
    }
    | {
        valid: false;
        meta?: ProtocolFieldMeta;
        code: ProtocolMutationFailureCode;
        error: string;
        repeatKey: string;
    };

function repeatKeyForFailure(path: string, code: ProtocolMutationFailureCode): string {
    return `update_protocol:${path || "__missing_field__"}:${code}`;
}

function repeatKeyForValue(path: string, value: string | string[]): string {
    return `update_protocol:${path}:valid:${JSON.stringify(value)}`;
}

function unwrapSingleValueObject(
    value: Record<string, unknown>,
    candidates: readonly string[],
): { kind: ProtocolMutationNormalizationKind; value: unknown } | null {
    const present = candidates.filter((key) => key in value);
    if (present.length !== 1) return null;

    const [matched] = present;
    if (matched === "value") {
        return { kind: "object_value_unwrap", value: value.value };
    }
    if (matched === "text") {
        return { kind: "object_text_unwrap", value: value.text };
    }
    if (matched === "items") {
        return { kind: "object_items_unwrap", value: value.items };
    }
    return null;
}

function normalizeScalarString(
    meta: ProtocolFieldMeta,
    rawValue: unknown,
): Omit<Extract<ProtocolMutationClassification, { valid: true }>, "meta" | "repeatKey">
    | Omit<Extract<ProtocolMutationClassification, { valid: false }>, "meta" | "repeatKey"> {
    if (typeof rawValue === "string") {
        return { valid: true, value: rawValue.trim(), normalized: false, normalization: "none" };
    }

    if (typeof rawValue === "number" || typeof rawValue === "boolean") {
        return { valid: true, value: String(rawValue), normalized: true, normalization: "primitive_to_string" };
    }

    if (Array.isArray(rawValue)) {
        if (rawValue.length === 1) {
            const [item] = rawValue;
            if (typeof item === "string") {
                return { valid: true, value: item.trim(), normalized: true, normalization: "single_item_array_to_scalar" };
            }
            if (typeof item === "number" || typeof item === "boolean") {
                return { valid: true, value: String(item), normalized: true, normalization: "single_item_array_to_scalar" };
            }
        }
        return {
            valid: false,
            code: "STRING_EXPECTS_SINGLE_VALUE",
            error: `${meta.label} expects a single string value, got an array`,
        };
    }

    if (rawValue != null && typeof rawValue === "object") {
        const unwrapped = unwrapSingleValueObject(rawValue as Record<string, unknown>, ["value", "text"]);
        if (unwrapped) {
            const normalized = normalizeScalarString(meta, unwrapped.value);
            if (!normalized.valid) {
                return normalized;
            }
            return {
                ...normalized,
                normalized: true,
                normalization: unwrapped.kind,
            };
        }
        return {
            valid: false,
            code: "AMBIGUOUS_VALUE_WRAPPER",
            error: `${meta.label} expects a string, got an unsupported object shape`,
        };
    }

    return {
        valid: false,
        code: "UNSUPPORTED_VALUE_TYPE",
        error: `${meta.label} expects a string value`,
    };
}

function normalizeStringArray(
    meta: ProtocolFieldMeta,
    rawValue: unknown,
): Omit<Extract<ProtocolMutationClassification, { valid: true }>, "meta" | "repeatKey">
    | Omit<Extract<ProtocolMutationClassification, { valid: false }>, "meta" | "repeatKey"> {
    if (Array.isArray(rawValue)) {
        const items: string[] = [];
        for (const item of rawValue) {
            if (typeof item === "string" || typeof item === "number" || typeof item === "boolean") {
                const normalized = String(item).trim();
                if (normalized) items.push(normalized);
                continue;
            }
            return {
                valid: false,
                code: "STRING_ARRAY_EXPECTS_SCALAR_ITEMS",
                error: `${meta.label} expects an array of strings, numbers, or booleans`,
            };
        }
        return { valid: true, value: items, normalized: false, normalization: "none" };
    }

    if (typeof rawValue === "string" || typeof rawValue === "number" || typeof rawValue === "boolean") {
        const normalized = String(rawValue).trim();
        return {
            valid: true,
            value: normalized ? [normalized] : [],
            normalized: true,
            normalization: "scalar_to_single_item_array",
        };
    }

    if (rawValue != null && typeof rawValue === "object") {
        const unwrapped = unwrapSingleValueObject(rawValue as Record<string, unknown>, ["items"]);
        if (unwrapped) {
            const normalized = normalizeStringArray(meta, unwrapped.value);
            if (!normalized.valid) {
                return normalized;
            }
            return {
                ...normalized,
                normalized: true,
                normalization: unwrapped.kind,
            };
        }
        return {
            valid: false,
            code: "AMBIGUOUS_VALUE_WRAPPER",
            error: `${meta.label} expects an array value, got an unsupported object shape`,
        };
    }

    return {
        valid: false,
        code: "UNSUPPORTED_VALUE_TYPE",
        error: `${meta.label} expects an array of strings`,
    };
}

/**
 * Canonical protocol-mutation normalize/classify helper.
 * Reuse this anywhere update_protocol field/value semantics matter.
 */
export function normalizeAndClassifyProtocolMutation(
    path: string,
    value: unknown,
): ProtocolMutationClassification {
    const trimmedPath = path.trim();
    if (!trimmedPath) {
        return {
            valid: false,
            code: "FIELD_REQUIRED",
            error: "Input validation failed: field is required",
            repeatKey: repeatKeyForFailure("", "FIELD_REQUIRED"),
        };
    }

    const meta = META_BY_PATH.get(trimmedPath);
    if (!meta) {
        return {
            valid: false,
            code: "UNKNOWN_FIELD",
            error: `Unknown protocol field: "${trimmedPath}"`,
            repeatKey: repeatKeyForFailure(trimmedPath, "UNKNOWN_FIELD"),
        };
    }

    const normalized = meta.type === "string[]"
        ? normalizeStringArray(meta, value)
        : normalizeScalarString(meta, value);

    if (!normalized.valid) {
        return {
            ...normalized,
            meta,
            repeatKey: repeatKeyForFailure(trimmedPath, normalized.code),
        };
    }

    return {
        ...normalized,
        meta,
        repeatKey: repeatKeyForValue(trimmedPath, normalized.value),
    };
}

/**
 * Validate and normalize a value for a specific protocol field.
 * Returns the cleaned value on success, or an error string on failure.
 */
export function validateFieldValue(
    path: string,
    value: unknown,
): { valid: true; value: string | string[] } | { valid: false; error: string } {
    const classification = normalizeAndClassifyProtocolMutation(path, value);
    if (!classification.valid) {
        return { valid: false, error: classification.error };
    }
    return { valid: true, value: classification.value };
}
