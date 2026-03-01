import { describe, expect, it } from "vitest";
import { buildInterruptedUserMessage } from "@/lib/ai/interruption-context";

describe("buildInterruptedUserMessage", () => {
    it("includes interruption block and new message wrapper", () => {
        const value = buildInterruptedUserMessage({
            previousUserMessage: "Summarize trial A",
            partialAssistantResponse: "Trial A showed better outcomes",
            newUserMessage: "Now compare it to trial B",
        });

        expect(value).toContain("[INTERRUPTION_CONTEXT]");
        expect(value).toContain("Previous user message:");
        expect(value).toContain("Summarize trial A");
        expect(value).toContain("Partial assistant response before interruption:");
        expect(value).toContain("Trial A showed better outcomes");
        expect(value).toContain("[NEW_USER_MESSAGE]");
        expect(value).toContain("Now compare it to trial B");
    });

    it("truncates large prior context", () => {
        const previousUserMessage = "a".repeat(1200);
        const partialAssistantResponse = "b".repeat(2200);

        const value = buildInterruptedUserMessage({
            previousUserMessage,
            partialAssistantResponse,
            newUserMessage: "short",
        });

        expect(value).toContain("…");
        expect(value.length).toBeLessThan(3600);
    });
});
