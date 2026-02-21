import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { prisma } from "@/lib/server/prisma";

const inputSchema = z.object({
    studyId: z.string().optional(),
    reason: z.string().optional(),
});

const outputSchema = z.object({
    success: z.literal(true),
    studyId: z.string(),
    title: z.string(),
    reason: z.string().optional(),
});

export const deleteStudyTool: AITool = {
    definition: {
        name: "delete_study",
        description:
            "Permanently delete a study from the project's ledger. Use only when the user explicitly asks to delete, remove, or purge a study from the ledger. Use the study ID from [STUDY_CONTEXT] or [LEDGER_CONTEXT] when available.",
        parameters: {
            type: "object",
            properties: {
                studyId: {
                    type: "string",
                    description: "The study ID. If omitted, defaults to the study currently in context.",
                },
                reason: {
                    type: "string",
                    description: "Optional user-provided rationale for deletion.",
                },
            },
            required: [],
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
        const studyId = (args.studyId ?? context?.studyId) as string | undefined;
        const projectId = (context?.projectId ?? args.projectId) as string | undefined;
        const reason = typeof args.reason === "string" ? args.reason.trim() : undefined;

        if (!studyId) {
            return { callId: "", result: null, error: "No study specified and no study in current view" };
        }
        if (!projectId) {
            return { callId: "", result: null, error: "No project context available" };
        }

        try {
            const study = await prisma.study.findFirst({
                where: { id: studyId, projectId },
                select: { id: true, title: true },
            });

            if (!study) {
                return { callId: "", result: null, error: `Study not found: ${studyId}` };
            }

            await prisma.study.deleteMany({
                where: { id: studyId, projectId },
            });

            return {
                callId: "",
                result: {
                    success: true as const,
                    studyId: study.id,
                    title: study.title,
                    reason: reason || undefined,
                },
            };
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "Failed to delete study",
            };
        }
    },
};
