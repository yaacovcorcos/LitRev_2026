import { z } from "zod";
import type { AITool } from "./base";
import { searchPubMed } from "@/lib/server/search/pubmed";

const inputSchema = z.object({
    query: z.string().min(1, "Query is required"),
    maxResults: z.number().int().min(1).max(50).optional().default(10),
});

const outputSchema = z.object({
    query: z.string(),
    source: z.string(),
    totalResults: z.number(),
    returnedCount: z.number(),
    results: z.array(z.object({
        title: z.string(),
        authors: z.string(),
        year: z.number(),
    }).passthrough()),
    nextCursor: z.string().optional(),
});

export const pubmedSearchTool: AITool = {
    definition: {
        name: "search_pubmed",
        description:
            "Search PubMed for biomedical research articles. Build queries using MeSH terms, Boolean operators (AND, OR, NOT), and field tags like [MeSH], [tiab], [au], [pt]. Example: '\"statin therapy\"[MeSH] AND \"elderly\"[MeSH] AND randomized controlled trial[pt]'. Returns titles, authors, abstracts, DOIs, and PMIDs.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "PubMed search query with MeSH terms, Boolean operators, and field tags",
                },
                maxResults: {
                    type: "number",
                    description: "Maximum number of results to return (1-50, default 10)",
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

    async execute(args: Record<string, unknown>) {
        const query = args.query as string;
        if (!query) {
            return { callId: "", result: null, error: "Query is required" };
        }

        const maxResults = typeof args.maxResults === "number"
            ? Math.min(Math.max(args.maxResults, 1), 50)
            : 10;

        try {
            const response = await searchPubMed(query, { maxResults });
            return { callId: "", result: response };
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "PubMed search failed",
            };
        }
    },
};
