import { z } from "zod";
import type { AITool } from "./base";
import { isAbortLikeError } from "@/lib/ai/abort";
import { searchSemanticScholar } from "@/lib/server/search/semantic-scholar";

const inputSchema = z.object({
    query: z.string().min(1, "Query is required"),
    maxResults: z.number().int().min(1).max(100).optional().default(10),
    yearRange: z.string().optional(),
    cursor: z.string().trim().min(1).optional(),
});

const outputSchema = z.object({
    query: z.string(),
    source: z.string(),
    totalResults: z.number().optional(),
    returnedCount: z.number(),
    results: z.array(z.object({
        title: z.string(),
        authors: z.string(),
        year: z.number().optional(),
    }).passthrough()),
    nextCursor: z.string().optional(),
});

export const semanticScholarSearchTool: AITool = {
    definition: {
        name: "search_semantic_scholar",
        description:
            "Search Semantic Scholar for academic papers across all disciplines (215M+ papers). Supports keyword search with optional year filtering. Not first-line for biomedical reviews: default to PubMed first. Use this tool when the user explicitly requests Semantic Scholar, when the topic is cross-disciplinary/non-biomedical (for example CS, psychology, engineering), or when PubMed recall remains insufficient after refinement. Returns titles, authors, publication years when available, abstracts, DOIs, citation counts, and Semantic Scholar paper IDs.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search query (keywords, phrases, or paper titles)",
                },
                maxResults: {
                    type: "number",
                    description: "Maximum results to return (1-100, default 10)",
                },
                yearRange: {
                    type: "string",
                    description: "Year filter, e.g. '2020-2024', '2020-' (from 2020 onward), '-2023' (up to 2023)",
                },
                cursor: {
                    type: "string",
                    description: "Opaque continuation token from a previous Semantic Scholar search response",
                },
            },
            required: ["query"],
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 2,
        allowedRange: [1, 4],
    },

    async execute(args: Record<string, unknown>, context) {
        const query = args.query as string;
        if (!query) {
            return { callId: "", result: null, error: "Query is required" };
        }

        const maxResults = typeof args.maxResults === "number"
            ? Math.min(Math.max(args.maxResults, 1), 100)
            : 10;
        const yearRange = typeof args.yearRange === "string" ? args.yearRange : undefined;
        const cursor = typeof args.cursor === "string" ? args.cursor : undefined;

        try {
            const response = await searchSemanticScholar(query, {
                maxResults,
                yearRange,
                cursor,
                ...(context?.signal ? { signal: context.signal } : {}),
            });
            return { callId: "", result: response };
        } catch (error) {
            if (isAbortLikeError(error)) throw error;
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "Semantic Scholar search failed",
            };
        }
    },
};
