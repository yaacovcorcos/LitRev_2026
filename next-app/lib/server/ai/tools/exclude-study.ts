import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { prisma } from "@/lib/server/prisma";
import { StudyProposalSchema } from "@/types/artifacts";

const inputSchema = z.object({
    studyId: z.string().optional(),
    reason: z.string().min(1, "reason is required"),
});

/**
 * Output matches StudyProposalSchema so it can be stored as a study_proposal artifact.
 * Persistence happens via the study_proposal apply function when the user accepts.
 */
const outputSchema = StudyProposalSchema;

export const excludeStudyTool: AITool = {
    definition: {
        name: "exclude_study",
        description:
            "Propose excluding a study from the evidence ledger with a reason. Returns a proposal for user review — does not auto-apply. Use the study ID from [STUDY_CONTEXT] or [LEDGER_CONTEXT] — do not ask the user for it.",
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

    prerequisites: {
        required: ["project_required", "study_required"],
        blockedHint: "stop_with_explanation",
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
                select: { id: true, title: true, authors: true, year: true, details: true },
            });

            if (!study) {
                return { callId: "", result: null, error: `Study not found: ${studyId}` };
            }

            const details = (study.details as Record<string, unknown>) ?? {};

            // Return proposal payload — does NOT persist.
            // Persistence happens via the study_proposal apply function
            // when the user accepts the artifact.
            return {
                callId: "",
                result: {
                    studyId: study.id,
                    title: study.title,
                    authors: study.authors || "Unknown",
                    year: study.year || 0,
                    source: "exclusion",
                    recommendation: "exclude" as const,
                    confidence: 1.0,
                    screeningTier: "deterministic" as const,
                    matchRationale: reason,
                    doi: (details.doi as string) || undefined,
                    pmid: (details.pmid as string) || undefined,
                    abstract: (details.abstract as string) || undefined,
                    journal: (details.journal as string) || undefined,
                    studyType: (details.studyType as string) || undefined,
                },
            };
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "Failed to prepare exclusion",
            };
        }
    },
};
