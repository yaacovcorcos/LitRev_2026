import { describe, expect, it } from "vitest";
import {
    getUnconsumedPlanStepStatus,
    isPlanPausedForInput,
    shouldShowPlanFailureMessage,
} from "@/lib/agent/plan-run";

describe("plan-run helpers", () => {
    it("treats paused_for_input as paused", () => {
        expect(isPlanPausedForInput("paused_for_input", "paused")).toBe(true);
        expect(isPlanPausedForInput("paused_for_input", "completed")).toBe(true);
        expect(isPlanPausedForInput("natural", "paused")).toBe(true);
    });

    it("keeps unconsumed steps pending when paused for input", () => {
        expect(getUnconsumedPlanStepStatus("paused_for_input")).toBe("pending");
        expect(getUnconsumedPlanStepStatus("natural")).toBe("skipped");
        expect(getUnconsumedPlanStepStatus("error")).toBe("failed");
    });

    it("does not show failure messaging for paused runs", () => {
        expect(
            shouldShowPlanFailureMessage({
                success: true,
                aborted: false,
                runStatus: "paused",
                stopReason: "paused_for_input",
            }),
        ).toBe(false);
    });

    it("shows failure messaging for non-paused incomplete runs", () => {
        expect(
            shouldShowPlanFailureMessage({
                success: true,
                aborted: false,
                runStatus: "failed",
                stopReason: "error",
            }),
        ).toBe(true);
        expect(
            shouldShowPlanFailureMessage({
                success: true,
                aborted: false,
                runStatus: null,
                stopReason: null,
            }),
        ).toBe(true);
    });
});
