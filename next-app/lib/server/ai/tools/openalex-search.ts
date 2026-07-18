import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { searchOpenAlex } from "@/lib/server/search/openalex";
import { isAbortLikeError } from "@/lib/abort";

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
    results: z.array(
        z
            .object({
                title: z.string(),
                authors: z.string(),
                year: z.number().optional(),
            })
            .passthrough()
    ),
    nextCursor: z.string().optional(),
});

export const openAlexSearchTool: AITool = {
    definition: {
        name: "search_openalex",
        description:
            "Search OpenAlex for scholarly works across disciplines. This is not a default biomedical search source: use it only when the user explicitly asks for OpenAlex. Returns titles, authors, publication years when available, DOIs/PMIDs when available, abstracts, and source links.",
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
                    description: "Opaque continuation token from a previous OpenAlex search response",
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

        const maxResults =
            typeof args.maxResults === "number"
                ? Math.min(Math.max(args.maxResults, 1), 100)
                : 10;
        const yearRange = typeof args.yearRange === "string" ? args.yearRange : undefined;
        const cursor = typeof args.cursor === "string" ? args.cursor : undefined;

        try {
            const response = await searchOpenAlex(query, { maxResults, yearRange, cursor, signal: context?.signal });
            return { callId: "", result: response };
        } catch (error) {
            if (context?.signal?.aborted || isAbortLikeError(error)) {
                throw error;
            }
            throw error;
        }
    },
};
