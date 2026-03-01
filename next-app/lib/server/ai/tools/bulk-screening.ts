import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { prisma } from "@/lib/server/prisma";
import { ensureProtocol } from "@/lib/server/protocols";
import { safeParseJson } from "@/lib/server/ai/json-repair";
import { isHighConfidenceExclusion } from "@/lib/criteriaMatching";
import { isTieredScreeningEnabled } from "@/lib/agent/feature-flags";
import type { ScreeningTier, Study } from "@/types/ledger";

const MAX_BATCH_SIZE = 20;
const SCREENING_MODEL = "grok-4-1-fast";
const LOW_CONFIDENCE_THRESHOLD = 0.3;

const inputSchema = z.object({
    studyIds: z.array(z.string()).optional(),
});

/**
 * Output matches ScreeningBatchSchema (studies: StudyProposalPayload[])
 * so it can be stored as a screening_batch artifact directly.
 */
const outputSchema = z.object({
    studies: z.array(z.object({
        studyId: z.string().optional(),
        title: z.string(),
        authors: z.string(),
        year: z.number(),
        source: z.string(),
        recommendation: z.enum(["keep", "exclude", "maybe"]),
        confidence: z.number().min(0).max(1),
        screeningTier: z.enum(["deterministic", "ai", "heuristic", "default"]).optional(),
        modelUsed: z.string().optional(),
        matchRationale: z.string().optional(),
    }).passthrough()),
    summary: z.object({
        total: z.number(),
        keepCount: z.number(),
        excludeCount: z.number(),
        maybeCount: z.number(),
    }),
});

interface ScreeningResult {
    studyId?: string;
    title: string;
    authors: string;
    year: number;
    source: string;
    recommendation: "keep" | "exclude" | "maybe";
    confidence: number;
    screeningTier: ScreeningTier;
    modelUsed?: string;
    matchRationale: string;
}

type ParsedScreeningDecision = {
    decision: "keep" | "exclude" | "maybe";
    reason: string;
    confidence: number;
};

function cleanJsonPayload(content: string): string {
    return content
        .trim()
        .replace(/^```(?:json)?\s*/i, "")
        .replace(/\s*```$/i, "");
}

function normalizeParsedDecision(parsed: unknown): ParsedScreeningDecision | null {
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const record = parsed as Record<string, unknown>;
    const rawDecision = typeof record.decision === "string" ? record.decision.toLowerCase() : "";
    const decision: ParsedScreeningDecision["decision"] =
        rawDecision === "keep" || rawDecision === "exclude" || rawDecision === "maybe"
            ? rawDecision
            : "maybe";

    const reason = typeof record.reason === "string" && record.reason.trim().length > 0
        ? record.reason.trim()
        : "Unable to determine";

    const confidence = typeof record.confidence === "number"
        ? Math.min(1, Math.max(0, record.confidence))
        : 0.5;

    return { decision, reason, confidence };
}

function applyLowConfidenceSafety(result: ParsedScreeningDecision): ParsedScreeningDecision {
    if (result.confidence >= LOW_CONFIDENCE_THRESHOLD || result.decision === "maybe") {
        return result;
    }

    return {
        decision: "maybe",
        reason: `${result.reason} [low confidence — flagged for manual review]`,
        confidence: result.confidence,
    };
}

export const bulkScreeningTool: AITool = {
    definition: {
        name: "bulk_screening",
        description:
            "Screen multiple studies against the review protocol criteria. Evaluates each study's title and abstract against inclusion/exclusion criteria and returns a recommendation for each. If no studyIds are provided, screens all unscreened studies (up to 20). Results are presented for user review before any changes are applied.",
        parameters: {
            type: "object",
            properties: {
                studyIds: {
                    type: "array",
                    items: { type: "string" },
                    description: "Optional array of specific study IDs to screen. If omitted, screens all unscreened studies.",
                },
            },
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
        const projectId = (context?.projectId ?? args.projectId) as string;
        if (!projectId) {
            return { callId: "", result: null, error: "No project context available" };
        }
        const studyIds = args.studyIds as string[] | undefined;
        const tieredScreeningEnabled = isTieredScreeningEnabled();

        try {
            // Self-heal: ensure protocol row exists (creates empty default for legacy projects)
            const protocolData = await ensureProtocol(projectId);
            const { inclusion, exclusion } = protocolData.eligibility;

            if (inclusion.length === 0 && exclusion.length === 0) {
                return { callId: "", result: null, error: "No criteria defined in protocol. Add inclusion or exclusion criteria first." };
            }

            // Fetch studies to screen
            const whereClause: Record<string, unknown> = { projectId, deletedAt: null };
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
                        studies: [],
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

                if (tieredScreeningEnabled) {
                    const deterministic = isHighConfidenceExclusion(
                        {
                            id: study.id,
                            title: study.title,
                            authors: study.authors || "Unknown",
                            year: study.year || 0,
                            status: "pending",
                            quality: "-",
                            details: details as Study["details"],
                        },
                        protocolData
                    );

                    if (deterministic.exclude) {
                        results.push({
                            studyId: study.id,
                            title: study.title,
                            authors: study.authors || "Unknown",
                            year: study.year || 0,
                            source: "bulk-screening",
                            recommendation: "exclude",
                            confidence: 1,
                            screeningTier: "deterministic",
                            modelUsed: undefined,
                            matchRationale: deterministic.reasons.join("; "),
                        });
                        continue;
                    }
                }

                const prompt = `Screen this study against the criteria below. Return ONLY a JSON object with: { "decision": "keep"|"exclude"|"maybe", "reason": "brief criterion-linked rationale", "confidence": 0.0-1.0 }

Study: "${study.title}" (${study.authors}, ${study.year})
Abstract: ${abstract.slice(0, 2000)}

${criteriaText}`;

                let responseContent: string | null = null;
                try {
                    const response = await aiService.chat(
                        [
                            {
                                id: "system",
                                role: "system" as const,
                                content: `You are screening one study for a systematic review using title and abstract only.

At this stage, prioritize recall: when evidence is incomplete or ambiguous, prefer "maybe" over "exclude".

Decision guidance:
- keep: likely aligns with inclusion criteria and no clear exclusion trigger.
- exclude: clear mismatch with a required inclusion criterion or clear match to an exclusion criterion.
- maybe: borderline fit, missing abstract/details, or uncertainty that requires full-text review.

Evaluate criterion fit (population, intervention/exposure, outcomes, study design), not just keyword overlap.

Use only the provided study text and criteria. Do not infer unsupported details.

Return a brief rationale that cites the strongest criterion signal driving the decision.

Set confidence (0-1) based on how explicit the evidence is in title/abstract; lower confidence when inference is needed.

Return ONLY valid JSON.`,
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

                    responseContent = response.content;
                    const jsonStr = cleanJsonPayload(responseContent);
                    const parsed = normalizeParsedDecision(JSON.parse(jsonStr));
                    const decision = parsed ? applyLowConfidenceSafety(parsed) : {
                        decision: "maybe" as const,
                        reason: "Unable to determine",
                        confidence: 0.5,
                    };

                    results.push({
                        studyId: study.id,
                        title: study.title,
                        authors: study.authors || "Unknown",
                        year: study.year || 0,
                        source: "bulk-screening",
                        recommendation: decision.decision,
                        matchRationale: decision.reason,
                        confidence: decision.confidence,
                        screeningTier: "ai",
                        modelUsed: SCREENING_MODEL,
                    });
                } catch {
                    if (tieredScreeningEnabled && responseContent) {
                        const parsedFromRepair = normalizeParsedDecision(
                            safeParseJson(cleanJsonPayload(responseContent))
                        );
                        if (parsedFromRepair) {
                            const recovered = applyLowConfidenceSafety(parsedFromRepair);
                            results.push({
                                studyId: study.id,
                                title: study.title,
                                authors: study.authors || "Unknown",
                                year: study.year || 0,
                                source: "bulk-screening",
                                recommendation: recovered.decision,
                                matchRationale: recovered.reason,
                                confidence: recovered.confidence,
                                screeningTier: "heuristic",
                                modelUsed: SCREENING_MODEL,
                            });
                            continue;
                        }
                    }

                    // If AI fails for one study, mark as maybe
                    results.push({
                        studyId: study.id,
                        title: study.title,
                        authors: study.authors || "Unknown",
                        year: study.year || 0,
                        source: "bulk-screening",
                        recommendation: "maybe",
                        matchRationale: "Screening failed — needs manual review",
                        confidence: 0,
                        screeningTier: "default",
                        modelUsed: SCREENING_MODEL,
                    });
                }
            }

            const summary = {
                total: results.length,
                keepCount: results.filter((r) => r.recommendation === "keep").length,
                excludeCount: results.filter((r) => r.recommendation === "exclude").length,
                maybeCount: results.filter((r) => r.recommendation === "maybe").length,
            };

            return {
                callId: "",
                result: { studies: results, summary },
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
