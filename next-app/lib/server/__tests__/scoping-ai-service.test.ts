import { describe, expect, it } from "vitest";
import {
    buildScopingSearchPackPlan,
    finalizeScopingResponse,
    getContextualToolDefinitions,
    getLazyContextPointerCapabilities,
    shouldShowScopingSearchPackPreview,
} from "../ai/ai-service";

describe("scoping ai-service helpers", () => {
    it("hides recommend_studies in scoping mode when no recommendation seeds exist", () => {
        const defs = getContextualToolDefinitions({
            agentMode: "scoping",
            scope: "project",
            studyLedger: {
                counts: { total: 0, included: 0, excluded: 0, maybe: 0, unscreened: 0 },
                list: [],
                truncated: false,
                hasRecommendationSeeds: false,
            },
        });

        const names = defs.map((d) => d.name);
        expect(names).not.toContain("recommend_studies");
    });

    it("hides recommend_studies without explicit Semantic Scholar request even when recommendation seeds exist", () => {
        const defs = getContextualToolDefinitions({
            agentMode: "scoping",
            scope: "project",
            studyLedger: {
                counts: { total: 5, included: 3, excluded: 1, maybe: 1, unscreened: 0 },
                list: [],
                truncated: false,
                hasRecommendationSeeds: true,
            },
        });

        const names = defs.map((d) => d.name);
        expect(names).not.toContain("recommend_studies");
    });

    it("keeps recommend_studies in scoping mode when Semantic Scholar is explicit and recommendation seeds exist", () => {
        const defs = getContextualToolDefinitions({
            agentMode: "scoping",
            scope: "project",
            userMessage: "use Semantic Scholar recommendations for related work",
            studyLedger: {
                counts: { total: 5, included: 3, excluded: 1, maybe: 1, unscreened: 0 },
                list: [],
                truncated: false,
                hasRecommendationSeeds: true,
            },
        });

        const names = defs.map((d) => d.name);
        expect(names).toContain("recommend_studies");
    });

    it("returns true for low-autonomy scoping requests to show a non-blocking search-pack preview", () => {
        const shouldBatch = shouldShowScopingSearchPackPreview({
            agentMode: "scoping",
            userMessage: "What's out there on sepsis biomarker literature?",
            autonomyConfig: { preset: "manual", toolOverrides: {} },
        });
        expect(shouldBatch).toBe(true);
    });

    it("returns false for non-low-autonomy scoping requests", () => {
        const shouldBatch = shouldShowScopingSearchPackPreview({
            agentMode: "scoping",
            userMessage: "What's out there on sepsis biomarker literature?",
            autonomyConfig: { preset: "assisted", toolOverrides: {} },
        });
        expect(shouldBatch).toBe(false);
    });

    it("returns false for simple confirmations, avoiding extra planning loops", () => {
        const shouldBatch = shouldShowScopingSearchPackPreview({
            agentMode: "scoping",
            userMessage: "yes",
            autonomyConfig: { preset: "manual", toolOverrides: {} },
        });
        expect(shouldBatch).toBe(false);
    });

    it("returns false for draft bootstrap requests even in low autonomy", () => {
        const shouldBatch = shouldShowScopingSearchPackPreview({
            agentMode: "scoping",
            userMessage: "Help me write a literature review on omega-3 and cognition",
            autonomyConfig: { preset: "manual", toolOverrides: {} },
            entryIntent: "draft_bootstrap",
        });
        expect(shouldBatch).toBe(false);
    });

    it("builds search-pack plan without recommendations by default", () => {
        const plan = buildScopingSearchPackPlan({ includeRecommendations: false });
        expect(plan.estimatedActions).toBe(4);
        expect(plan.steps.map((s) => s.toolName)).not.toContain("recommend_studies");
        expect(plan.steps.map((s) => s.toolName)).toEqual([
            "search_pubmed",
            "search_pubmed",
            "search_pubmed",
            "search_pubmed",
        ]);
    });

    it("adds explicitly requested non-PubMed sources to the search-pack plan only when policy allows them", () => {
        const plan = buildScopingSearchPackPlan({
            includeRecommendations: false,
            sourcePolicy: {
                allowPubMed: true,
                allowOpenAlex: true,
                allowSemanticScholar: true,
            },
        });

        expect(plan.steps.map((s) => s.toolName)).toEqual([
            "search_pubmed",
            "search_openalex",
            "search_pubmed",
            "search_semantic_scholar",
        ]);
    });

    it("does not add recommendation expansion without explicit Semantic Scholar policy", () => {
        const plan = buildScopingSearchPackPlan({ includeRecommendations: true });
        expect(plan.estimatedActions).toBe(4);
        expect(plan.steps.map((s) => s.toolName)).not.toContain("recommend_studies");
    });

    it("builds search-pack plan with recommendations when Semantic Scholar recommendations are explicit", () => {
        const plan = buildScopingSearchPackPlan({
            includeRecommendations: true,
            sourcePolicy: {
                allowPubMed: true,
                allowOpenAlex: false,
                allowSemanticScholar: true,
            },
        });

        expect(plan.estimatedActions).toBe(5);
        expect(plan.steps.map((s) => s.toolName)).toContain("recommend_studies");
    });

    it("finalizes scoping output into a report payload and hidden comment markup", () => {
        const reportJson = JSON.stringify({
            topic: "Mindfulness and chronic pain",
            searchesRun: [],
            landscape: {
                majorThemes: ["MBSR"],
                evidenceGaps: ["long-term follow-up"],
                methodologicalPatterns: ["RCT-heavy"],
                evidenceDensity: "moderate",
            },
            recommendedQuestions: [
                {
                    question: "Does MBSR improve pain interference in older adults?",
                    rationale: "Clear PICO framing with available trials.",
                    feasibility: "high",
                    novelty: "medium",
                },
            ],
            nextStep: "Choose one question to move into protocol drafting.",
        });

        const result = finalizeScopingResponse({
            agentMode: "scoping",
            fullContent: `Landscape summary\\n<scoping_report>${reportJson}</scoping_report>`,
            userMessage: "What's out there?",
            hasHandoffSelection: false,
            workflowSnapshot: {
                entryIntent: "explore",
                phase: "handoff",
                handoffOffered: false,
                recommendedDefaultQuestionIndex: 1,
            },
        });

        expect(result.report).not.toBeNull();
        expect(result.report?.topic).toContain("Mindfulness");
        expect(result.report?.workflow).toEqual({
            entryIntent: "explore",
            phase: "handoff",
            handoffOffered: false,
            recommendedDefaultQuestionIndex: 1,
        });
        expect(result.content).toContain("<!-- SCOPING_REPORT:");
    });

    it("skips scoping report finalization when handoff is already selected", () => {
        const result = finalizeScopingResponse({
            agentMode: "scoping",
            fullContent: "Proceeding with selected question.",
            userMessage: "question 2",
            hasHandoffSelection: true,
        });

        expect(result.report).toBeNull();
        expect(result.content).toBe("Proceeding with selected question.");
    });

    it("does not advertise lazy-read tools in scoping mode where they are unavailable", () => {
        const caps = getLazyContextPointerCapabilities("scoping");
        expect(caps).toEqual({
            canReadProtocol: false,
            canReadLedger: false,
        });
    });

    it("advertises lazy-read tools in search mode where protocol reads are allowed", () => {
        const caps = getLazyContextPointerCapabilities("search");
        expect(caps).toEqual({
            canReadProtocol: true,
            canReadLedger: false,
        });
    });
});
