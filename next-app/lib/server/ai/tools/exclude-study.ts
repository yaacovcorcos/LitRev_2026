import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { prisma } from "@/lib/server/prisma";

const inputSchema = z.object({
    studyId: z.string().optional(),
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
            "Exclude a study from the evidence ledger with a reason. Sets the study's triage decision to 'exclude'. Use the study ID from [STUDY_CONTEXT] or [LEDGER_CONTEXT] — do not ask the user for it.",
        parameters: {
            type: "object",
            properties: {
                studyId: {
                    type: "string",
                    description: "The study ID. If omitted, defaults to the study the user is currently viewing.",
                },
                reason: {
                    type: "string",
                    description: "The reason for exclusion (e.g., 'wrong population', 'case report', 'no control group')",
                },
            },
            required: ["reason"],
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
        const studyId = (args.studyId ?? context?.studyId) as string | undefined;
        const projectId = (context?.projectId ?? args.projectId) as string | undefined;
        const reason = args.reason as string;

        if (!studyId) {
            return { callId: "", result: null, error: "No study specified and no study in current view" };
        }
        if (!projectId) {
            return { callId: "", result: null, error: "No project context available" };
        }

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
