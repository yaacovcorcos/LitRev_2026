import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { prisma } from "@/lib/server/prisma";

const inputSchema = z.object({
    studyId: z.string().optional(),
    reason: z.string().optional(),
});

const outputSchema = z.object({
    studyId: z.string(),
    title: z.string(),
    reason: z.string().optional(),
});

export const deleteStudyTool: AITool = {
    definition: {
        name: "delete_study",
        description:
            "Prepare a reviewable soft-deletion proposal for a study. This tool never deletes directly; the authenticated user must approve the resulting deletion card. Use only when the user explicitly asks to delete, remove, or purge a study.",
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
                where: { id: studyId, projectId, deletedAt: null },
                select: { id: true, title: true },
            });

            if (!study) {
                return { callId: "", result: null, error: `Study not found: ${studyId}` };
            }

            return {
                callId: "",
                result: {
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
