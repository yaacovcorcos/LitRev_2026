import { z } from "zod";
import type { AITool } from "./base";
import type { SearchResult } from "@/types/search";
import { searchResultToStudyInput } from "@/lib/server/search/to-study";
import { findDuplicates } from "@/lib/server/search/dedup";
import { listStudies, upsertStudy } from "@/lib/server/ledger";

const inputSchema = z.object({
    projectId: z.string().min(1, "projectId is required"),
    results: z.array(z.object({
        title: z.string(),
        authors: z.string(),
        year: z.number(),
    }).passthrough()).min(1, "results must not be empty"),
});

const outputSchema = z.object({
    added: z.number(),
    duplicatesSkipped: z.number(),
    titles: z.array(z.string()),
});

export const addToLedgerTool: AITool = {
    definition: {
        name: "add_to_ledger",
        description:
            "Add search results to the project's Evidence Ledger. Only call this after the user has approved which studies to add. Requires a projectId and an array of search results.",
        parameters: {
            type: "object",
            properties: {
                projectId: {
                    type: "string",
                    description: "The project ID to add studies to",
                },
                results: {
                    type: "array",
                    description: "Array of search results to add",
                    items: {
                        type: "object",
                        properties: {
                            pmid: { type: "string" },
                            doi: { type: "string" },
                            title: { type: "string" },
                            authors: { type: "string" },
                            year: { type: "number" },
                            journal: { type: "string" },
                            volume: { type: "string" },
                            issue: { type: "string" },
                            pages: { type: "string" },
                            abstract: { type: "string" },
                            keywords: { type: "array", items: { type: "string" } },
                            source: { type: "string" },
                            sourceUrl: { type: "string" },
                        },
                        required: ["title", "authors", "year"],
                    },
                },
            },
            required: ["projectId", "results"],
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 2,
        allowedRange: [1, 3],
    },

    async execute(args: Record<string, unknown>) {
        const projectId = args.projectId as string;
        const results = args.results as SearchResult[];

        if (!projectId) {
            return { callId: "", result: null, error: "projectId is required" };
        }
        if (!results?.length) {
            return { callId: "", result: null, error: "results array is required and must not be empty" };
        }

        try {
            // Load existing studies for dedup
            const existingStudies = await listStudies(null, projectId);
            const { unique, duplicates } = findDuplicates(existingStudies, results);

            // Upsert unique studies
            const addedTitles: string[] = [];
            for (const result of unique) {
                const studyInput = searchResultToStudyInput(result);
                await upsertStudy(null, projectId, studyInput);
                addedTitles.push(result.title);
            }

            return {
                callId: "",
                result: {
                    added: unique.length,
                    duplicatesSkipped: duplicates.length,
                    titles: addedTitles,
                },
            };
        } catch (error) {
            return {
                callId: "",
                result: null,
                error: error instanceof Error ? error.message : "Failed to add studies to ledger",
            };
        }
    },
};
