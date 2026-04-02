import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/server/prisma";
import type { StudyType, TriageDecision } from "@/types/ledger";
import type { StudyFieldChange, StudyUpdatePayload } from "@/types/artifacts";

const DOI_REGEX = /^10\.\d{4,9}\/\S+$/i;
const PMID_REGEX = /^\d{6,9}$/;
const STATUS_VALUES = ["pending", "extracted", "active", "excluded"] as const;
const QUALITY_VALUES = ["High", "Medium", "Low", "-"] as const;
const STUDY_TYPE_VALUES = [
    "RCT",
    "Cohort",
    "Case-Control",
    "Cross-Sectional",
    "Case-Report",
    "Meta-Analysis",
    "Systematic-Review",
    "Other",
] as const satisfies readonly StudyType[];
const TRIAGE_VALUES = ["keep", "exclude", "maybe"] as const satisfies readonly TriageDecision[];

export const FULL_STUDY_UPDATE_INPUT_SCHEMA = z.object({
    studyId: z.string().optional(),
    title: z.string().optional(),
    authors: z.string().optional(),
    year: z.number().int().min(1900).max(2100).optional(),
    quality: z.enum(QUALITY_VALUES).optional(),
    status: z.enum(STATUS_VALUES).optional(),
    abstract: z.string().optional(),
    doi: z.string().optional(),
    pmid: z.string().optional(),
    journal: z.string().optional(),
    studyType: z.union([z.enum(STUDY_TYPE_VALUES), z.literal("")]).optional(),
    keywords: z.array(z.string()).optional(),
    keywordsOperation: z.enum(["set", "append"]).optional(),
    sourceUrl: z.string().optional(),
    triageDecision: z.union([z.enum(TRIAGE_VALUES), z.literal("")]).optional(),
    exclusionReason: z.string().optional(),
    triageNote: z.string().optional(),
    qualityRationale: z.string().optional(),
    aiSummary: z.string().optional(),
    rationale: z.string().min(1, "rationale is required"),
});

export const SAFE_DIRECT_STUDY_FIELDS = [
    "abstract",
    "aiSummary",
    "doi",
    "pmid",
    "journal",
    "keywords",
    "sourceUrl",
] as const;

export const SAFE_DIRECT_STUDY_FIELD_SET = new Set<string>(SAFE_DIRECT_STUDY_FIELDS);

export const SAFE_DIRECT_STUDY_UPDATE_INPUT_SCHEMA = FULL_STUDY_UPDATE_INPUT_SCHEMA.pick({
    studyId: true,
    abstract: true,
    doi: true,
    pmid: true,
    journal: true,
    keywords: true,
    keywordsOperation: true,
    sourceUrl: true,
    aiSummary: true,
    rationale: true,
}).strict();

export type FullStudyUpdateArgs = z.infer<typeof FULL_STUDY_UPDATE_INPUT_SCHEMA>;
export type SafeDirectStudyUpdateArgs = z.infer<typeof SAFE_DIRECT_STUDY_UPDATE_INPUT_SCHEMA>;

type TopPatch = NonNullable<StudyUpdatePayload["patch"]["top"]>;
type DetailPatch = NonNullable<StudyUpdatePayload["patch"]["details"]>;

type FieldConfig = {
    label: string;
    location: "top" | "details";
    key: string;
    clearable: boolean;
};

export const STUDY_UPDATE_FIELD_CONFIG: Record<string, FieldConfig> = {
    title: { label: "Title", location: "top", key: "title", clearable: false },
    authors: { label: "Authors", location: "top", key: "authors", clearable: false },
    year: { label: "Year", location: "top", key: "year", clearable: false },
    quality: { label: "Quality", location: "top", key: "quality", clearable: false },
    status: { label: "Status", location: "top", key: "status", clearable: false },
    abstract: { label: "Abstract", location: "details", key: "abstract", clearable: true },
    doi: { label: "DOI", location: "details", key: "doi", clearable: true },
    pmid: { label: "PMID", location: "details", key: "pmid", clearable: true },
    journal: { label: "Journal", location: "details", key: "journal", clearable: true },
    studyType: { label: "Study Type", location: "details", key: "studyType", clearable: true },
    keywords: { label: "Keywords", location: "details", key: "keywords", clearable: true },
    sourceUrl: { label: "Source URL", location: "details", key: "sourceUrl", clearable: true },
    triageDecision: { label: "Triage Decision", location: "details", key: "triageDecision", clearable: true },
    exclusionReason: { label: "Exclusion Reason", location: "details", key: "exclusionReason", clearable: true },
    triageNote: { label: "Triage Note", location: "details", key: "triageNote", clearable: true },
    qualityRationale: { label: "Quality Rationale", location: "details", key: "qualityRationale", clearable: true },
    aiSummary: { label: "AI Summary", location: "details", key: "aiSummary", clearable: true },
};

export function getStudyUpdateProvidedFields(args: Record<string, unknown>): string[] {
    return Object.keys(STUDY_UPDATE_FIELD_CONFIG).filter((key) => typeof args[key] !== "undefined");
}

export function splitStudyUpdateFields(fields: string[]): {
    safeFields: string[];
    riskyFields: string[];
} {
    const safeFields: string[] = [];
    const riskyFields: string[] = [];
    for (const field of fields) {
        if (SAFE_DIRECT_STUDY_FIELD_SET.has(field)) safeFields.push(field);
        else riskyFields.push(field);
    }
    return { safeFields, riskyFields };
}

function asDisplay(value: unknown, operation?: StudyFieldChange["operation"]): string {
    if (operation === "clear") return "(cleared)";
    if (value == null) return "\u2014";
    if (Array.isArray(value)) return value.length ? value.join(", ") : "\u2014";
    const text = String(value).trim();
    return text.length ? text : "\u2014";
}

function canonicalFieldName(config: FieldConfig): string {
    return config.location === "top" ? config.key : `details.${config.key}`;
}

function equalValues(a: unknown, b: unknown): boolean {
    if (a == null && b == null) return true;
    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((item, i) => item === b[i]);
    }
    return a === b;
}

function normalizeString(value: string): string {
    return value.trim();
}

function parseNullableString(
    raw: unknown,
    clearable: boolean
): { operation: "set" | "clear"; value: string | null } | null {
    if (typeof raw === "undefined") return null;
    if (typeof raw !== "string") return null;
    const normalized = normalizeString(raw);
    if (!normalized) {
        if (!clearable) {
            throw new Error("This field cannot be cleared.");
        }
        return { operation: "clear", value: null };
    }
    return { operation: "set", value: normalized };
}

function validateDoi(value: string | null) {
    if (value == null) return;
    if (!DOI_REGEX.test(value)) {
        throw new Error(`Invalid DOI format: "${value}"`);
    }
}

function validatePmid(value: string | null) {
    if (value == null) return;
    if (!PMID_REGEX.test(value)) {
        throw new Error(`Invalid PMID format: "${value}"`);
    }
}

function validateSourceUrl(value: string | null) {
    if (value == null) return;
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new Error(`Invalid source URL: "${value}"`);
    }
    if (!parsed.protocol.startsWith("http")) {
        throw new Error("Source URL must use http/https");
    }
}

export async function buildStudyUpdatePayload(params: {
    args: Record<string, unknown>;
    projectId: string;
    studyId: string;
    allowedFields?: readonly string[];
}): Promise<StudyUpdatePayload> {
    const { args, projectId, studyId, allowedFields } = params;
    const rationale = typeof args.rationale === "string" ? args.rationale.trim() : "";

    if (!rationale) {
        throw new Error("rationale is required");
    }

    const study = await prisma.study.findFirst({
        where: { id: studyId, projectId },
        select: {
            id: true,
            title: true,
            authors: true,
            year: true,
            quality: true,
            status: true,
            details: true,
            updatedAt: true,
        },
    });

    if (!study) {
        throw new Error(`Study not found: ${studyId}`);
    }

    const currentDetails = (study.details as Record<string, unknown>) ?? {};
    const topPatch: TopPatch = {};
    const detailsPatch: DetailPatch = {};
    const changes: StudyFieldChange[] = [];

    const providedFields = getStudyUpdateProvidedFields(args);
    if (providedFields.length === 0) {
        throw new Error("No editable fields were provided.");
    }

    if (allowedFields) {
        const allowedSet = new Set(allowedFields);
        const disallowedFields = providedFields.filter((field) => !allowedSet.has(field));
        if (disallowedFields.length > 0) {
            throw new Error(`Direct study edits only support: ${[...allowedSet].join(", ")}`);
        }
    }

    for (const field of providedFields) {
        const config = STUDY_UPDATE_FIELD_CONFIG[field];
        const raw = args[field];
        const oldValue = config.location === "top"
            ? study[config.key as keyof typeof study]
            : currentDetails[config.key];

        let operation: StudyFieldChange["operation"] = "set";
        let newValue: unknown = raw;

        if (field === "keywords") {
            const incoming = Array.isArray(raw)
                ? raw.map((item) => String(item).trim()).filter(Boolean)
                : [];
            const current = Array.isArray(oldValue)
                ? oldValue.map((item) => String(item).trim()).filter(Boolean)
                : [];
            const mode = args.keywordsOperation === "append" ? "append" : "set";
            if (mode === "append") {
                const merged = Array.from(new Set([...current, ...incoming]));
                if (equalValues(current, merged)) continue;
                operation = "append";
                newValue = merged;
            } else {
                if (equalValues(current, incoming)) continue;
                operation = "set";
                newValue = incoming;
            }
            detailsPatch.keywords = newValue;
        } else if (
            field === "abstract"
            || field === "doi"
            || field === "pmid"
            || field === "journal"
            || field === "studyType"
            || field === "sourceUrl"
            || field === "exclusionReason"
            || field === "triageNote"
            || field === "qualityRationale"
            || field === "aiSummary"
        ) {
            const parsed = parseNullableString(raw, config.clearable);
            if (!parsed) continue;
            operation = parsed.operation;
            newValue = parsed.value;
            if (field === "doi") validateDoi(parsed.value);
            if (field === "pmid") validatePmid(parsed.value);
            if (field === "sourceUrl") validateSourceUrl(parsed.value);
            detailsPatch[config.key] = parsed.value;
        } else if (field === "triageDecision") {
            if (typeof raw !== "string") continue;
            const normalized = raw.trim();
            if (!normalized) {
                operation = "clear";
                newValue = null;
                detailsPatch.triageDecision = null;
            } else {
                newValue = normalized as TriageDecision;
                detailsPatch.triageDecision = newValue;
            }
        } else {
            if (equalValues(oldValue, raw)) continue;
            if (config.location === "top") {
                topPatch[config.key as keyof TopPatch] = raw as never;
            } else {
                detailsPatch[config.key] = raw;
            }
            newValue = raw;
        }

        if (field !== "keywords") {
            if (config.location === "top") {
                topPatch[config.key as keyof TopPatch] = newValue as never;
            } else if (!(field in detailsPatch)) {
                detailsPatch[config.key] = newValue;
            }
        }

        changes.push({
            field: canonicalFieldName(config),
            label: config.label,
            operation,
            typedOldValue: oldValue ?? null,
            typedNewValue: newValue ?? null,
            displayOld: asDisplay(oldValue),
            displayNew: asDisplay(newValue, operation),
        });
    }

    if (changes.length === 0) {
        throw new Error("No actual changes detected.");
    }

    return {
        studyId: study.id,
        studyTitle: study.title,
        snapshotAt: study.updatedAt.toISOString(),
        idempotencyKey: randomUUID(),
        patch: {
            ...(Object.keys(topPatch).length ? { top: topPatch } : {}),
            ...(Object.keys(detailsPatch).length ? { details: detailsPatch } : {}),
        },
        changes,
        rationale,
    };
}
