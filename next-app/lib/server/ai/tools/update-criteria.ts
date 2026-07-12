import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { prisma } from "@/lib/server/prisma";
import { findBestFuzzyListMatch } from "@/lib/agent/fuzzy-match";
import type { ProtocolData } from "@/types/protocol";

const inputSchema = z.object({
    action: z.enum(["add", "remove"]),
    type: z.enum(["inclusion", "exclusion"]),
    criterion: z.string().min(1, "criterion is required"),
});

const outputSchema = z.object({
    inclusion: z.array(z.string()),
    exclusion: z.array(z.string()),
    rationale: z.string(),
    mutation: z.object({
        action: z.enum(["add", "remove"]),
        type: z.enum(["inclusion", "exclusion"]),
        criterion: z.string().min(1),
    }),
});

export const updateCriteriaTool: AITool = {
    definition: {
        name: "update_criteria",
        description:
            "Prepare a reviewable proposal to add or remove an inclusion or exclusion criterion. This tool never writes the protocol directly; the authenticated user must apply the resulting criteria card.",
        parameters: {
            type: "object",
            properties: {
                action: {
                    type: "string",
                    enum: ["add", "remove"],
                    description: "Whether to add or remove the criterion",
                },
                type: {
                    type: "string",
                    enum: ["inclusion", "exclusion"],
                    description: "Whether this is an inclusion or exclusion criterion",
                },
                criterion: {
                    type: "string",
                    description: "The criterion text to add or remove",
                },
            },
            required: ["action", "type", "criterion"],
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 1,
        allowedRange: [1, 2],
        hardCap: 2,
    },

    prerequisites: {
        required: ["protocol_required"],
        blockedHint: "stop_with_explanation",
    },

    async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
        const projectId = (context?.projectId ?? args.projectId) as string;
        if (!projectId) {
            return { callId: "", result: null, error: "No project context available" };
        }
        const action = args.action as "add" | "remove";
        const type = args.type as "inclusion" | "exclusion";
        const criterion = args.criterion as string;
        let mutationCriterion = criterion.trim();

        try {
            const protocol = await prisma.protocol.findUnique({
                where: { projectId },
                select: { data: true },
            });
            if (!protocol) {
                return { callId: "", result: null, error: "No protocol exists for this project" };
            }
            const data = structuredClone(protocol.data) as unknown as ProtocolData;
            const list = data.eligibility[type];

            if (action === "add") {
                // Avoid duplicates (case-insensitive check)
                const exists = list.some(
                    (c) => c.toLowerCase().trim() === criterion.toLowerCase().trim()
                );
                if (exists) {
                    return {
                        callId: "",
                        result: null,
                        error: `The ${type} criterion already exists; no protocol change is needed.`,
                    };
                }
                list.push(criterion.trim());
            } else {
                // Remove by case-insensitive match
                let idx = list.findIndex(
                    (c) => c.toLowerCase().trim() === criterion.toLowerCase().trim()
                );
                if (idx === -1) {
                    const fuzzy = findBestFuzzyListMatch(
                        list.map((c) => c.toLowerCase()),
                        criterion.toLowerCase()
                    );
                    if (fuzzy) idx = fuzzy.index;
                }
                if (idx === -1) {
                    return {
                        callId: "",
                        result: null,
                        error: `Criterion not found in ${type} list: "${criterion}"`,
                    };
                }
                mutationCriterion = list[idx];
                list.splice(idx, 1);
            }

            return {
                callId: "",
                result: {
                    inclusion: data.eligibility.inclusion,
                    exclusion: data.eligibility.exclusion,
                    rationale: `${action === "add" ? "Add" : "Remove"} ${type} criterion: ${criterion.trim()}`,
                    mutation: { action, type, criterion: mutationCriterion },
                },
            };
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "Failed to update criteria",
            };
        }
    },
};
