import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { getUserMemories, getUserMemory } from "@/lib/server/memory/user-memory";
import { getProjectMemories } from "@/lib/server/memory/project-memory";
import {
    classifyMemoryConflict,
    normalizedMemoryKey,
    normalizedMemoryValue,
} from "@/lib/server/memory/conflict-policy";

function mergeRationale(base: string | undefined, addition: string): string {
    if (!base) return addition;
    return base.includes(addition) ? base : `${base} ${addition}`;
}

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
        const key = normalizedMemoryKey(args.key as string);
        const value = (args.value as string).trim();
        const normalizedValue = normalizedMemoryValue(value);
        const rationaleRaw = args.rationale as string | undefined;
        let rationale = rationaleRaw?.trim() ? rationaleRaw.trim() : undefined;

        if (!key) {
            return {
                callId: "",
                result: null,
                error: "Memory key is empty after normalization.",
            };
        }
        if (!value) {
            return {
                callId: "",
                result: null,
                error: "Memory value is empty after trimming.",
            };
        }

        // Server-side dedupe guard — return null result to skip artifact creation
        if (memoryType === "user" && context?.userId) {
            const existing = await getUserMemory(context.userId, key);
            if (existing && normalizedMemoryValue(existing.value) === normalizedValue) {
                return {
                    callId: "",
                    result: null,
                    error: `Already remembered: "${key}". No action needed.`,
                };
            }
            if (existing && normalizedMemoryValue(existing.value) !== normalizedValue) {
                rationale = mergeRationale(
                    rationale,
                    `Deterministic conflict: currently remembered "${key}" is "${existing.value}". Confirm replacement.`,
                );
            } else {
                const active = await getUserMemories(context.userId, { status: "active" });
                const semantic = active.find((memory) => classifyMemoryConflict(
                    { key, value },
                    { key: memory.key, value: memory.value },
                ) === "semantic");
                if (semantic) {
                    rationale = mergeRationale(
                        rationale,
                        `Possible semantic conflict with "${semantic.key}: ${semantic.value}". Please verify before saving.`,
                    );
                }
            }
        } else if (memoryType === "project" && context?.projectId) {
            const existing = await getProjectMemories(context.projectId, { status: "active" });
            const duplicate = existing.find(
                (m) => normalizedMemoryValue(m.statement) === normalizedValue,
            );
            if (duplicate) {
                return {
                    callId: "",
                    result: null,
                    error: `Already remembered: "${key}". No action needed.`,
                };
            }
            const keyTag = `memory-key:${key}`;
            const conflicting = existing.find(
                (m) => m.tags.includes(keyTag) && normalizedMemoryValue(m.statement) !== normalizedValue,
            );
            if (conflicting) {
                rationale = mergeRationale(
                    rationale,
                    `Deterministic conflict: existing project memory for "${key}" says "${conflicting.statement}". Confirm replacement.`,
                );
            } else {
                const semantic = existing.find((memory) => {
                    const taggedKey = memory.tags.find((tag) => tag.startsWith("memory-key:"))?.replace("memory-key:", "") || memory.statement;
                    return classifyMemoryConflict(
                        { key, value },
                        { key: taggedKey, value: memory.statement },
                    ) === "semantic";
                });
                if (semantic) {
                    rationale = mergeRationale(
                        rationale,
                        `Possible semantic conflict with existing project memory "${semantic.statement}". Confirm replacement if intentional.`,
                    );
                }
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
