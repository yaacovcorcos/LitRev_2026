import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { prisma } from "@/lib/server/prisma";
import type { ProtocolData } from "@/types/protocol";

/**
 * Allowlist of valid dot-notation field paths for ProtocolData.
 * Prevents the AI from writing to arbitrary fields.
 */
const VALID_FIELD_PATHS = new Set([
    "pico.population",
    "pico.intervention",
    "pico.comparison",
    "pico.outcome",
    "eligibility.inclusion",
    "eligibility.exclusion",
    "searchStrategy.query",
    "searchStrategy.databases",
    "methodology.studyDesigns",
    "methodology.timeFrameStart",
    "methodology.timeFrameEnd",
    "methodology.qualityAssessmentTool",
    "methodology.qualityAssessmentNotes",
]);

/** Human-readable labels for dot-notation paths */
const FIELD_LABELS: Record<string, string> = {
    "pico.population": "Population",
    "pico.intervention": "Intervention",
    "pico.comparison": "Comparison",
    "pico.outcome": "Outcome",
    "eligibility.inclusion": "Inclusion Criteria",
    "eligibility.exclusion": "Exclusion Criteria",
    "searchStrategy.query": "Search Query",
    "searchStrategy.databases": "Databases",
    "methodology.studyDesigns": "Study Designs",
    "methodology.timeFrameStart": "Time Frame Start",
    "methodology.timeFrameEnd": "Time Frame End",
    "methodology.qualityAssessmentTool": "Quality Assessment Tool",
    "methodology.qualityAssessmentNotes": "Quality Assessment Notes",
};

/** Read a nested value from an object using dot-notation path */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
    const keys = path.split(".");
    let current: unknown = obj;
    for (const key of keys) {
        if (current == null || typeof current !== "object") return undefined;
        current = (current as Record<string, unknown>)[key];
    }
    return current;
}

const inputSchema = z.object({
    field: z.string().min(1, "field is required"),
    value: z.unknown(),
    rationale: z.string().min(1, "rationale is required"),
});

const outputSchema = z.object({
    field: z.string(),
    value: z.unknown(),
    oldValue: z.unknown().optional(),
    rationale: z.string(),
});

export const updateProtocolTool: AITool = {
    definition: {
        name: "update_protocol",
        description:
            "Update any field of the review protocol. Covers PICO, eligibility criteria, search strategy, and methodology. Returns the proposed change as a diff for user review — does not auto-apply. Use the project from [PROJECT_CONTEXT].",
        parameters: {
            type: "object",
            properties: {
                field: {
                    type: "string",
                    description:
                        "Dot-notation path to the protocol field. Valid: pico.population, pico.intervention, pico.comparison, pico.outcome, eligibility.inclusion, eligibility.exclusion, searchStrategy.query, searchStrategy.databases, methodology.studyDesigns, methodology.timeFrameStart, methodology.timeFrameEnd, methodology.qualityAssessmentTool, methodology.qualityAssessmentNotes",
                },
                value: {
                    description:
                        "The new value. For string fields, pass a string. For array fields (eligibility.inclusion, eligibility.exclusion, searchStrategy.databases, methodology.studyDesigns), pass the complete new array.",
                },
                rationale: {
                    type: "string",
                    description: "Brief explanation of why this change is being proposed",
                },
            },
            required: ["field", "value", "rationale"],
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 2,
        allowedRange: [1, 2],
        hardCap: 2,
    },

    async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
        const projectId = (context?.projectId ?? args.projectId) as string | undefined;
        const field = args.field as string;
        const value = args.value;
        const rationale = args.rationale as string;

        if (!projectId) {
            return { callId: "", result: null, error: "No project context available" };
        }

        // Validate field path
        if (!VALID_FIELD_PATHS.has(field)) {
            return {
                callId: "",
                result: null,
                error: `Invalid protocol field: "${field}". Valid fields: ${[...VALID_FIELD_PATHS].join(", ")}`,
            };
        }

        try {
            // Read current protocol to get old value
            const protocol = await prisma.protocol.findUnique({
                where: { projectId },
            });

            if (!protocol) {
                return { callId: "", result: null, error: "No protocol found for this project" };
            }

            const data = protocol.data as unknown as ProtocolData;
            const oldValue = getNestedValue(data as unknown as Record<string, unknown>, field);

            // Return proposal payload — does NOT persist.
            // Persistence happens via the protocol_suggestion apply function
            // when the user accepts the artifact.
            return {
                callId: "",
                result: {
                    field,
                    value,
                    oldValue: oldValue ?? null,
                    rationale,
                },
            };
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "Failed to read protocol",
            };
        }
    },
};

export { FIELD_LABELS };
