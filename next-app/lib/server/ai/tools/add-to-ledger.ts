import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import type { SearchResult } from "@/types/search";
import {
    hasConcreteSearchResultYear,
    searchResultToStudyInput,
} from "@/lib/server/search/to-study";
import { findDuplicates } from "@/lib/server/search/dedup";
import { listStudies, upsertStudy } from "@/lib/server/ledger";

const inputSchema = z.object({
    results: z.array(z.object({
        title: z.string(),
        authors: z.string(),
        year: z.number().optional(),
    }).passthrough()).min(1, "results must not be empty"),
});

const outputSchema = z.object({
    added: z.number(),
    duplicatesSkipped: z.number(),
    missingYearSkipped: z.number(),
    titles: z.array(z.string()),
    duplicateDetails: z.array(z.object({
        title: z.string(),
        matchedBy: z.string(),
        matchedValue: z.string(),
        existingTitle: z.string(),
    })).optional(),
    missingYearTitles: z.array(z.string()).optional(),
});

export const addToLedgerTool: AITool = {
    definition: {
        name: "add_to_ledger",
        description:
            "Add search results to the project's Evidence Ledger. Only call this after the user has approved which studies to add. Requires an array of search results.",
        parameters: {
            type: "object",
            properties: {
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
                        required: ["title", "authors"],
                    },
                },
            },
            required: ["results"],
        },
    },

    inputSchema,
    outputSchema,

    autonomy: {
        defaultLevel: 3,
        allowedRange: [2, 3],
    },

    async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
        const projectId = (context?.projectId ?? args.projectId) as string;
        const results = args.results as SearchResult[];

        if (!projectId) {
            return { callId: "", result: null, error: "No project context available" };
        }
        if (!results?.length) {
            return { callId: "", result: null, error: "results array is required and must not be empty" };
        }

        try {
            // Load existing studies for dedup
            const existingStudies = await listStudies(undefined, projectId);
            const { unique, duplicates } = findDuplicates(existingStudies, results);
            const yearless = unique.filter((result) => !hasConcreteSearchResultYear(result));
            const ledgerEligible = unique.filter(hasConcreteSearchResultYear);

            // Upsert only results with a trustworthy numeric year.
            const addedTitles: string[] = [];
            for (const result of ledgerEligible) {
                const studyInput = searchResultToStudyInput(result);
                await upsertStudy(undefined, projectId, studyInput);
                addedTitles.push(result.title);
            }

            return {
                callId: "",
                result: {
                    added: ledgerEligible.length,
                    duplicatesSkipped: duplicates.length,
                    missingYearSkipped: yearless.length,
                    titles: addedTitles,
                    duplicateDetails: duplicates.map((d) => ({
                        title: d.result.title,
                        matchedBy: d.matchedBy,
                        matchedValue: d.matchedValue,
                        existingTitle: d.existingTitle,
                    })),
                    missingYearTitles: yearless.length > 0
                        ? yearless.map((result) => result.title)
                        : undefined,
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
