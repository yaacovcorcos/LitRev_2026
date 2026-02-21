import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { getUserMemories } from "@/lib/server/memory/user-memory";
import { getProjectMemories } from "@/lib/server/memory/project-memory";
import { normalizedMemoryKey, normalizedMemoryValue } from "@/lib/server/memory/conflict-policy";
import { MemoryForgetProposalSchema } from "@/types/artifacts";

const MAX_MATCHES = 20;

const inputSchema = z.object({
    memoryType: z.enum(["user", "project"]).default("user"),
    key: z.string().min(1, "key is required"),
    value: z.string().optional(),
    reason: z.string().optional(),
});

function containsNormalizedValue(haystack: string, needle: string): boolean {
    if (!needle) return true;
    return normalizedMemoryValue(haystack).includes(normalizedMemoryValue(needle));
}

export const forgetMemoryTool: AITool = {
    definition: {
        name: "forget_memory",
        description:
            "Propose forgetting an existing memory by key. " +
            "This archives the matched memory after user approval (does not hard-delete). " +
            "Use when the user says to forget, undo, or remove a remembered preference/decision.",
        parameters: {
            type: "object",
            properties: {
                memoryType: {
                    type: "string",
                    enum: ["user", "project"],
                    description: "Whether to forget a user preference or a project memory.",
                },
                key: {
                    type: "string",
                    description: "Memory key to forget (e.g., citation_format, writing_style).",
                },
                value: {
                    type: "string",
                    description: "Optional value filter when multiple memories share similar keys.",
                },
                reason: {
                    type: "string",
                    description: "Optional reason to show in the review card.",
                },
            },
            required: ["key"],
        },
    },
    inputSchema,
    outputSchema: MemoryForgetProposalSchema,
    autonomy: {
        defaultLevel: 2,
        allowedRange: [1, 2],
        hardCap: 2,
    },
    async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
        const memoryType = (args.memoryType as "user" | "project") || "user";
        const normalizedKey = normalizedMemoryKey(args.key as string);
        const valueFilter = typeof args.value === "string" ? args.value.trim() : "";
        const reason = typeof args.reason === "string" ? args.reason.trim() : undefined;

        if (!normalizedKey) {
            return { callId: "", result: null, error: "Memory key is empty after normalization." };
        }

        if (memoryType === "user") {
            if (!context?.userId) {
                return { callId: "", result: null, error: "No user context available for user-memory forgetting." };
            }
            const active = await getUserMemories(context.userId, { status: "active" });
            const matches = active
                .filter((memory) => normalizedMemoryKey(memory.key) === normalizedKey)
                .filter((memory) => containsNormalizedValue(memory.value, valueFilter))
                .slice(0, MAX_MATCHES)
                .map((memory) => ({
                    id: memory.id,
                    label: memory.key,
                    value: memory.value,
                }));

            if (matches.length === 0) {
                return {
                    callId: "",
                    result: null,
                    error: `No active user memory found for key "${normalizedKey}".`,
                };
            }

            return {
                callId: "",
                result: {
                    memoryType: "user",
                    key: normalizedKey,
                    mode: "archive",
                    reason,
                    matches,
                },
            };
        }

        if (!context?.projectId) {
            return { callId: "", result: null, error: "No project context available for project-memory forgetting." };
        }

        const keyTag = `memory-key:${normalizedKey}`;
        const active = await getProjectMemories(context.projectId, { status: "active" });
        const matches = active
            .filter((memory) => memory.tags.includes(keyTag))
            .filter((memory) => containsNormalizedValue(memory.statement, valueFilter))
            .slice(0, MAX_MATCHES)
            .map((memory) => ({
                id: memory.id,
                label: normalizedKey,
                value: memory.statement,
            }));

        if (matches.length === 0) {
            return {
                callId: "",
                result: null,
                error: `No active project memory found for key "${normalizedKey}".`,
            };
        }

        return {
            callId: "",
            result: {
                memoryType: "project",
                key: normalizedKey,
                mode: "archive",
                reason,
                matches,
            },
        };
    },
};

