import { describe, expect, it } from "vitest";

import {
    buildPrimaryUserInputQuestionId,
    resolveUserInputQuestionId,
} from "@/lib/ai/user-input";

describe("user-input helpers", () => {
    it("builds a stable primary question id from the call id", () => {
        expect(buildPrimaryUserInputQuestionId("ask-1")).toBe("ask-1:question-1");
    });

    it("prefers an explicit question id when present", () => {
        expect(resolveUserInputQuestionId("question-42", "ask-1")).toBe("question-42");
    });

    it("falls back to the primary question id when the stored value is absent or blank", () => {
        expect(resolveUserInputQuestionId(undefined, "ask-1")).toBe("ask-1:question-1");
        expect(resolveUserInputQuestionId("   ", "ask-1")).toBe("ask-1:question-1");
    });
});
