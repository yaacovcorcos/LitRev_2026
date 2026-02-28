import { describe, expect, it } from "vitest";
import { extractReasoningTextsFromDelta } from "@/lib/server/ai/providers/reasoning-delta";

describe("extractReasoningTextsFromDelta", () => {
    it("extracts reasoning from direct provider-specific fields", () => {
        const texts = extractReasoningTextsFromDelta({
            reasoning_content: "First reasoning chunk.",
            thinking: "Second chunk.",
        });

        expect(texts).toEqual(["First reasoning chunk.", "Second chunk."]);
    });

    it("extracts reasoning text from content-part arrays", () => {
        const texts = extractReasoningTextsFromDelta({
            content: [
                { type: "reasoning", text: "Reasoning from part A." },
                { type: "thinking_content", thinking: "Reasoning from part B." },
                { type: "text", text: "Final answer text should be ignored here." },
            ],
        });

        expect(texts).toEqual(["Reasoning from part A.", "Reasoning from part B."]);
    });

    it("returns an empty array for deltas without reasoning fields", () => {
        const texts = extractReasoningTextsFromDelta({
            content: "Regular assistant text delta.",
            tool_calls: [{ id: "call-1" }],
        });

        expect(texts).toEqual([]);
    });
});

