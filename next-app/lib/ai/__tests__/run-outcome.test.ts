import { describe, expect, it } from "vitest";
import { buildFailureFallbackMessage, deriveRunOutcome, type RunFacts } from "@/lib/ai/run-outcome";

const baseFacts: RunFacts = {
    hadFinalAssistantAnswer: false,
    hadSuccessfulToolOrArtifact: false,
    hadDeterministicNonRetryableFailure: false,
    pausedForUserInput: false,
    cancelledByUser: false,
};

describe("deriveRunOutcome", () => {
    it("marks deterministic no-answer failures as failed", () => {
        const outcome = deriveRunOutcome({
            facts: {
                ...baseFacts,
                hadDeterministicNonRetryableFailure: true,
            },
            stopReason: "natural",
        });

        expect(outcome).toEqual({
            runStatus: "failed",
            stopReason: "error",
        });
    });

    it("keeps mixed success runs completed", () => {
        const outcome = deriveRunOutcome({
            facts: {
                ...baseFacts,
                hadSuccessfulToolOrArtifact: true,
                hadDeterministicNonRetryableFailure: true,
            },
            stopReason: "natural",
        });

        expect(outcome).toEqual({
            runStatus: "completed",
            stopReason: "natural",
        });
    });

    it("fails a natural stop when no useful answer or durable output exists", () => {
        const outcome = deriveRunOutcome({
            facts: baseFacts,
            stopReason: "natural",
        });

        expect(outcome).toEqual({
            runStatus: "failed",
            stopReason: "error",
        });
    });

    it("fails loop budget stops when no useful answer or durable output exists", () => {
        const outcome = deriveRunOutcome({
            facts: baseFacts,
            stopReason: "max_iterations",
        });

        expect(outcome).toEqual({
            runStatus: "failed",
            stopReason: "max_iterations",
        });
    });

    it("fails repeat-detected stops when no useful answer or durable output exists", () => {
        const outcome = deriveRunOutcome({
            facts: baseFacts,
            stopReason: "repeat_detected",
        });

        expect(outcome).toEqual({
            runStatus: "failed",
            stopReason: "repeat_detected",
        });
    });

    it("keeps budget stops completed when a final assistant answer exists", () => {
        const outcome = deriveRunOutcome({
            facts: {
                ...baseFacts,
                hadFinalAssistantAnswer: true,
            },
            stopReason: "max_tool_calls",
        });

        expect(outcome).toEqual({
            runStatus: "completed",
            stopReason: "max_tool_calls",
        });
    });

    it("maps paused_for_input to paused run status", () => {
        const outcome = deriveRunOutcome({
            facts: {
                ...baseFacts,
                pausedForUserInput: true,
            },
            stopReason: "paused_for_input",
        });

        expect(outcome).toEqual({
            runStatus: "paused",
            stopReason: "paused_for_input",
        });
    });

    it("maps cancelled runs to cancelled", () => {
        const outcome = deriveRunOutcome({
            facts: {
                ...baseFacts,
                cancelledByUser: true,
            },
            stopReason: "cancelled",
        });

        expect(outcome).toEqual({
            runStatus: "cancelled",
            stopReason: "cancelled",
        });
    });
});

describe("buildFailureFallbackMessage", () => {
    it("produces a stable fallback when no detail exists", () => {
        expect(buildFailureFallbackMessage("")).toBe(
            "I couldn't complete that request because the action failed before I could produce a useful answer.",
        );
    });
});
