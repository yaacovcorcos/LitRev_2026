import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { getUserMemory } from "@/lib/server/memory/user-memory";
import { searchProjectMemories } from "@/lib/server/memory/project-memory";

const inputSchema = z.object({
    memoryType: z.enum(["user", "project"]).default("user"),
    key: z.string().min(1, "key is required"),
    value: z.string().min(1, "value is required"),
    rationale: z.string().optional(),
});

const outputSchema = z.object({
    memoryType: z.enum(["user", "project", "study", "note"]),
    key: z.string().optional(),
    value: z.string(),
    rationale: z.string().optional(),
});

export const storeMemoryTool: AITool = {
    definition: {
        name: "store_memory",
        description:
            "Save a user preference, workflow habit, or important decision to memory. " +
            "Use this when the user expresses a clear preference or makes a definitive decision. " +
            "Examples: preferred writing style, citation format, recurring search strategies, " +
            "or explicit methodological choices. Do NOT use for tentative statements or minor details.",
        parameters: {
            type: "object",
            properties: {
                memoryType: {
                    type: "string",
                    enum: ["user", "project"],
                    description:
                        "Whether this is a user-level preference (persists across projects) " +
                        "or a project-specific decision",
                },
                key: {
                    type: "string",
                    description:
                        "A short, consistent key for the memory (e.g., 'writing_style', " +
                        "'citation_format', 'search_scope')",
                },
                value: {
                    type: "string",
                    description: "The memory content to store",
                },
                rationale: {
                    type: "string",
                    description: "Why this memory is being stored — what conversation moment triggered it",
                },
            },
            required: ["key", "value"],
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
        const memoryType = (args.memoryType as string) || "user";
        const key = args.key as string;
        const value = args.value as string;
        const rationale = args.rationale as string | undefined;

        // Server-side dedupe guard — return null result to skip artifact creation
        if (memoryType === "user" && context?.userId) {
            const existing = await getUserMemory(context.userId, key);
            if (existing && existing.value === value) {
                return {
                    callId: "",
                    result: null,
                    error: `Already remembered: "${key}". No action needed.`,
                };
            }
        } else if (memoryType === "project" && context?.projectId) {
            const existing = await searchProjectMemories(context.projectId, key);
            const duplicate = existing.find(
                (m) => m.statement === value && m.status === "active",
            );
            if (duplicate) {
                return {
                    callId: "",
                    result: null,
                    error: `Already remembered: "${key}". No action needed.`,
                };
            }
        }

        return {
            callId: "",
            result: {
                memoryType,
                key,
                value,
                rationale,
            },
        };
    },
};
