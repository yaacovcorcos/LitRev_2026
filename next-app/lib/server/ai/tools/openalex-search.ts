import { z } from "zod";
import type { AITool } from "./base";
import { searchOpenAlex } from "@/lib/server/search/openalex";

const inputSchema = z.object({
    query: z.string().min(1, "Query is required"),
    maxResults: z.number().int().min(1).max(100).optional().default(10),
    yearRange: z.string().optional(),
    cursor: z.string().optional(),
});

const outputSchema = z.object({
    query: z.string(),
    source: z.string(),
    totalResults: z.number(),
    returnedCount: z.number(),
    results: z.array(
        z
            .object({
                title: z.string(),
                authors: z.string(),
                year: z.number(),
            })
            .passthrough()
    ),
    nextCursor: z.string().optional(),
});

export const openAlexSearchTool: AITool = {
    definition: {
        name: "search_openalex",
        description:
            "Search OpenAlex for scholarly works across disciplines (open index of 240M+ papers). Best for broad discovery, cross-disciplinary recall, and non-biomedical literature where PubMed coverage is limited. Returns titles, authors, years, DOIs/PMIDs when available, abstracts, and source links.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search query (keywords, phrase, or topic)",
                },
                maxResults: {
                    type: "number",
                    description: "Maximum results to return (1-100, default 10)",
                },
                yearRange: {
                    type: "string",
                    description: "Year filter, e.g. '2020-2024', '2020-', or '-2023'",
                },
                cursor: {
                    type: "string",
                    description: "OpenAlex cursor for pagination from a previous response",
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

        const maxResults =
            typeof args.maxResults === "number"
                ? Math.min(Math.max(args.maxResults, 1), 100)
                : 10;
        const yearRange = typeof args.yearRange === "string" ? args.yearRange : undefined;
        const cursor = typeof args.cursor === "string" ? args.cursor : undefined;

        try {
            const response = await searchOpenAlex(query, { maxResults, yearRange, cursor });
            return { callId: "", result: response };
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "OpenAlex search failed",
            };
        }
    },
};

