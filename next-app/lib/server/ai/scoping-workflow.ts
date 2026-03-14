import type { ToolDefinition, ToolResult, UserInputRequest } from "@/types/ai";
import type {
    ScopingEntryIntent,
    ScopingReportPayload,
    ScopingWorkflowPhase,
    ScopingWorkflowSnapshot,
} from "@/types/artifacts";

const EXPLORATORY_SEARCH_TOOL_NAMES = new Set([
    "search_pubmed",
    "search_semantic_scholar",
    "search_openalex",
]);

export const SCOPING_RECOMMENDATION_TOOL_NAME = "recommend_studies";
export const SCOPING_EXPLORATORY_CAP = 4;

export type ScopingWorkflowState = {
    entryIntent: ScopingEntryIntent;
    phase: ScopingWorkflowPhase;
    clarificationCount: number;
    handoffAskCount: number;
    searchCount: number;
    hasEvidence: boolean;
    recommendationExpansionUsed: boolean;
    handoffOffered: boolean;
    recommendedDefaultQuestionIndex?: number;
};

export function isExploratoryScopingToolName(toolName: string): boolean {
    return EXPLORATORY_SEARCH_TOOL_NAMES.has(toolName);
}

export function createInitialScopingWorkflowState(params: {
    entryIntent: ScopingEntryIntent;
    report: ScopingReportPayload | null;
}): ScopingWorkflowState {
    const workflow = params.report?.workflow;
    const recommendedDefaultQuestionIndex =
        workflow?.recommendedDefaultQuestionIndex
            ?? (params.report?.recommendedQuestions.length ? 1 : undefined);
    const shouldEnterHandoffPhase =
        params.report?.recommendedQuestions.length
            ? (workflow?.phase === "handoff" || workflow?.handoffOffered === true)
            : false;

    return {
        entryIntent: workflow?.entryIntent ?? params.entryIntent,
        phase: shouldEnterHandoffPhase ? "handoff" : "discover",
        clarificationCount: 0,
        handoffAskCount: 0,
        searchCount: 0,
        hasEvidence: (params.report?.searchesRun.length ?? 0) > 0,
        recommendationExpansionUsed: false,
        handoffOffered: workflow?.handoffOffered ?? false,
        recommendedDefaultQuestionIndex,
    };
}

export function deriveScopingWorkflowSnapshot(
    state: ScopingWorkflowState,
    report: ScopingReportPayload | null
): ScopingWorkflowSnapshot | undefined {
    if (!report?.recommendedQuestions.length && !state.handoffOffered) {
        return undefined;
    }

    return {
        entryIntent: state.entryIntent,
        phase: report?.recommendedQuestions.length ? "handoff" : state.phase,
        handoffOffered: state.handoffOffered,
        recommendedDefaultQuestionIndex:
            state.recommendedDefaultQuestionIndex
                ?? (report?.recommendedQuestions.length ? 1 : undefined),
    };
}

export function getScopingClarificationBudget(state: ScopingWorkflowState): number {
    return state.entryIntent === "draft_bootstrap" ? 0 : 1;
}

export function buildScopingWorkflowInstruction(state: ScopingWorkflowState): string {
    const intro =
        state.entryIntent === "draft_bootstrap"
            ? "The user wants a broad evidence-led writing bootstrap, not an early narrowing interrogation."
            : "Stay broad and evidence-led before forcing decisions.";

    switch (state.phase) {
        case "discover":
            return [
                "Scoping runtime policy is authoritative for this turn.",
                intro,
                `Use at most ${SCOPING_EXPLORATORY_CAP} exploratory searches in this run before synthesis.`,
                state.entryIntent === "draft_bootstrap"
                    ? "Do not call ask_user before first evidence unless the topic is genuinely impossible to infer."
                    : "Call ask_user before first evidence only for a true hard blocker.",
                "After evidence arrives, stop narrowing through blocking questions and move to synthesis plus a recommended default.",
            ].join(" ");
        case "synthesize":
        case "propose":
            return [
                "Scoping runtime policy is authoritative for this turn.",
                "Do not call ask_user.",
                "Do not run additional exploratory searches.",
                "Synthesize the evidence gathered so far, recommend 1-3 directions, and make the strongest default the first recommendation.",
            ].join(" ");
        case "handoff":
            return [
                "Scoping runtime policy is authoritative for this turn.",
                "Resolve the next step from the existing recommendations.",
                "Prefer the recommended default when the user replies with continue/proceed/yes or a broad assent.",
                "Do not re-ask a blocking handoff question unless there is no safe default and no prior handoff has already been offered.",
            ].join(" ");
    }
}

export function deriveScopingIterationToolDefs(
    modeToolDefs: ToolDefinition[],
    state: ScopingWorkflowState
): ToolDefinition[] {
    return modeToolDefs.filter((tool) => {
        if (state.phase === "discover") {
            if (tool.name === "ask_user") {
                return getScopingClarificationBudget(state) > state.clarificationCount;
            }
            if (tool.name === SCOPING_RECOMMENDATION_TOOL_NAME) {
                return state.hasEvidence && !state.recommendationExpansionUsed;
            }
            return true;
        }

        if (state.phase === "synthesize" || state.phase === "propose") {
            return !isExploratoryScopingToolName(tool.name)
                && tool.name !== SCOPING_RECOMMENDATION_TOOL_NAME
                && tool.name !== "ask_user";
        }

        if (state.phase === "handoff") {
            if (isExploratoryScopingToolName(tool.name) || tool.name === SCOPING_RECOMMENDATION_TOOL_NAME) {
                return false;
            }
            if (tool.name === "ask_user") {
                return state.entryIntent === "explore"
                    && !state.handoffOffered
                    && state.handoffAskCount < 1
                    && state.recommendedDefaultQuestionIndex === undefined;
            }
            return true;
        }

        return true;
    });
}

export function shouldShowScopingSearchPackPreview(params: {
    state: ScopingWorkflowState;
    autonomyConfig: { preset: string; toolOverrides: unknown };
}): boolean {
    return params.state.phase === "discover"
        && params.state.entryIntent === "explore"
        && params.state.searchCount === 0
        && params.autonomyConfig.preset === "manual";
}

export function applySuccessfulScopingToolResult(
    state: ScopingWorkflowState,
    toolName: string,
    toolResult: ToolResult
): ScopingWorkflowState {
    if (toolResult.error) return state;

    if (isExploratoryScopingToolName(toolName)) {
        const nextSearchCount = state.searchCount + 1;
        return {
            ...state,
            phase: nextSearchCount >= SCOPING_EXPLORATORY_CAP ? "synthesize" : state.phase,
            searchCount: nextSearchCount,
            hasEvidence: true,
        };
    }

    if (toolName === SCOPING_RECOMMENDATION_TOOL_NAME) {
        return {
            ...state,
            phase: "synthesize",
            hasEvidence: true,
            recommendationExpansionUsed: true,
        };
    }

    return state;
}

export function evaluateScopingSearchExecution(
    state: ScopingWorkflowState,
    toolName: string
): { allow: true } | { allow: false; nextState: ScopingWorkflowState; toolResult: ToolResult; correctiveMessage: string } {
    if (isExploratoryScopingToolName(toolName)) {
        if (state.phase !== "discover" || state.searchCount >= SCOPING_EXPLORATORY_CAP) {
            const nextState = { ...state, phase: "synthesize" as const };
            return {
                allow: false,
                nextState,
                toolResult: buildSyntheticScopingToolResult(toolName, "search_budget_reached"),
                correctiveMessage:
                    "Scoping search cap reached. Continue with synthesis, recommend a default direction, and do not run more exploratory searches in this turn.",
            };
        }
    }

    if (toolName === SCOPING_RECOMMENDATION_TOOL_NAME) {
        if (!state.hasEvidence || state.recommendationExpansionUsed || state.phase !== "discover") {
            return {
                allow: false,
                nextState: { ...state, phase: "synthesize" as const },
                toolResult: buildSyntheticScopingToolResult(toolName, "recommendation_expansion_skipped"),
                correctiveMessage:
                    "Recommendation expansion is either unavailable or already used. Continue with synthesis and recommended directions from the current evidence.",
            };
        }
    }

    return { allow: true };
}

export function evaluateScopingUserInputRequest(params: {
    state: ScopingWorkflowState;
    userInputRequest: UserInputRequest;
}): { allowPause: true; nextState: ScopingWorkflowState } | {
    allowPause: false;
    nextState: ScopingWorkflowState;
    toolResult: ToolResult;
    correctiveMessage: string;
} {
    const { state } = params;
    const clarificationBudget = getScopingClarificationBudget(state);

    if (state.phase === "discover" && !state.hasEvidence && state.clarificationCount < clarificationBudget) {
        return {
            allowPause: true,
            nextState: {
                ...state,
                clarificationCount: state.clarificationCount + 1,
            },
        };
    }

    if (
        state.phase === "handoff"
        && state.entryIntent === "explore"
        && !state.handoffOffered
        && state.handoffAskCount < 1
        && state.recommendedDefaultQuestionIndex === undefined
    ) {
        return {
            allowPause: true,
            nextState: {
                ...state,
                handoffAskCount: state.handoffAskCount + 1,
                handoffOffered: true,
            },
        };
    }

    const correctiveMessage = !state.hasEvidence
        ? "Do not block for clarification yet. Run a broad first-pass evidence search, then synthesize and recommend a default direction."
        : state.phase === "handoff"
            ? "Do not ask another blocking handoff question. Use the recommended default if needed, state it truthfully, and continue without pausing."
            : "Do not ask another blocking clarification. Synthesize the evidence already gathered, recommend a default direction, and continue without pausing.";

    return {
        allowPause: false,
        nextState: {
            ...state,
            phase: state.hasEvidence ? "synthesize" : state.phase,
            handoffOffered: state.phase === "handoff" ? true : state.handoffOffered,
        },
        toolResult: buildSyntheticScopingToolResult("ask_user", "clarification_suppressed"),
        correctiveMessage,
    };
}

function buildSyntheticScopingToolResult(toolName: string, status: string): ToolResult {
    return {
        callId: `${toolName}-suppressed`,
        result: {
            status,
            source: "scoping_runtime_policy",
        },
    };
}
