import { z } from "zod";
import type { AITool } from "./base";
import { prisma } from "@/lib/server/prisma";

const inputSchema = z.object({
    studyId: z.string().min(1, "studyId is required"),
    projectId: z.string().min(1, "projectId is required"),
    reason: z.string().min(1, "reason is required"),
});

const outputSchema = z.object({
    success: z.boolean(),
    studyId: z.string(),
    title: z.string(),
});

export const excludeStudyTool: AITool = {
    definition: {
        name: "exclude_study",
        description:
            "Exclude a study from the evidence ledger with a reason. Sets the study's triage decision to 'exclude'. Use this when a study does not meet the inclusion criteria or should be removed from the review for a specific reason.",
        parameters: {
            type: "object",
            properties: {
                studyId: {
                    type: "string",
                    description: "The ID of the study to exclude",
                },
                projectId: {
                    type: "string",
                    description: "The project ID the study belongs to",
                },
                reason: {
                    type: "string",
                    description: "The reason for exclusion (e.g., 'wrong population', 'case report', 'no control group')",
                },
            },
            required: ["studyId", "projectId", "reason"],
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 2,
        allowedRange: [1, 2],
        hardCap: 2,
    },

    async execute(args: Record<string, unknown>) {
        const studyId = args.studyId as string;
        const projectId = args.projectId as string;
        const reason = args.reason as string;

        try {
            const study = await prisma.study.findFirst({
                where: { id: studyId, projectId },
                select: { id: true, title: true, details: true },
            });

            if (!study) {
                return { callId: "", result: null, error: `Study not found: ${studyId}` };
            }

            const details = (study.details as Record<string, unknown>) ?? {};
            await prisma.study.update({
                where: { id: studyId },
                data: {
                    status: "excluded",
                    details: {
                        ...details,
                        triageDecision: "exclude",
                        exclusionReason: reason,
                        excludedAt: new Date().toISOString(),
                    },
                },
            });

            return {
                callId: "",
                result: { success: true, studyId, title: study.title },
            };
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "Failed to exclude study",
            };
        }
    },
};
