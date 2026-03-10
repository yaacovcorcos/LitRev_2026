import { describe, expect, it } from "vitest";

import { buildScopingSearchPackPlan } from "@/lib/server/ai/tool-helpers";
import { buildExecutablePlanPayload, isExecutablePlanPayload } from "@/lib/server/agent/plan-payloads";
import type { PlanPayload } from "@/types/artifacts";

describe("buildExecutablePlanPayload", () => {
    it("adds execution metadata from artifact creation context", () => {
        const basePlan: PlanPayload = {
            steps: [
                { label: "Search", toolName: "search_pubmed", status: "pending" },
                { label: "Screen", toolName: "bulk_screening", status: "pending" },
            ],
            estimatedActions: 2,
        };

        const payload = buildExecutablePlanPayload(basePlan, {
            originAgentMode: "search",
            conversationId: "conv-1",
            projectId: "proj-1",
        });

        expect(payload.execution).toEqual({
            originAgentMode: "search",
            allowedToolNames: ["search_pubmed", "bulk_screening"],
            createdFromConversationId: "conv-1",
            createdFromProjectId: "proj-1",
            enforceOrder: true,
        });
    });

    it("deduplicates allowed tool names while preserving first-seen order", () => {
        const basePlan: PlanPayload = {
            steps: [
                { label: "Search 1", toolName: "search_pubmed", status: "pending" },
                { label: "Search 2", toolName: "search_pubmed", status: "pending" },
                { label: "Screen", toolName: "bulk_screening", status: "pending" },
            ],
            estimatedActions: 3,
        };

        const payload = buildExecutablePlanPayload(basePlan, {
            originAgentMode: "general",
            conversationId: null,
            projectId: null,
        });

        expect(payload.execution?.allowedToolNames).toEqual(["search_pubmed", "bulk_screening"]);
    });

    it("can author execution metadata for non-planner scoping search-pack plans", () => {
        const basePlan = buildScopingSearchPackPlan({ includeRecommendations: true });

        const payload = buildExecutablePlanPayload(basePlan, {
            originAgentMode: "scoping",
            conversationId: "conv-scope",
            projectId: "proj-scope",
        });

        expect(payload.execution).toEqual({
            originAgentMode: "scoping",
            allowedToolNames: ["search_pubmed", "search_openalex", "recommend_studies"],
            createdFromConversationId: "conv-scope",
            createdFromProjectId: "proj-scope",
            enforceOrder: true,
        });
    });
});

describe("isExecutablePlanPayload", () => {
    it("returns true only when execution metadata exists", () => {
        const advisory: PlanPayload = {
            steps: [{ label: "Search", toolName: "search_pubmed", status: "pending" }],
            estimatedActions: 1,
        };
        const executable = buildExecutablePlanPayload(advisory, {
            originAgentMode: "search",
            conversationId: "conv-1",
            projectId: "proj-1",
        });

        expect(isExecutablePlanPayload(advisory)).toBe(false);
        expect(isExecutablePlanPayload(executable)).toBe(true);
    });
});
