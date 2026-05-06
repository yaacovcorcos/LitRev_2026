import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { searchPubMed } from "@/lib/server/search/pubmed";
import { isAbortLikeError } from "@/lib/abort";

const inputSchema = z.object({
    query: z.string().min(1, "Query is required"),
    maxResults: z.number().int().min(1).max(50).optional().default(10),
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

export const pubmedSearchTool: AITool = {
    definition: {
        name: "search_pubmed",
        description:
            "Search PubMed for biomedical research articles. This is the default search source for literature work. Build predictable queries with Boolean operators (AND, OR, NOT), title/abstract field tags like [tiab], author tags like [au], and validated publication-type filters like randomized controlled trial[pt]. Use MeSH terms only when the heading is known and appropriate. Returns titles, authors, abstracts, DOIs, and PMIDs.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "PubMed search query with Boolean operators and field tags such as [tiab], [au], [pt], and validated MeSH when known",
                },
                maxResults: {
                    type: "number",
                    description: "Maximum number of results to return (1-50, default 10)",
                },
                cursor: {
                    type: "string",
                    description: "Opaque continuation token from a previous PubMed search response",
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

    async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
        const query = args.query as string;
        if (!query) {
            return { callId: "", result: null, error: "Query is required" };
        }

        const maxResults = typeof args.maxResults === "number"
            ? Math.min(Math.max(args.maxResults, 1), 50)
            : 10;
        const cursor = typeof args.cursor === "string" ? args.cursor : undefined;

        try {
            const response = await searchPubMed(query, { maxResults, cursor, signal: context?.signal });
            return { callId: "", result: response };
        } catch (error) {
            if (context?.signal?.aborted || isAbortLikeError(error)) {
                throw error;
            }
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "PubMed search failed",
            };
        }
    },
};
