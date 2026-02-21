import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { getUserMemories } from "@/lib/server/memory/user-memory";
import { getProjectMemories } from "@/lib/server/memory/project-memory";
import { getProjectStudyMemories, getStudyMemories } from "@/lib/server/memory/study-memory";
import { normalizedMemoryKey, normalizedMemoryValue } from "@/lib/server/memory/conflict-policy";

const inputSchema = z.object({
    memoryType: z.enum(["all", "user", "project", "study"]).default("all"),
    key: z.string().optional(),
    limit: z.number().int().min(1).max(25).default(10),
});

const outputSchema = z.object({
    summary: z.string(),
    memories: z.array(z.object({
        id: z.string(),
        memoryType: z.enum(["user", "project", "study"]),
        key: z.string(),
        value: z.string(),
    })),
});

function take<T>(items: T[], limit: number): T[] {
    return items.slice(0, limit);
}

export const inspectMemoryTool: AITool = {
    definition: {
        name: "inspect_memory",
        description:
            "Inspect what is currently remembered (user, project, or study memory). " +
            "Use this when the user asks what you remember, or to confirm stored memory before updating/forgetting.",
        parameters: {
            type: "object",
            properties: {
                memoryType: {
                    type: "string",
                    enum: ["all", "user", "project", "study"],
                    description: "Which memory scope to inspect.",
                },
                key: {
                    type: "string",
                    description: "Optional key filter (normalized loosely).",
                },
                limit: {
                    type: "integer",
                    minimum: 1,
                    maximum: 25,
                    description: "Maximum number of memories to return.",
                },
            },
        },
    },
    inputSchema,
    outputSchema,
    autonomy: {
        defaultLevel: 3,
        allowedRange: [1, 4],
    },
    async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
        const memoryType = (args.memoryType as "all" | "user" | "project" | "study") || "all";
        const normalizedKeyFilter = typeof args.key === "string" ? normalizedMemoryKey(args.key) : "";
        const limit = typeof args.limit === "number" ? Math.min(Math.max(Math.floor(args.limit), 1), 25) : 10;
        const rows: Array<{ id: string; memoryType: "user" | "project" | "study"; key: string; value: string }> = [];

        const includeUser = memoryType === "all" || memoryType === "user";
        const includeProject = memoryType === "all" || memoryType === "project";
        const includeStudy = memoryType === "all" || memoryType === "study";

        if (includeUser && context?.userId) {
            const userMemories = await getUserMemories(context.userId, { status: "active" });
            for (const memory of userMemories) {
                if (normalizedKeyFilter && !normalizedMemoryKey(memory.key).includes(normalizedKeyFilter)) continue;
                rows.push({
                    id: memory.id,
                    memoryType: "user",
                    key: memory.key,
                    value: memory.value,
                });
            }
        }

        if (includeProject && context?.projectId) {
            const projectMemories = await getProjectMemories(context.projectId, { status: "active" });
            for (const memory of projectMemories) {
                const key = memory.tags.find((tag) => tag.startsWith("memory-key:"))?.replace("memory-key:", "") || memory.type;
                if (normalizedKeyFilter && !normalizedMemoryKey(key).includes(normalizedKeyFilter)) continue;
                rows.push({
                    id: memory.id,
                    memoryType: "project",
                    key,
                    value: memory.statement,
                });
            }
        }

        if (includeStudy) {
            const studyMemories = context?.studyId
                ? await getStudyMemories(context.studyId, { status: "active" })
                : context?.projectId
                    ? await getProjectStudyMemories(context.projectId)
                    : [];
            for (const memory of studyMemories) {
                const key = `study_${memory.type}`;
                if (normalizedKeyFilter && !normalizedMemoryKey(key).includes(normalizedKeyFilter)) continue;
                rows.push({
                    id: memory.id,
                    memoryType: "study",
                    key,
                    value: normalizedMemoryValue(memory.content),
                });
            }
        }

        const trimmed = take(rows, limit);
        const summary = trimmed.length === 0
            ? "No matching active memories found."
            : `Found ${trimmed.length} active mem${trimmed.length === 1 ? "ory" : "ories"}.`;

        return {
            callId: "",
            result: {
                summary,
                memories: trimmed,
            },
        };
    },
};

