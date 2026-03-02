import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { prisma } from "@/lib/server/prisma";
import { ensureProtocol } from "@/lib/server/protocols";
import { syncProtocolToMemory } from "@/lib/server/memory/protocol-sync";
import { findBestFuzzyListMatch } from "@/lib/agent/fuzzy-match";

const inputSchema = z.object({
    action: z.enum(["add", "remove"]),
    type: z.enum(["inclusion", "exclusion"]),
    criterion: z.string().min(1, "criterion is required"),
});

const outputSchema = z.object({
    success: z.boolean(),
    action: z.enum(["add", "remove"]),
    type: z.enum(["inclusion", "exclusion"]),
    criteria: z.array(z.string()),
});

export const updateCriteriaTool: AITool = {
    definition: {
        name: "update_criteria",
        description:
            "Add or remove an inclusion or exclusion criterion from the review protocol. Use this when the user makes a definitive decision about criteria — not for tentative suggestions. After updating, the change is automatically synced to project memory.",
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

    async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
        const projectId = (context?.projectId ?? args.projectId) as string;
        if (!projectId) {
            return { callId: "", result: null, error: "No project context available" };
        }
        const action = args.action as "add" | "remove";
        const type = args.type as "inclusion" | "exclusion";
        const criterion = args.criterion as string;

        try {
            const data = await ensureProtocol(projectId);
            const list = data.eligibility[type];

            if (action === "add") {
                // Avoid duplicates (case-insensitive check)
                const exists = list.some(
                    (c) => c.toLowerCase().trim() === criterion.toLowerCase().trim()
                );
                if (exists) {
                    return {
                        callId: "",
                        result: { success: true, action, type, criteria: list },
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
                list.splice(idx, 1);
            }

            // Persist
            await prisma.protocol.update({
                where: { projectId },
                data: { data: data as unknown as object },
            });

            // Sync to memory (fire-and-forget)
            syncProtocolToMemory(projectId, data).catch((err) =>
                console.error("[update_criteria] Memory sync failed:", err)
            );

            return {
                callId: "",
                result: {
                    success: true,
                    action,
                    type,
                    criteria: data.eligibility[type],
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
