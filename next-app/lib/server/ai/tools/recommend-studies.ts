import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { isAbortLikeError } from "@/lib/ai/abort";
import type { Study } from "@/types/ledger";
import { getRecommendations, buildS2PaperIds } from "@/lib/server/search/semantic-scholar";
import { listStudies } from "@/lib/server/ledger";

const inputSchema = z.object({
    studyIds: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(100).optional().default(10),
});

const outputSchema = z.object({
    source: z.string(),
    basedOn: z.number(),
    negativeSeeds: z.number(),
    returnedCount: z.number(),
    results: z.array(z.object({
        title: z.string(),
        authors: z.string(),
        year: z.number().optional(),
    }).passthrough()),
});

export const recommendStudiesTool: AITool = {
    definition: {
        name: "recommend_studies",
        description:
            "Get paper recommendations from Semantic Scholar based on studies already in the Evidence Ledger. Uses included/kept studies as positive seeds and excluded studies as negative seeds. Requires at least 1 study with a DOI, PMID, or Semantic Scholar ID.",
        parameters: {
            type: "object",
            properties: {
                studyIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional: specific study IDs to use as positive seeds. If omitted, all 'keep' studies are used.",
                },
                limit: {
                    type: "number",
                    description: "Maximum recommendations to return (1-100, default 10)",
                },
            },
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 2,
        allowedRange: [1, 4],
    },

    async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
        const projectId = (context?.projectId ?? args.projectId) as string;
        if (!projectId) {
            return { callId: "", result: null, error: "No project context available" };
        }

        const studyIds = args.studyIds as string[] | undefined;
        const limit = typeof args.limit === "number"
            ? Math.min(Math.max(args.limit, 1), 100)
            : 10;

        try {
            // 1. Load studies from ledger
            const allStudies = await listStudies(undefined, projectId);

            // 2. Determine positive seeds
            let positiveStudies: Study[];
            if (studyIds?.length) {
                const idSet = new Set(studyIds);
                positiveStudies = allStudies.filter((s) => idSet.has(s.id));
            } else {
                // Default: use studies with triageDecision "keep" (or all if no triage done)
                const kept = allStudies.filter((s) => s.details?.triageDecision === "keep");
                positiveStudies = kept.length > 0 ? kept : allStudies;
            }

            if (positiveStudies.length === 0) {
                return { callId: "", result: null, error: "No studies in ledger to base recommendations on" };
            }

            // 3. Build positive paper IDs (cap at 50)
            const positiveIds = buildS2PaperIds(positiveStudies).slice(0, 50);
            if (positiveIds.length === 0) {
                return {
                    callId: "",
                    result: null,
                    error: "No studies have a DOI, PMID, or Semantic Scholar ID for recommendations",
                };
            }

            // 4. Build negative seeds from excluded studies (cap at 20)
            const excludedStudies = allStudies.filter((s) => s.details?.triageDecision === "exclude");
            const negativeIds = buildS2PaperIds(excludedStudies).slice(0, 20);

            // 5. Call recommendations API
            const results = await getRecommendations(
                positiveIds,
                negativeIds.length > 0 ? negativeIds : undefined,
                {
                    limit,
                    ...(context?.signal ? { signal: context.signal } : {}),
                },
            );

            return {
                callId: "",
                result: {
                    source: "semantic-scholar",
                    basedOn: positiveIds.length,
                    negativeSeeds: negativeIds.length,
                    returnedCount: results.length,
                    results,
                },
            };
        } catch (error) {
            if (isAbortLikeError(error)) throw error;
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "Recommendations request failed",
            };
        }
    },
};
