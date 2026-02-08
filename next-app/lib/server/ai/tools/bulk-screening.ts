import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { prisma } from "@/lib/server/prisma";
import type { ProtocolData } from "@/types/protocol";

const MAX_BATCH_SIZE = 20;
const SCREENING_MODEL = "grok-4-1-fast";

const inputSchema = z.object({
    projectId: z.string().min(1, "projectId is required"),
    studyIds: z.array(z.string()).optional(),
});

const screeningResultSchema = z.object({
    studyId: z.string(),
    title: z.string(),
    decision: z.enum(["keep", "exclude", "maybe"]),
    reason: z.string(),
    confidence: z.number().min(0).max(1),
});

const outputSchema = z.object({
    results: z.array(screeningResultSchema),
    summary: z.object({
        total: z.number(),
        keepCount: z.number(),
        excludeCount: z.number(),
        maybeCount: z.number(),
    }),
});

interface ScreeningResult {
    studyId: string;
    title: string;
    decision: "keep" | "exclude" | "maybe";
    reason: string;
    confidence: number;
}

export const bulkScreeningTool: AITool = {
    definition: {
        name: "bulk_screening",
        description:
            "Screen multiple studies against the review protocol criteria. Evaluates each study's title and abstract against inclusion/exclusion criteria and returns a recommendation for each. If no studyIds are provided, screens all unscreened studies (up to 20). Results are presented for user review before any changes are applied.",
        parameters: {
            type: "object",
            properties: {
                projectId: {
                    type: "string",
                    description: "The project ID",
                },
                studyIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional array of specific study IDs to screen. If omitted, screens all unscreened studies.",
                },
            },
            required: ["projectId"],
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
        const projectId = args.projectId as string;
        const studyIds = args.studyIds as string[] | undefined;

        try {
            // Fetch protocol for criteria
            const protocol = await prisma.protocol.findUnique({
                where: { projectId },
            });

            if (!protocol) {
                return { callId: "", result: null, error: "No protocol found. Define inclusion/exclusion criteria first." };
            }

            const protocolData = protocol.data as unknown as ProtocolData;
            const { inclusion, exclusion } = protocolData.eligibility;

            if (inclusion.length === 0 && exclusion.length === 0) {
                return { callId: "", result: null, error: "No criteria defined in protocol. Add inclusion or exclusion criteria first." };
            }

            // Fetch studies to screen
            const whereClause: Record<string, unknown> = { projectId };
            if (studyIds && studyIds.length > 0) {
                whereClause.id = { in: studyIds };
            } else {
                // All unscreened studies: no triageDecision set
                whereClause.OR = [
                    { details: { equals: null } },
                    { details: { path: ["triageDecision"], equals: null } },
                ];
            }

            const studies = await prisma.study.findMany({
                where: whereClause,
                select: { id: true, title: true, authors: true, year: true, details: true },
                take: MAX_BATCH_SIZE,
                orderBy: { createdAt: "asc" },
            });

            if (studies.length === 0) {
                return {
                    callId: "",
                    result: {
                        results: [],
                        summary: { total: 0, keepCount: 0, excludeCount: 0, maybeCount: 0 },
                    },
                };
            }

            // Screen each study using AI
            const { getAIService } = await import("@/lib/server/ai/ai-service");
            const aiService = getAIService();

            const criteriaText = [
                inclusion.length > 0
                    ? `Inclusion criteria:\n${inclusion.map((c, i) => `${i + 1}. ${c}`).join("\n")}`
                    : "",
                exclusion.length > 0
                    ? `Exclusion criteria:\n${exclusion.map((c, i) => `${i + 1}. ${c}`).join("\n")}`
                    : "",
            ].filter(Boolean).join("\n\n");

            const results: ScreeningResult[] = [];

            for (const study of studies) {
                const details = (study.details as Record<string, unknown>) ?? {};
                const abstract = (details.abstract as string) || "No abstract available";

                const prompt = `Screen this study against the criteria below. Return ONLY a JSON object with: { "decision": "keep"|"exclude"|"maybe", "reason": "one sentence", "confidence": 0.0-1.0 }

Study: "${study.title}" (${study.authors}, ${study.year})
Abstract: ${abstract.slice(0, 2000)}

${criteriaText}`;

                try {
                    const response = await aiService.chat(
                        [
                            {
                                id: "system",
                                role: "system" as const,
                                content: "You are a study screening assistant. Evaluate studies against inclusion/exclusion criteria. Return only valid JSON.",
                                createdAt: new Date().toISOString(),
                            },
                            {
                                id: "user",
                                role: "user" as const,
                                content: prompt,
                                createdAt: new Date().toISOString(),
                            },
                        ],
                        {
                            model: SCREENING_MODEL,
                            temperature: 0.2,
                            maxTokens: 200,
                            projectId,
                        }
                    );

                    const jsonStr = response.content
                        .trim()
                        .replace(/^```(?:json)?\s*/i, "")
                        .replace(/\s*```$/i, "");
                    const parsed = JSON.parse(jsonStr);

                    results.push({
                        studyId: study.id,
                        title: study.title,
                        decision: ["keep", "exclude", "maybe"].includes(parsed.decision) ? parsed.decision : "maybe",
                        reason: typeof parsed.reason === "string" ? parsed.reason : "Unable to determine",
                        confidence: typeof parsed.confidence === "number" ? Math.min(1, Math.max(0, parsed.confidence)) : 0.5,
                    });
                } catch {
                    // If AI fails for one study, mark as maybe
                    results.push({
                        studyId: study.id,
                        title: study.title,
                        decision: "maybe",
                        reason: "Screening failed — needs manual review",
                        confidence: 0,
                    });
                }
            }

            const summary = {
                total: results.length,
                keepCount: results.filter((r) => r.decision === "keep").length,
                excludeCount: results.filter((r) => r.decision === "exclude").length,
                maybeCount: results.filter((r) => r.decision === "maybe").length,
            };

            return {
                callId: "",
                result: { results, summary },
            };
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "Bulk screening failed",
            };
        }
    },
};
