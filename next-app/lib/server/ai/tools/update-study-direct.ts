import type { AITool, ToolExecutionContext } from "./base";
import { StudyUpdateSchema } from "@/types/artifacts";
import {
    SAFE_DIRECT_STUDY_FIELDS,
    SAFE_DIRECT_STUDY_UPDATE_INPUT_SCHEMA,
    buildStudyUpdatePayload,
} from "./study-update-shared";

export const updateStudyDirectTool: AITool = {
    definition: {
        name: "update_study_direct",
        description:
            "Directly apply safe study-page edits for abstract, AI summary, DOI, PMID, journal, keywords, or source URL. Use only when the user explicitly asked to edit those safe fields. Never use for title, authors, year, status, quality, triage, relevance, or mixed-field edits.",
        parameters: {
            type: "object",
            properties: {
                studyId: { type: "string", description: "Optional study ID. Defaults to the current study context." },
                abstract: { type: "string" },
                doi: { type: "string", description: "DOI value; pass empty string to clear." },
                pmid: { type: "string", description: "PMID digits; pass empty string to clear." },
                journal: { type: "string" },
                keywords: { type: "array", items: { type: "string" } },
                keywordsOperation: { type: "string", enum: ["set", "append"] },
                sourceUrl: { type: "string", description: "Source URL; pass empty string to clear." },
                aiSummary: { type: "string" },
                rationale: { type: "string" },
            },
            required: ["rationale"],
        },
    },
    inputSchema: SAFE_DIRECT_STUDY_UPDATE_INPUT_SCHEMA,
    outputSchema: StudyUpdateSchema,
    autonomy: {
        defaultLevel: 3,
        allowedRange: [3, 3],
        hardCap: 3,
    },
    prerequisites: {
        required: ["project_required", "study_required"],
        blockedHint: "stop_with_explanation",
    },
    async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
        const studyId = (args.studyId ?? context?.studyId) as string | undefined;
        const projectId = (context?.projectId ?? args.projectId) as string | undefined;

        if (!studyId) {
            return { callId: "", result: null, error: "No study specified and no study in current view" };
        }
        if (!projectId) {
            return { callId: "", result: null, error: "No project context available" };
        }

        try {
            const payload = await buildStudyUpdatePayload({
                args,
                projectId,
                studyId,
                allowedFields: SAFE_DIRECT_STUDY_FIELDS,
            });

            return {
                callId: "",
                result: payload,
            };
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "Failed to prepare direct study update",
            };
        }
    },
};
