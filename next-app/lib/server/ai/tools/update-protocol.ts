import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { ensureProtocol } from "@/lib/server/protocols";
import type { ProtocolData } from "@/types/protocol";
import { isValidFieldPath, validateFieldValue, getFieldLabel, PROTOCOL_FIELD_META } from "@/lib/protocol-fields";

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
    value: z.union([z.string(), z.array(z.string())]),
    rationale: z.string().min(1, "rationale is required"),
});

const outputSchema = z.object({
    field: z.string(),
    value: z.union([z.string(), z.array(z.string())]),
    oldValue: z.union([z.string(), z.array(z.string()), z.null()]).optional(),
    rationale: z.string(),
});

const ALL_PATHS = PROTOCOL_FIELD_META.map((m) => m.path).join(", ");

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
                        `Dot-notation path to the protocol field. Valid: ${ALL_PATHS}`,
                },
                value: {
                    description:
                        "The new value. For string fields, pass a string. For array fields (eligibility.inclusion, eligibility.exclusion, searchStrategy.databases, methodology.studyDesigns), pass the complete new array of strings.",
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
        const rawValue = args.value;
        const rationale = args.rationale as string;

        if (!projectId) {
            return { callId: "", result: null, error: "No project context available" };
        }

        // Validate field path against shared registry
        if (!isValidFieldPath(field)) {
            return {
                callId: "",
                result: null,
                error: `Invalid protocol field: "${field}". Valid fields: ${ALL_PATHS}`,
            };
        }

        // Validate and normalize value type for this field
        const validation = validateFieldValue(field, rawValue);
        if (!validation.valid) {
            return { callId: "", result: null, error: validation.error };
        }
        const value = validation.value;

        try {
            const data = await ensureProtocol(projectId);
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

export { getFieldLabel };
