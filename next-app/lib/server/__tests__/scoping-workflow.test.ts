import { describe, expect, it } from "vitest";

import type { ToolDefinition } from "@/types/ai";
import {
    applySuccessfulScopingToolResult,
    createInitialScopingWorkflowState,
    deriveScopingIterationToolDefs,
    deriveScopingClarificationPolicy,
    evaluateScopingSearchExecution,
    SCOPING_EXPLORATORY_CAP,
} from "../ai/scoping-workflow";

const TOOL_DEFS: ToolDefinition[] = [
    { name: "search_pubmed", description: "", parameters: {} },
    { name: "search_openalex", description: "", parameters: {} },
    { name: "recommend_studies", description: "", parameters: {} },
    { name: "ask_user", description: "", parameters: {} },
    { name: "store_memory", description: "", parameters: {} },
];

describe("scoping workflow", () => {
    it("starts in discover by default", () => {
        const state = createInitialScopingWorkflowState({
            entryIntent: "explore",
            report: null,
        });

        expect(state).toMatchObject({
            entryIntent: "explore",
            phase: "discover",
            searchCount: 0,
            handoffOffered: false,
        });
    });

    it("hydrates handoff state from prior report metadata", () => {
        const state = createInitialScopingWorkflowState({
            entryIntent: "explore",
            report: {
                topic: "topic",
                searchesRun: [],
                landscape: {
                    majorThemes: [],
                    evidenceGaps: [],
                    methodologicalPatterns: [],
                    evidenceDensity: "moderate",
                },
                recommendedQuestions: [
                    {
                        question: "Question 1",
                        rationale: "Because",
                        feasibility: "high",
                        novelty: "medium",
                    },
                ],
                nextStep: "Pick a question",
                workflow: {
                    entryIntent: "explore",
                    phase: "handoff",
                    handoffOffered: true,
                    recommendedDefaultQuestionIndex: 1,
                },
            },
        });

        expect(state.phase).toBe("handoff");
        expect(state.handoffOffered).toBe(true);
        expect(state.recommendedDefaultQuestionIndex).toBe(1);
    });

    it("removes ask_user in draft bootstrap discover phase", () => {
        const state = createInitialScopingWorkflowState({
            entryIntent: "draft_bootstrap",
            report: null,
        });

        expect(deriveScopingIterationToolDefs(TOOL_DEFS, state).map((tool) => tool.name)).not.toContain("ask_user");
    });

    it("removes exploratory tools in synthesize phase", () => {
        const state = {
            ...createInitialScopingWorkflowState({
                entryIntent: "explore",
                report: null,
            }),
            phase: "synthesize" as const,
            hasEvidence: true,
        };

        expect(deriveScopingIterationToolDefs(TOOL_DEFS, state).map((tool) => tool.name)).toEqual(["store_memory"]);
    });

    it("advances to synthesize when the exploratory cap is reached", () => {
        let state = createInitialScopingWorkflowState({
            entryIntent: "explore",
            report: null,
        });

        for (let index = 0; index < SCOPING_EXPLORATORY_CAP; index++) {
            state = applySuccessfulScopingToolResult(state, "search_pubmed", {
                callId: `tc-${index}`,
                result: { totalResults: 0 },
            });
        }

        expect(state.searchCount).toBe(SCOPING_EXPLORATORY_CAP);
        expect(state.phase).toBe("synthesize");
    });

    it("suppresses extra exploratory searches after the cap", () => {
        const state = {
            ...createInitialScopingWorkflowState({
                entryIntent: "explore",
                report: null,
            }),
            searchCount: SCOPING_EXPLORATORY_CAP,
            hasEvidence: true,
        };

        const decision = evaluateScopingSearchExecution(state, "search_pubmed");
        expect(decision.allow).toBe(false);
        if (!decision.allow) {
            expect(decision.nextState.phase).toBe("synthesize");
        }
    });

    it("suppresses clarifications after evidence is already available", () => {
        const state = {
            ...createInitialScopingWorkflowState({
                entryIntent: "explore",
                report: null,
            }),
            hasEvidence: true,
            phase: "synthesize" as const,
        };

        const decision = deriveScopingClarificationPolicy({
            state,
            userInputRequest: {
                callId: "ask-1",
                question: "Should I narrow to RCTs?",
                questionType: "single_choice",
                options: [{ label: "Yes" }, { label: "No" }],
            },
        });

        expect(decision.policyOverride.allowPause).toBe(false);
        if (decision.policyOverride.allowPause) return;
        expect(decision.policyOverride.correctiveMessage).toContain("Synthesize");
    });
});
