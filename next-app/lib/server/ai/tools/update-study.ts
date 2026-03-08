import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { AITool, ToolExecutionContext } from "./base";
import { prisma } from "@/lib/server/prisma";
import type { StudyDetails, StudyType, TriageDecision } from "@/types/ledger";
import {
    StudyUpdateSchema,
    type StudyFieldChange,
    type StudyUpdatePayload,
} from "@/types/artifacts";

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

const inputSchema = z.object({
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

const outputSchema = StudyUpdateSchema;

type TopPatch = NonNullable<StudyUpdatePayload["patch"]["top"]>;
type DetailPatch = NonNullable<StudyUpdatePayload["patch"]["details"]>;

type FieldConfig = {
    label: string;
    location: "top" | "details";
    key: string;
    clearable: boolean;
};

const FIELD_CONFIG: Record<string, FieldConfig> = {
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

export const updateStudyTool: AITool = {
    definition: {
        name: "update_study",
        description:
            "Propose edits to study metadata fields (title, abstract, DOI, PMID, summary, quality, and related fields). Returns a reviewable patch and diff artifact; does not auto-apply.",
        parameters: {
            type: "object",
            properties: {
                studyId: { type: "string", description: "Optional study ID. Defaults to current study context." },
                title: { type: "string" },
                authors: { type: "string" },
                year: { type: "number" },
                quality: { type: "string", enum: [...QUALITY_VALUES] },
                status: { type: "string", enum: [...STATUS_VALUES] },
                abstract: { type: "string" },
                doi: { type: "string", description: "DOI value; pass empty string to clear." },
                pmid: { type: "string", description: "PMID digits; pass empty string to clear." },
                journal: { type: "string" },
                studyType: { type: "string", enum: [...STUDY_TYPE_VALUES, ""] },
                keywords: { type: "array", items: { type: "string" } },
                keywordsOperation: { type: "string", enum: ["set", "append"] },
                sourceUrl: { type: "string", description: "Source URL; pass empty string to clear." },
                triageDecision: { type: "string", enum: [...TRIAGE_VALUES, ""] },
                exclusionReason: { type: "string" },
                triageNote: { type: "string" },
                qualityRationale: { type: "string" },
                aiSummary: { type: "string" },
                rationale: { type: "string" },
            },
            required: ["rationale"],
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 2,
        allowedRange: [1, 2],
        hardCap: 2,
    },

    prerequisites: {
        required: ["project_required", "study_required"],
        blockedHint: "stop_with_explanation",
    },

    async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
        const studyId = (args.studyId ?? context?.studyId) as string | undefined;
        const projectId = (context?.projectId ?? args.projectId) as string | undefined;
        const rationale = (args.rationale as string | undefined)?.trim();

        if (!studyId) {
            return { callId: "", result: null, error: "No study specified and no study in current view" };
        }
        if (!projectId) {
            return { callId: "", result: null, error: "No project context available" };
        }
        if (!rationale) {
            return { callId: "", result: null, error: "rationale is required" };
        }

        try {
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
                return { callId: "", result: null, error: `Study not found: ${studyId}` };
            }

            const currentDetails = (study.details as Record<string, unknown>) ?? {};
            const topPatch: TopPatch = {};
            const detailsPatch: DetailPatch = {};
            const changes: StudyFieldChange[] = [];

            const providedFields = Object.keys(FIELD_CONFIG).filter((key) => typeof args[key] !== "undefined");
            if (providedFields.length === 0) {
                return { callId: "", result: null, error: "No editable fields were provided." };
            }

            for (const field of providedFields) {
                const config = FIELD_CONFIG[field];
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
                        operation = "append";
                        newValue = merged;
                    } else {
                        operation = incoming.length === 0 ? "clear" : "set";
                        newValue = incoming.length === 0 ? null : incoming;
                    }
                } else if (typeof raw === "string") {
                    const parsed = parseNullableString(raw, config.clearable);
                    if (parsed) {
                        operation = parsed.operation;
                        newValue = parsed.value;
                    }
                }

                if (field === "doi") validateDoi(newValue as string | null);
                if (field === "pmid") validatePmid(newValue as string | null);
                if (field === "sourceUrl") validateSourceUrl(newValue as string | null);

                if (equalValues(oldValue, newValue)) {
                    continue;
                }

                if (config.location === "top") {
                    (topPatch as Record<string, unknown>)[config.key] = newValue;
                } else {
                    detailsPatch[config.key] = newValue;
                }

                changes.push({
                    field: canonicalFieldName(config),
                    label: config.label,
                    operation,
                    typedOldValue: oldValue,
                    typedNewValue: newValue,
                    displayOld: asDisplay(oldValue),
                    displayNew: asDisplay(newValue, operation),
                });
            }

            if (changes.length === 0) {
                return { callId: "", result: null, error: "No effective changes detected." };
            }

            const payload: StudyUpdatePayload = {
                studyId: study.id,
                studyTitle: study.title,
                snapshotAt: study.updatedAt.toISOString(),
                idempotencyKey: randomUUID(),
                patch: {
                    ...(Object.keys(topPatch).length > 0 ? { top: topPatch } : {}),
                    ...(Object.keys(detailsPatch).length > 0 ? { details: detailsPatch as Partial<StudyDetails> } : {}),
                },
                changes,
                rationale,
            };

            return { callId: "", result: payload };
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "Failed to prepare study update",
            };
        }
    },
};
