import { z } from "zod";
import type { AITool, ToolExecutionContext } from "./base";
import { buildLedgerContext } from "@/lib/ai/prompts/copilot-prompts";
import { computeLedgerCounts, computeStudyLedger } from "@/lib/server/ledger-utils";

const inputSchema = z.object({
  includeStudies: z.boolean().optional().default(true),
});

const outputSchema = z.object({
  counts: z.object({
    total: z.number(),
    included: z.number(),
    excluded: z.number(),
    maybe: z.number(),
    unscreened: z.number(),
  }),
  studies: z.array(z.object({
    id: z.string(),
    title: z.string(),
    authors: z.string(),
    year: z.number(),
    status: z.string(),
    doi: z.string().optional(),
    pmid: z.string().optional(),
  })),
  truncated: z.boolean(),
  hasRecommendationSeeds: z.boolean(),
  ledgerContext: z.string(),
});

export const readLedgerTool: AITool = {
  definition: {
    name: "read_ledger",
    description:
      "Read the evidence ledger on demand. Returns study counts and, by default, a compact list of studies with IDs. " +
      "Use this when you need live ledger state before planning actions.",
    parameters: {
      type: "object",
      properties: {
        includeStudies: {
          type: "boolean",
          description: "Whether to include a compact study list (default true). Set false for counts-only.",
        },
      },
      required: [],
    },
  },
  inputSchema,
  outputSchema,
  autonomy: {
    defaultLevel: 4,
    allowedRange: [4, 4],
    hardCap: 4,
  },
  async execute(args: Record<string, unknown>, context?: ToolExecutionContext) {
    const projectId = context?.projectId;
    if (!projectId) {
      return { callId: "", result: null, error: "No project context available" };
    }

    const includeStudies = args.includeStudies !== false;

    try {
      if (includeStudies) {
        const snapshot = await computeStudyLedger(projectId);
        return {
          callId: "",
          result: {
            counts: snapshot.counts,
            studies: snapshot.list,
            truncated: snapshot.truncated,
            hasRecommendationSeeds: snapshot.hasRecommendationSeeds,
            ledgerContext: buildLedgerContext(snapshot.counts, snapshot.list, snapshot.truncated),
          },
        };
      }

      const counts = await computeLedgerCounts(projectId);
      return {
        callId: "",
        result: {
          counts,
          studies: [],
          truncated: false,
          hasRecommendationSeeds: false,
          ledgerContext: buildLedgerContext(counts),
        },
      };
    } catch (error) {
      return {
        callId: "",
        result: null,
        error: error instanceof Error ? error.message : "Failed to read ledger",
      };
    }
  },
};
